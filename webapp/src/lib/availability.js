import { supabase } from './supabase'

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/** @typedef {{ start: string, end: string }} DayWindow */
/** @typedef {{ mode: 'calendar', default: DayWindow, dates: Record<string, DayWindow|null> }} CalendarSchedule */

/** Пустой календарь с дефолтными часами */
export function createEmptySchedule() {
  return {
    mode: 'calendar',
    default: { start: '09:00', end: '20:00', buffer_min: 10, whole_hours: false },
    dates: {},
  }
}

export function dateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseHm(hm) {
  if (!hm || typeof hm !== 'string') return null
  const [h, m] = hm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

export function dayKeyFromDate(date) {
  return DAY_KEYS[date.getDay()]
}

/** Старый формат пн–сб — для миграции */
export const LEGACY_DEFAULT_WEEK = {
  mon: { start: '09:00', end: '20:00' },
  tue: { start: '09:00', end: '20:00' },
  wed: { start: '09:00', end: '20:00' },
  thu: { start: '09:00', end: '20:00' },
  fri: { start: '09:00', end: '20:00' },
  sat: { start: '09:00', end: '20:00' },
  sun: null,
}

function dayOffset(offset = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d
}

/** Конвертация старого weekly → календарь на 8 недель вперёд */
function migrateWeekdayToCalendar(weekHours) {
  const schedule = createEmptySchedule()
  for (let i = 0; i < 56; i += 1) {
    const d = dayOffset(i)
    const key = dateKey(d)
    const w = weekHours[dayKeyFromDate(d)]
    if (w?.start && w?.end) {
      schedule.dates[key] = { start: String(w.start), end: String(w.end) }
    }
  }
  return schedule
}

export function normalizeSchedule(raw) {
  if (raw?.mode === 'calendar' && raw.dates && typeof raw.dates === 'object') {
    const buffer = Number(raw.default?.buffer_min)
    return {
      mode: 'calendar',
      default: {
        start: raw.default?.start || '09:00',
        end: raw.default?.end || '20:00',
        buffer_min: Number.isFinite(buffer) ? Math.max(0, Math.min(60, buffer)) : 10,
        whole_hours: Boolean(raw.default?.whole_hours),
      },
      dates: { ...raw.dates },
    }
  }
  if (raw && (raw.mon !== undefined || raw.tue !== undefined)) {
    return migrateWeekdayToCalendar(raw)
  }
  // Нет сохранённого графика — не подставлять 09–20 (иначе клиент видит чужие часы)
  return createEmptySchedule()
}

export function isWorkingDay(schedule, date) {
  const entry = schedule.dates[dateKey(date)]
  return Boolean(entry?.start && entry?.end)
}

/** Окно приёма на конкретную дату или null */
export function getWindowForDate(schedule, date) {
  const normalized = normalizeSchedule(schedule)
  const entry = normalized.dates[dateKey(date)]
  if (!entry) return null
  if (entry === null) return null
  if (entry.start && entry.end) return { start: entry.start, end: entry.end }
  return null
}

export function toggleCalendarDay(schedule, date) {
  const key = dateKey(date)
  const next = normalizeSchedule(schedule)
  if (isWorkingDay(next, date)) {
    const copy = { ...next.dates }
    delete copy[key]
    return { ...next, dates: copy }
  }
  return {
    ...next,
    dates: { ...next.dates, [key]: { ...next.default } },
  }
}

export function setDefaultHours(schedule, start, end) {
  const next = normalizeSchedule(schedule)
  next.default = { ...next.default, start, end }
  // Обновляем все уже отмеченные дни — иначе клиент видит старые часы
  const dates = { ...next.dates }
  for (const [key, entry] of Object.entries(dates)) {
    if (entry?.start && entry?.end) {
      dates[key] = { ...entry, start, end }
    }
  }
  next.dates = dates
  return next
}

export function setDefaultBuffer(schedule, bufferMin) {
  const next = normalizeSchedule(schedule)
  const buf = Math.max(0, Math.min(60, Number(bufferMin) || 0))
  next.default = { ...next.default, buffer_min: buf }
  return next
}

/** Только старт в :00 (16:00, 17:00…) — для сессии+перерыв = час. */
export function setWholeHours(schedule, enabled) {
  const next = normalizeSchedule(schedule)
  next.default = { ...next.default, whole_hours: Boolean(enabled) }
  return next
}

export function isWholeHoursSchedule(schedule) {
  return Boolean(normalizeSchedule(schedule).default?.whole_hours)
}

/** Шаг слотов с учётом «целых часов». */
export function resolveSlotStepMin(durationMin, schedule) {
  if (isWholeHoursSchedule(schedule)) return 60
  const d = Number(durationMin) || 60
  return Math.min(30, Math.max(15, d))
}

/** Первая минута дня, выровненная под целые часы. */
export function alignSlotCursorMin(startMin, schedule) {
  const t = Number(startMin) || 0
  if (!isWholeHoursSchedule(schedule)) return t
  if (t % 60 === 0) return t
  return Math.ceil(t / 60) * 60
}

export function setDayHours(schedule, date, start, end) {
  const next = normalizeSchedule(schedule)
  const key = dateKey(date)
  if (!isWorkingDay(next, date)) return next
  next.dates = {
    ...next.dates,
    [key]: { start, end, buffer_min: next.dates[key]?.buffer_min },
  }
  return next
}

export function getDayEntry(schedule, date) {
  const normalized = normalizeSchedule(schedule)
  return normalized.dates[dateKey(date)] || null
}

/** Следующие N календарных дней (с сегодня) */
export function fillNextDays(schedule, count = 14) {
  const next = normalizeSchedule(schedule)
  const dates = { ...next.dates }
  for (let i = 0; i < count; i += 1) {
    const d = dayOffset(i)
    dates[dateKey(d)] = { ...next.default }
  }
  return { ...next, dates }
}

/** Пн–Пт на N недель вперёд */
export function fillWeekdays(schedule, weeks = 4) {
  const next = normalizeSchedule(schedule)
  const dates = { ...next.dates }
  const total = weeks * 7
  for (let i = 0; i < total; i += 1) {
    const d = dayOffset(i)
    const dow = d.getDay()
    if (dow >= 1 && dow <= 5) {
      dates[dateKey(d)] = { ...next.default }
    }
  }
  return { ...next, dates }
}

export function clearAllDays(schedule) {
  const next = normalizeSchedule(schedule)
  return { ...next, dates: {} }
}

export function calendarMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  let startPad = first.getDay() - 1
  if (startPad < 0) startPad = 6
  const cells = []
  for (let i = 0; i < startPad; i += 1) cells.push(null)
  for (let d = 1; d <= last.getDate(); d += 1) {
    cells.push(new Date(year, month, d))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return { cells, weekdayLabels: WEEKDAY_LABELS }
}

export const CALENDAR_PRESETS = {
  next14: { label: '14 дней подряд', fn: (s) => fillNextDays(s, 14) },
  weekdays4: { label: 'Пн–Пт · 4 недели', fn: (s) => fillWeekdays(s, 4) },
  clear: { label: 'Очистить', fn: (s) => clearAllDays(s) },
}

/** @deprecated use normalizeSchedule */
export const DEFAULT_WORK_HOURS = LEGACY_DEFAULT_WEEK
export function normalizeWorkHours(raw) {
  return normalizeSchedule(raw)
}

/** Слот целиком внутри окна работы на этот день */
export function isWithinWorkWindow(schedule, startsAt, endsAt) {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt)
  const end = endsAt instanceof Date ? endsAt : new Date(endsAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
  const window = getWindowForDate(schedule, start)
  if (!window) return false
  const startMin = parseHm(window.start)
  const endMin = parseHm(window.end)
  if (startMin == null || endMin == null || endMin <= startMin) return false
  const s = start.getHours() * 60 + start.getMinutes()
  const e = end.getHours() * 60 + end.getMinutes()
  if (end.getDate() !== start.getDate() || end.getMonth() !== start.getMonth()) return false
  return s >= startMin && e <= endMin
}

export async function fetchMemberAvailability(masterId) {
  const fallback = { schedule: createEmptySchedule(), timezone: 'Europe/Moscow' }
  if (!masterId || !supabase) return fallback

  const { data, error } = await supabase
    .from('business_members')
    .select('work_hours, businesses(timezone)')
    .eq('profile_id', masterId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (error) {
    if (/work_hours/i.test(String(error.message || ''))) return fallback
    console.warn('availability:', error.message)
    return fallback
  }

  return {
    schedule: normalizeSchedule(data?.work_hours),
    timezone: data?.businesses?.timezone || 'Europe/Moscow',
  }
}

export async function updateMemberSchedule(masterId, schedule) {
  if (!masterId || !supabase) {
    return { ok: false, error: 'Нет подключения' }
  }
  const normalized = normalizeSchedule(schedule)
  const { error } = await supabase
    .from('business_members')
    .update({ work_hours: normalized })
    .eq('profile_id', masterId)

  if (error) {
    if (/work_hours/i.test(String(error.message || ''))) {
      return {
        ok: false,
        error: 'Колонка work_hours не найдена. Выполните migration_availability.sql в Supabase.',
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, schedule: normalized }
}

/** @deprecated */
export async function updateMemberWorkHours(masterId, workHours) {
  return updateMemberSchedule(masterId, workHours)
}
