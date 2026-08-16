import { supabase } from './supabase'
import {
  fetchMemberAvailability,
  getWindowForDate,
  normalizeSchedule,
  parseHm,
  isWithinWorkWindow,
  alignSlotCursorMin,
  isWholeHoursSchedule,
  resolveSlotStepMin,
} from './availability'
import { isClientBlocked } from './clientNotes'
import { assertClientCanModifyBooking } from './bookingModify'

/** Сколько дней вперёд показываем в записи / переносе / поиске слотов */
export const BOOKING_DAY_HORIZON = 14

/** Дата «сегодня + offset дней» в локальной зоне, без времени */
export function dayOffset(offset = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d
}

/** Локальная полночь для произвольной даты */
export function startOfDay(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function sameDay(a, b) {
  if (!a || !b) return false
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Сколько календарных дней от a до b (полночь), может быть отрицательным */
export function daysBetween(a, b) {
  const from = startOfDay(a).getTime()
  const to = startOfDay(b).getTime()
  return Math.round((to - from) / 86400000)
}

export function bookingDayRange(horizon = BOOKING_DAY_HORIZON) {
  return Array.from({ length: horizon }, (_, i) => dayOffset(i))
}

export function formatDayLabel(date) {
  return date.toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function formatSlotLabel(date) {
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export async function fetchBusyIntervals(masterId, dayStart, dayEnd, defaultBufferMin = 0) {
  if (!masterId || !supabase) return []

  let { data, error } = await supabase
    .from('bookings')
    .select('starts_at, ends_at, status, services(buffer_min)')
    .eq('master_id', masterId)
    .in('status', ['pending', 'confirmed', 'completed'])
    .lt('starts_at', dayEnd.toISOString())
    .gt('ends_at', dayStart.toISOString())

  if (error && /buffer_min/i.test(String(error.message || ''))) {
    ;({ data, error } = await supabase
      .from('bookings')
      .select('starts_at, ends_at, status')
      .eq('master_id', masterId)
      .in('status', ['pending', 'confirmed', 'completed'])
      .lt('starts_at', dayEnd.toISOString())
      .gt('ends_at', dayStart.toISOString()))
  }

  if (error) {
    console.warn('Не удалось загрузить занятость:', error.message)
    return []
  }

  return (data ?? []).map((b) => ({
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    buffer_min: b.services?.buffer_min ?? defaultBufferMin,
  }))
}

function overlaps(start, end, busy) {
  return busy.some((b) => {
    const bStart = new Date(b.starts_at).getTime()
    const bEnd = new Date(b.ends_at).getTime()
    const buf = (Number(b.buffer_min) || 0) * 60_000
    return start.getTime() < bEnd + buf && end.getTime() > bStart
  })
}

export async function buildDaySlots(
  masterId,
  day,
  durationMin,
  availability = null,
  serviceBufferMin = 0,
) {
  const avail = availability || (await fetchMemberAvailability(masterId))
  const schedule = normalizeSchedule(avail.schedule || avail.workHours)
  const window = getWindowForDate(schedule, day)
  const scheduleBuffer = Number(schedule.default?.buffer_min) || 0
  const bufferMin = Math.max(Number(serviceBufferMin) || 0, scheduleBuffer)

  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(day)
  dayEnd.setHours(23, 59, 59, 999)

  if (!window) return []

  const startMin = parseHm(window.start)
  const endMin = parseHm(window.end)
  if (startMin == null || endMin == null || endMin <= startMin) return []

  const busy = await fetchBusyIntervals(masterId, dayStart, dayEnd, bufferMin)
  const slots = []
  const now = Date.now()
  const step = resolveSlotStepMin(durationMin, schedule)
  const dur = Number(durationMin) || 60
  let t = alignSlotCursorMin(startMin, schedule)

  for (; t + dur <= endMin; t += step) {
    const start = new Date(day)
    start.setHours(Math.floor(t / 60), t % 60, 0, 0)
    const end = new Date(start.getTime() + dur * 60_000)
    const blockEnd = new Date(end.getTime() + bufferMin * 60_000)
    if (start.getTime() <= now) continue
    if (overlaps(start, blockEnd, busy)) continue
    slots.push({ start, end, label: formatSlotLabel(start) })
  }

  return slots
}

export async function findFirstDayWithSlots(
  masterId,
  durationMin,
  maxDays = BOOKING_DAY_HORIZON,
  serviceBufferMin = 0,
) {
  for (let i = 0; i < maxDays; i += 1) {
    const day = dayOffset(i)
    const list = await buildDaySlots(masterId, day, durationMin, null, serviceBufferMin)
    if (list.length) return { dayIndex: i, day, slots: list }
  }
  return { dayIndex: 0, day: dayOffset(0), slots: [] }
}

export async function findNextAvailableSlot(
  masterId,
  durationMin,
  maxDays = BOOKING_DAY_HORIZON,
  serviceBufferMin = 0,
) {
  for (let i = 0; i < maxDays; i += 1) {
    const day = dayOffset(i)
    const list = await buildDaySlots(masterId, day, durationMin, null, serviceBufferMin)
    if (list.length) {
      return {
        slot: list[0],
        day,
        dayIndex: i,
        label: `${formatDayLabel(day)} · ${list[0].label}`,
      }
    }
  }
  return null
}

/** Заполненность дня: bookedMinutes / capacityMinutes */
export async function computeDayFillRate(masterId, day = dayOffset(0)) {
  const avail = await fetchMemberAvailability(masterId)
  const schedule = normalizeSchedule(avail.schedule)
  const window = getWindowForDate(schedule, day)
  if (!window) return { percent: 0, booked: 0, capacity: 0 }

  const startMin = parseHm(window.start)
  const endMin = parseHm(window.end)
  if (startMin == null || endMin == null || endMin <= startMin) {
    return { percent: 0, booked: 0, capacity: 0 }
  }

  const capacity = endMin - startMin
  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(day)
  dayEnd.setHours(23, 59, 59, 999)

  const busy = await fetchBusyIntervals(
    masterId,
    dayStart,
    dayEnd,
    schedule.default?.buffer_min || 0,
  )

  let booked = 0
  for (const b of busy) {
    const s = new Date(b.starts_at)
    const e = new Date(b.ends_at)
    const buf = Number(b.buffer_min) || 0
    const bStart = s.getHours() * 60 + s.getMinutes()
    const bEnd = e.getHours() * 60 + e.getMinutes() + buf
    booked += Math.max(0, Math.min(bEnd, endMin) - Math.max(bStart, startMin))
  }

  const percent = capacity > 0 ? Math.round((booked / capacity) * 100) : 0
  return { percent: Math.min(100, percent), booked, capacity }
}

export async function createBooking({
  masterId,
  businessId = null,
  serviceId,
  startsAt,
  endsAt,
  priceCents,
  currency = 'RUB',
  clientTelegramId = null,
  locationId = null,
}) {
  if (!supabase) {
    return { ok: false, error: 'Нет подключения к Supabase' }
  }

  if (clientTelegramId && (await isClientBlocked(masterId, clientTelegramId))) {
    return { ok: false, error: 'Запись недоступна' }
  }

  const avail = await fetchMemberAvailability(masterId)
  if (!isWithinWorkWindow(avail.schedule, startsAt, endsAt)) {
    return { ok: false, error: 'Это время вне часов работы мастера' }
  }
  if (isWholeHoursSchedule(avail.schedule) && startsAt.getMinutes() !== 0) {
    return { ok: false, error: 'Мастер принимает только в целые часы (16:00, 17:00…)' }
  }

  const row = {
    master_id: masterId,
    service_id: serviceId,
    status: 'pending',
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    price_cents: priceCents,
    currency,
    client_telegram_id: clientTelegramId,
  }
  if (businessId) row.business_id = businessId
  if (locationId) row.location_id = locationId

  const { data, error } = await supabase
    .from('bookings')
    .insert(row)
    .select('id, starts_at, status')
    .single()

  if (error) {
    if (/location_id/i.test(String(error.message || ''))) {
      delete row.location_id
      const retry = await supabase
        .from('bookings')
        .insert(row)
        .select('id, starts_at, status')
        .single()
      if (retry.error) return { ok: false, error: retry.error.message }
      return { ok: true, booking: retry.data }
    }
    return { ok: false, error: error.message }
  }

  return { ok: true, booking: data }
}

export async function rescheduleBooking({
  bookingId,
  startsAt,
  endsAt,
  clientTelegramId = null,
  masterId = null,
}) {
  if (!bookingId || !supabase) {
    return { ok: false, error: 'Нет id' }
  }

  if (clientTelegramId) {
    const gate = await assertClientCanModifyBooking(bookingId, clientTelegramId)
    if (!gate.ok) return gate
    if (!masterId) masterId = gate.booking?.master_id || null
  }

  let checkMasterId = masterId
  if (!checkMasterId) {
    const { data: row } = await supabase
      .from('bookings')
      .select('master_id')
      .eq('id', bookingId)
      .maybeSingle()
    checkMasterId = row?.master_id || null
  }
  if (checkMasterId) {
    const avail = await fetchMemberAvailability(checkMasterId)
    if (!isWithinWorkWindow(avail.schedule, startsAt, endsAt)) {
      return { ok: false, error: 'Это время вне часов работы мастера' }
    }
    if (isWholeHoursSchedule(avail.schedule) && startsAt.getMinutes() !== 0) {
      return { ok: false, error: 'Мастер принимает только в целые часы (16:00, 17:00…)' }
    }
  }

  const run = async (body) => {
    let query = supabase.from('bookings').update(body).eq('id', bookingId)
    if (clientTelegramId) query = query.eq('client_telegram_id', clientTelegramId)
    return query.select('id, starts_at, master_id, business_id').maybeSingle()
  }

  const full = {
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    rescheduled_from: new Date().toISOString(),
    status: 'pending',
    client_confirmed: false,
    reminded_24h: false,
    reminded_2h: false,
    master_notified: false,
    notify_kind: 'rescheduled',
    notify_sent: false,
  }
  let { data, error } = await run(full)
  if (
    error &&
    /notify_|client_confirmed|rescheduled_from/i.test(String(error.message || ''))
  ) {
    ;({ data, error } = await run({
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: 'pending',
      reminded_24h: false,
      reminded_2h: false,
      master_notified: false,
    }))
  }

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Запись не найдена' }
  return { ok: true, booking: data }
}

export async function confirmClientBooking(bookingId, clientTelegramId) {
  if (!bookingId || !supabase) return { ok: false }
  const { error } = await supabase
    .from('bookings')
    .update({ client_confirmed: true, status: 'confirmed' })
    .eq('id', bookingId)
    .eq('client_telegram_id', clientTelegramId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
