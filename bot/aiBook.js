/**
 * NL-запись через бота: слоты только из БД → кнопки времени.
 * AI не выдумывает окна.
 */

import { getBotSupabase } from './supabaseBot.js'
import {
  alignSlotCursorMin,
  fetchMemberSchedule,
  getWindowForDate,
  isWholeHoursSchedule,
  isWithinWorkWindow,
  parseHm,
  resolveSlotStepMin,
} from './availability.js'
import { formatWhenRu } from './timeFormat.js'

const MODEL = 'gemini-3.5-flash'

function getSupabase() {
  return getBotSupabase({ write: false })
}

function getWriteSupabase() {
  return getBotSupabase({ write: true })
}

export function looksLikeSlotQuestion(text) {
  const t = String(text || '').toLowerCase().trim()
  if (!t || t.length > 280) return false
  if (t.startsWith('/')) return false
  const cues =
    /(есть|свобод|окно|окна|слот|запис|когда|завтра|сегодня|послезавтра|утром|вечером|после\s*\d|до\s*\d|\d{1,2}\s*[:.]\s*\d{2}|\d{1,2}\s*час)/i
  return cues.test(t)
}

function dayAt(offset) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d
}

/** Грубая разборка NL без AI */
export function parseSlotIntent(text) {
  const t = String(text || '').toLowerCase()
  let dayOffset = 0
  if (/послезавтра/.test(t)) dayOffset = 2
  else if (/завтра/.test(t)) dayOffset = 1
  else if (/сегодня/.test(t)) dayOffset = 0
  else if (/пн|понедельник/.test(t)) dayOffset = weekdayOffset(1)
  else if (/вт|вторник/.test(t)) dayOffset = weekdayOffset(2)
  else if (/ср|сред/.test(t)) dayOffset = weekdayOffset(3)
  else if (/чт|четверг/.test(t)) dayOffset = weekdayOffset(4)
  else if (/пт|пятниц/.test(t)) dayOffset = weekdayOffset(5)
  else if (/сб|суббот/.test(t)) dayOffset = weekdayOffset(6)
  else if (/вс|воскресен/.test(t)) dayOffset = weekdayOffset(0)

  let afterHour = null
  let beforeHour = null
  const after = t.match(/после\s*(\d{1,2})/)
  const before = t.match(/до\s*(\d{1,2})/)
  const around = t.match(/(?:в|к)\s*(\d{1,2})(?:\s*[:.]\s*(\d{2}))?/)
  if (after) afterHour = Math.min(23, Number(after[1]))
  if (before) beforeHour = Math.min(23, Number(before[1]))
  if (/утром|утро/.test(t)) {
    afterHour = afterHour ?? 10
    beforeHour = beforeHour ?? 13
  }
  if (/днём|днем|обед/.test(t)) {
    afterHour = afterHour ?? 12
    beforeHour = beforeHour ?? 16
  }
  if (/вечером|вечер/.test(t)) {
    afterHour = afterHour ?? 16
    beforeHour = beforeHour ?? 20
  }
  if (around && afterHour == null && beforeHour == null) {
    const h = Number(around[1])
    afterHour = Math.max(0, h - 1)
    beforeHour = Math.min(23, h + 2)
  }

  // Если день не указан явно — смотрим сегодня+завтра
  const multiDay = !hasExplicitDay(t)

  return {
    dayOffset,
    dayOffsets: multiDay ? [0, 1] : [dayOffset],
    afterHour,
    beforeHour,
  }
}

/** В тексте явно назван день (сегодня / завтра / пн…). */
export function hasExplicitDay(text) {
  const t = String(text || '').toLowerCase()
  if (!t.trim()) return false
  return /(сегодня|завтра|послезавтра|понедельник|вторник|сред|четверг|пятниц|суббот|воскресен|\bпн\b|\bвт\b|\bср\b|\bчт\b|\bпт\b|\bсб\b|\bвс\b)/.test(
    t,
  )
}

export function dayOffsetToQuery(offset) {
  const n = Number(offset)
  if (n === 0) return 'сегодня'
  if (n === 1) return 'завтра'
  if (n === 2) return 'послезавтра'
  return `день:${n}`
}

function weekdayOffset(targetDow) {
  const now = new Date()
  const cur = now.getDay()
  let delta = (targetDow - cur + 7) % 7
  if (delta === 0) delta = 7
  return delta
}

function overlaps(start, end, busy) {
  return busy.some((b) => {
    const bStart = new Date(b.starts_at).getTime()
    const bEnd = new Date(b.ends_at).getTime()
    return start.getTime() < bEnd && end.getTime() > bStart
  })
}

export async function listServicesForSlug(slug = 'demo') {
  const supabase = getSupabase()
  if (!supabase) return []

  const { data: business } = await supabase
    .from('businesses')
    .select('id, owner_profile_id')
    .eq('slug', slug)
    .maybeSingle()

  if (business?.id) {
    const orParts = [`business_id.eq.${business.id}`]
    if (business.owner_profile_id) {
      orParts.push(`master_id.eq.${business.owner_profile_id}`)
    }
    const { data, error } = await supabase
      .from('services')
      .select('id, title, duration_min, price_cents, currency, master_id, business_id')
      .eq('is_active', true)
      .or(orParts.join(','))
      .order('sort_order', { ascending: true })
      .order('title')
      .limit(20)
    if (error) {
      console.warn('listServicesForSlug:', error.message)
      return []
    }
    return data || []
  }

  const { data: legacy } = await supabase
    .from('profiles')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (!legacy?.id) return []

  const { data, error } = await supabase
    .from('services')
    .select('id, title, duration_min, price_cents, currency, master_id, business_id')
    .eq('master_id', legacy.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('title')
    .limit(20)
  if (error) {
    console.warn('listServicesForSlug legacy:', error.message)
    return []
  }
  return data || []
}

function pickService(services, serviceId) {
  if (!services?.length) return null
  if (serviceId) {
    const sid = String(serviceId)
    const exact = services.find((s) => s.id === sid)
    if (exact) return exact
    const byPrefix = services.find((s) => String(s.id).startsWith(sid))
    if (byPrefix) return byPrefix
  }
  return services[0]
}

export async function resolveMaster(slug = 'demo', { serviceId = null } = {}) {
  const supabase = getSupabase()
  if (!supabase) return null

  const { data: business } = await supabase
    .from('businesses')
    .select('id, slug, name, owner_profile_id')
    .eq('slug', slug)
    .maybeSingle()

  if (business?.owner_profile_id) {
    const services = await listServicesForSlug(slug)
    const service = pickService(services, serviceId)
    return {
      masterId: business.owner_profile_id,
      businessId: business.id,
      businessName: business.name,
      slug: business.slug,
      service: service || null,
      services,
    }
  }

  const { data: legacy } = await supabase
    .from('profiles')
    .select('id, slug, business_name, full_name')
    .eq('slug', slug)
    .maybeSingle()

  if (!legacy) return null

  const services = await listServicesForSlug(slug)
  const service = pickService(services, serviceId)

  return {
    masterId: legacy.id,
    businessId: service?.business_id || null,
    businessName: legacy.business_name || legacy.full_name || slug,
    slug: legacy.slug,
    service: service || null,
    services,
  }
}

async function freeSlotsForDays(masterId, durationMin, dayOffsets) {
  const supabase = getSupabase()
  if (!supabase || !masterId) return []

  const schedule = await fetchMemberSchedule(masterId)
  const slots = []
  const now = Date.now()
  const dur = Number(durationMin) || 60
  const step = resolveSlotStepMin(dur, schedule)

  for (const offset of dayOffsets) {
    const day = dayAt(offset)
    const window = getWindowForDate(schedule, day)
    if (!window) continue

    const startMin = parseHm(window.start)
    const endMin = parseHm(window.end)
    if (startMin == null || endMin == null || endMin <= startMin) continue

    const dayStart = new Date(day)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(day)
    dayEnd.setHours(23, 59, 59, 999)

    const { data: busy } = await supabase
      .from('bookings')
      .select('starts_at, ends_at, status')
      .eq('master_id', masterId)
      .in('status', ['pending', 'confirmed', 'completed'])
      .lt('starts_at', dayEnd.toISOString())
      .gt('ends_at', dayStart.toISOString())

    for (let t = alignSlotCursorMin(startMin, schedule); t + dur <= endMin; t += step) {
      const start = new Date(day)
      start.setHours(Math.floor(t / 60), t % 60, 0, 0)
      const end = new Date(start.getTime() + dur * 60_000)
      if (start.getTime() <= now) continue
      if (overlaps(start, end, busy || [])) continue
      slots.push({ start, end, dayOffset: offset })
    }
  }
  return slots
}

function filterByIntent(slots, intent) {
  return slots.filter((s) => {
    const h = s.start.getHours()
    if (intent.afterHour != null && h < intent.afterHour) return false
    if (intent.beforeHour != null && h >= intent.beforeHour) return false
    return true
  })
}

async function refineWithGemini(userText, slots) {
  const key = process.env.GEMINI_API_KEY
  if (!key || !slots.length) return slots.slice(0, 8)

  const listed = slots.slice(0, 24).map((s, i) => {
    const label = formatWhenRu(s.start)
    return `${i}:${s.start.toISOString()} (${label})`
  })

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Клиент написал: «${userText}»
Доступные слоты (индекс:ISO):
${listed.join('\n')}

Верни ТОЛЬКО JSON: {"indexes":[0,1,2]} — до 8 индексов из списка, которые лучше всего подходят запросу.
Не выдумывай индексы. Если непонятно — первые подходящие по смыслу.`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
        },
      }),
    })
    if (!res.ok) return slots.slice(0, 8)
    const json = await res.json()
    const text = (json?.candidates?.[0]?.content?.parts || [])
      .map((p) => (typeof p?.text === 'string' ? p.text : ''))
      .join('')
      .trim()
    let parsed = null
    try {
      parsed = JSON.parse(text)
    } catch {
      const m = text.match(/\{[\s\S]*\}/)
      if (m) parsed = JSON.parse(m[0])
    }
    const indexes = Array.isArray(parsed?.indexes) ? parsed.indexes : []
    const picked = []
    for (const i of indexes) {
      const n = Number(i)
      if (Number.isInteger(n) && slots[n]) picked.push(slots[n])
    }
    return picked.length ? picked.slice(0, 8) : slots.slice(0, 8)
  } catch {
    return slots.slice(0, 8)
  }
}

export async function findSlotsForMessage(
  userText,
  slug = 'demo',
  { serviceId = null, dayOffset = null } = {},
) {
  const master = await resolveMaster(slug, { serviceId })
  if (!master?.masterId) {
    return { ok: false, error: 'Мастер не найден', slots: [], master: null }
  }

  const duration = master.service?.duration_min || 60
  const intent =
    dayOffset != null && Number.isFinite(Number(dayOffset))
      ? {
          dayOffset: Number(dayOffset),
          dayOffsets: [Number(dayOffset)],
          afterHour: null,
          beforeHour: null,
        }
      : parseSlotIntent(userText)
  const all = await freeSlotsForDays(master.masterId, duration, intent.dayOffsets)
  const filtered = filterByIntent(all, intent)
  const pool = filtered.length ? filtered : all
  const slots = await refineWithGemini(userText || dayOffsetToQuery(dayOffset), pool)

  return { ok: true, slots, master, intent }
}

export function humanBookingError(err) {
  const msg = String(err || '')
  if (/уже занял/i.test(msg)) return 'Это окно уже заняли. Выберите другое время.'
  if (/service_role|\.env|Нет service_role|Нет БД|permission|row-level|RLS/i.test(msg)) {
    return 'Не удалось сохранить запись. Попробуйте ещё раз или откройте приложение.'
  }
  if (/Нет данных|Плохое время/i.test(msg)) {
    return 'Не понял время или услугу. Выберите слот ещё раз.'
  }
  if (msg.length > 120 || /supabase|postgres|jwt/i.test(msg)) {
    return 'Не удалось сохранить запись. Попробуйте ещё раз или откройте приложение.'
  }
  return msg || 'Не удалось сохранить запись. Попробуйте ещё раз.'
}

export async function createPendingFromSlot({
  masterId,
  businessId,
  service,
  startsAtIso,
  clientTelegramId,
}) {
  let usedAnon = false
  let supabase = getWriteSupabase()
  if (!supabase) {
    supabase = getSupabase()
    usedAnon = true
  }
  if (!supabase) {
    return { ok: false, error: humanBookingError('Нет БД') }
  }
  if (usedAnon) {
    console.warn('[BOT] createPendingFromSlot через anon (нет SERVICE_ROLE_KEY)')
  }
  if (!masterId || !service?.id || !startsAtIso) {
    return { ok: false, error: humanBookingError('Нет данных') }
  }

  const start = new Date(startsAtIso)
  if (Number.isNaN(start.getTime())) {
    return { ok: false, error: humanBookingError('Плохое время') }
  }
  const duration = service.duration_min || 60
  const end = new Date(start.getTime() + duration * 60_000)

  const schedule = await fetchMemberSchedule(masterId)
  if (!isWithinWorkWindow(schedule, start, end)) {
    return {
      ok: false,
      error: 'Это время вне часов работы. Выберите слот из списка.',
    }
  }
  if (isWholeHoursSchedule(schedule) && start.getMinutes() !== 0) {
    return {
      ok: false,
      error: 'Мастер принимает только в целые часы (16:00, 17:00…). Выберите слот из списка.',
    }
  }

  // ещё раз проверим занятость
  const { data: clash } = await supabase
    .from('bookings')
    .select('id')
    .eq('master_id', masterId)
    .in('status', ['pending', 'confirmed', 'completed'])
    .lt('starts_at', end.toISOString())
    .gt('ends_at', start.toISOString())
    .limit(1)

  if (clash?.length) {
    return { ok: false, error: 'Это окно уже заняли' }
  }

  if (clientTelegramId) {
    const { data: note } = await supabase
      .from('client_notes')
      .select('is_blocked')
      .eq('master_id', masterId)
      .eq('client_telegram_id', clientTelegramId)
      .maybeSingle()
    if (note?.is_blocked) {
      return { ok: false, error: 'Запись недоступна' }
    }
  }

  const row = {
    master_id: masterId,
    service_id: service.id,
    status: 'pending',
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    price_cents: service.price_cents || 0,
    currency: service.currency || 'RUB',
    client_telegram_id: clientTelegramId || null,
  }
  if (businessId) row.business_id = businessId

  const { data, error } = await supabase
    .from('bookings')
    .insert(row)
    .select('id, starts_at, status')
    .single()

  if (error) return { ok: false, error: humanBookingError(error.message) }
  return { ok: true, booking: data }
}

export function defaultBusinessSlug(webappUrl) {
  try {
    const u = new URL(webappUrl)
    return (
      u.searchParams.get('business') ||
      u.searchParams.get('master') ||
      'demo'
    )
  } catch {
    return 'demo'
  }
}

export function formatSlotButton(start) {
  return formatWhenRu(start)
}
