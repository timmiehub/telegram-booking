/**
 * Сторонние записи через бота: «YClients завтра 15:00»
 */

import { parseSlotIntent } from './aiBook.js'
import { getBotSupabase } from './supabaseBot.js'
import {
  addDaysApp,
  appZonedDateTime,
  endOfDayApp,
  formatWhenRu,
  partsInAppTz,
  startOfDayApp,
  weekdayApp,
} from './timeFormat.js'

const MODEL = 'gemini-3.5-flash'
const SERIES_MAX_SLOTS = 120
const EXPLICIT_DATE_RE = /\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/g

const DATE_CUE =
  /(сегодня|завтра|послезавтра|понедельник|вторник|сред|четверг|пятниц|суббот|воскресен|\bпн\b|\bвт\b|\bср\b|\bчт\b|\bпт\b|\bсб\b|\bвс\b|\d{1,2}[./]\d{1,2})/i

const TIME_CUE =
  /\d{1,2}\s*[:.]\s*\d{2}|\d{1,2}\s*час|(?:в|к)\s*\d{1,2}|утром|вечером|днём|днем|обед|утро|вечер|после\s*\d/i

const WEEKDAY_RULES = [
  { patterns: [/воскресен\w*/i, /(?:^|[\s,]|и )вс(?:[\s,]|$| и)/i], dow: 0 },
  { patterns: [/понедельник/i, /(?:^|[\s,]|и )пн(?:[\s,]|$| и)/i], dow: 1 },
  { patterns: [/вторник/i, /(?:^|[\s,]|и )вт(?:[\s,]|$| и)/i], dow: 2 },
  { patterns: [/сред\w*/i, /(?:^|[\s,]|и )ср(?:[\s,]|$| и)/i], dow: 3 },
  { patterns: [/четверг/i, /(?:^|[\s,]|и )чт(?:[\s,]|$| и)/i], dow: 4 },
  { patterns: [/пятниц\w*/i, /(?:^|[\s,]|и )пт(?:[\s,]|$| и)/i], dow: 5 },
  { patterns: [/суббот\w*/i, /(?:^|[\s,]|и )сб(?:[\s,]|$| и)/i], dow: 6 },
]

function getSupabase() {
  return getBotSupabase({ write: false })
}

function getWriteSupabase() {
  return getBotSupabase({ write: true })
}

function dayAt(offset) {
  return addDaysApp(startOfDayApp(new Date()), offset)
}

function parseHm(h, m) {
  const hour = Number(h)
  const minute = Number(m)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

/** DD.MM или DD.MM.YYYY → Date (полночь). Без года — текущий или следующий. */
export function parseExplicitDate(text) {
  const raw = String(text || '')
  EXPLICIT_DATE_RE.lastIndex = 0
  const m = EXPLICIT_DATE_RE.exec(raw)
  if (!m) return null

  const day = Number(m[1])
  const month = Number(m[2]) - 1
  let year = m[3] ? Number(m[3]) : new Date().getFullYear()
  if (m[3] && year < 100) year += 2000

  if (day < 1 || day > 31 || month < 0 || month > 11) return null

  // Проверка календарной валидности через UTC-полудень (без сдвига TZ сервера)
  const probe = new Date(Date.UTC(year, month, day, 12, 0, 0))
  if (probe.getUTCDate() !== day || probe.getUTCMonth() !== month) return null

  let date = appZonedDateTime(year, month, day, 0, 0, 0)

  if (!m[3]) {
    const today = startOfDayApp(new Date())
    if (date < today) {
      date = appZonedDateTime(year + 1, month, day, 0, 0, 0)
    }
  }

  return { date, raw: m[0] }
}

function stripExplicitDates(text) {
  return String(text || '').replace(EXPLICIT_DATE_RE, ' ')
}

function looksLikeDateToken(hour, minute, separator) {
  if (separator !== '.' && separator !== '/') return false
  return hour >= 1 && hour <= 31 && minute >= 1 && minute <= 12
}

/** «19:00 до 20:00», «19:00-20:00», «с 19:00 до 20:00» */
function extractTimeRange(text) {
  const t = String(text || '').toLowerCase()
  const m = t.match(
    /(?:с\s+)?(?:в\s+)?(\d{1,2})\s*([:.])\s*(\d{2})\s*(?:до|-\s*|–\s*)\s*(\d{1,2})\s*([:.])\s*(\d{2})/,
  )
  if (!m) return null
  const start = parseHm(m[1], m[3])
  const end = parseHm(m[4], m[6])
  if (!start || !end) return null
  const startMin = start.hour * 60 + start.minute
  const endMin = end.hour * 60 + end.minute
  let durationMin = endMin - startMin
  if (durationMin <= 0) durationMin += 24 * 60
  if (durationMin < 15 || durationMin > 480) return null
  return { ...start, durationMin }
}

function extractTime(text, intent) {
  const withoutDates = stripExplicitDates(text)
  const range = extractTimeRange(withoutDates)
  if (range) {
    const { hour, minute, durationMin } = range
    return { hour, minute, durationMin }
  }

  const t = String(withoutDates || '').toLowerCase()
  const tm = t.match(/(\d{1,2})\s*([:.])\s*(\d{2})/)
  if (tm) {
    const hour = Number(tm[1])
    const minute = Number(tm[3])
    if (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59 &&
      !looksLikeDateToken(hour, minute, tm[2])
    ) {
      return { hour, minute, durationMin: 60 }
    }
  }

  const atHour = t.match(/(?:в|к)\s*(\d{1,2})(?:\s*([:.])\s*(\d{2}))?/)
  if (atHour) {
    const hour = Number(atHour[1])
    const minute = atHour[3] != null ? Number(atHour[3]) : 0
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute, durationMin: 60 }
    }
  }

  if (intent?.afterHour != null && intent.beforeHour == null) {
    return { hour: intent.afterHour, minute: 0, durationMin: 60 }
  }
  if (/утром|утро/.test(t)) return { hour: 10, minute: 0, durationMin: 60 }
  if (/днём|днем|обед/.test(t)) return { hour: 14, minute: 0, durationMin: 60 }
  if (/вечером|вечер/.test(t)) return { hour: 18, minute: 0, durationMin: 60 }

  return null
}

function parseWeekdays(text) {
  const found = new Set()
  const raw = String(text || '')
  for (const { patterns, dow } of WEEKDAY_RULES) {
    if (patterns.some((re) => re.test(raw))) found.add(dow)
  }
  return [...found].sort((a, b) => a - b)
}

function parseUntilDate(text) {
  const raw = String(text || '')
  const untilMatch = raw.match(
    /до\s+(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/i,
  )
  if (untilMatch?.[1]) {
    const parsed = parseExplicitDate(untilMatch[1])
    if (parsed?.date) return endOfDayApp(parsed.date)
  }

  const monthMatch = raw.match(
    /до\s+(январ\w*|феврал\w*|март\w*|апрел\w*|ма[йя]\w*|июн\w*|июл\w*|август\w*|сентябр\w*|октябр\w*|ноябр\w*|декабр\w*)/i,
  )
  if (monthMatch?.[1]) {
    const months = {
      янв: 0,
      фев: 1,
      мар: 2,
      апр: 3,
      май: 4,
      ма: 4,
      июн: 5,
      июл: 6,
      авг: 7,
      сен: 8,
      окт: 9,
      ноя: 10,
      дек: 11,
    }
    const key = monthMatch[1].slice(0, 3).toLowerCase()
    const monthIdx = months[key]
    if (monthIdx != null) {
      const nowParts = partsInAppTz(new Date())
      let year = nowParts.year
      let until = endOfDayApp(appZonedDateTime(year, monthIdx + 1, 0, 0, 0, 0))
      if (until < new Date()) {
        until = endOfDayApp(appZonedDateTime(year + 1, monthIdx + 1, 0, 0, 0, 0))
      }
      return until
    }
  }

  const p = partsInAppTz(new Date())
  return endOfDayApp(appZonedDateTime(p.year + 1, p.month, p.day, 0, 0, 0))
}

function generateSeriesSlots(weekdays, hour, minute, untilDate, max = SERIES_MAX_SLOTS) {
  const slots = []
  let cur = startOfDayApp(new Date())
  const until = endOfDayApp(untilDate instanceof Date ? untilDate : new Date(untilDate))

  while (cur.getTime() <= until.getTime() && slots.length < max) {
    if (weekdays.includes(weekdayApp(cur))) {
      const p = partsInAppTz(cur)
      const slot = appZonedDateTime(p.year, p.month, p.day, hour, minute, 0)
      if (slot.getTime() > Date.now() - 30 * 60_000) slots.push(slot)
    }
    cur = addDaysApp(cur, 1)
  }
  return slots
}

function extractSource(text) {
  const raw = String(text || '').trim()
  const seriesPrefix = raw.match(/^(.+?)\s+кажд/i)
  if (seriesPrefix?.[1]?.trim()) {
    return seriesPrefix[1].trim().slice(0, 60)
  }

  const prefix = raw.match(/^([^\d:.,\d]{1,20}?)\s+(?:сегодня|завтра|послезавтра|в\s+|с\s+|\d)/i)
  if (prefix?.[1]?.trim().length >= 1) {
    return prefix[1].trim().slice(0, 60)
  }

  let s = raw
  s = s.replace(
    /(сегодня|завтра|послезавтра|понедельник|вторник|среду|среда|сред|четверг|пятницу|пятница|пятниц|субботу|суббота|суббот|воскресенье|воскресен|\bпн\b|\bвт\b|\bср\b|\bчт\b|\bпт\b|\bсб\b|\bвс\b)/gi,
    ' ',
  )
  s = s.replace(/кажд\w*[\s\S]*/gi, ' ')
  s = s.replace(EXPLICIT_DATE_RE, ' ')
  s = s.replace(
    /(?:с\s+)?(?:в\s+)?\d{1,2}\s*[:.]\s*\d{2}\s*(?:до|-\s*|–\s*)\s*\d{1,2}\s*[:.]\s*\d{2}/gi,
    ' ',
  )
  s = s.replace(/\d{1,2}\s*[:.]\s*\d{2}/g, ' ')
  s = s.replace(/(?:в|к)\s*\d{1,2}(?:\s*[:.]\s*\d{2})?/gi, ' ')
  s = s.replace(/(?:утром|вечером|днём|днем|обед|утро|вечер|после\s*\d{1,2}|до\s+\S+)/gi, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/^[,.\-–—\s]+|[,.\-–—\s]+$/g, '')
  if (!s || s.length < 2) return 'Другое'
  return s.slice(0, 60)
}

/** Быстрая проверка: похоже на «источник + когда» */
export function looksLikeExternalBookingDraft(text) {
  const t = String(text || '').trim()
  if (!t || t.length > 280 || t.startsWith('/')) return false
  if (/кажд/i.test(t) && parseWeekdays(t).length) return TIME_CUE.test(t)
  return DATE_CUE.test(t) && TIME_CUE.test(t)
}

export function parseExternalSeries(text) {
  const raw = String(text || '').trim()
  if (!raw || !/кажд/i.test(raw)) return { ok: false }

  const weekdays = parseWeekdays(raw)
  if (!weekdays.length) {
    return {
      ok: false,
      error:
        'Не понял дни недели. Пример: Артём каждый вт и чт 17:00 до 31.12.2026',
    }
  }

  const intent = parseSlotIntent(raw)
  const time = extractTime(raw, intent)
  if (!time) {
    return {
      ok: false,
      error: 'Не понял время серии. Пример: каждый вт и чт 17:00 до 31.12.2026',
    }
  }

  const untilDate = parseUntilDate(raw)
  const slots = generateSeriesSlots(
    weekdays,
    time.hour,
    time.minute,
    untilDate,
    SERIES_MAX_SLOTS,
  )

  if (!slots.length) {
    return {
      ok: false,
      error: 'Не нашёл будущих дат в серии. Проверьте «до …» и дни недели.',
    }
  }

  const source = extractSource(raw)
  return {
    ok: true,
    kind: 'series',
    source,
    slots,
    durationMin: time.durationMin ?? 60,
    total: slots.length,
  }
}

export function parseExternalBooking(text) {
  const raw = String(text || '').trim()
  if (!raw) return { ok: false, error: 'Пустое сообщение' }
  if (raw.length > 280) return { ok: false, error: 'Слишком длинно (до 280 символов)' }

  if (/кажд/i.test(raw)) {
    return parseExternalSeries(raw)
  }

  const intent = parseSlotIntent(raw)
  const time = extractTime(raw, intent)
  if (!time) {
    return {
      ok: false,
      error: 'Не понял время. Пример: YClients завтра 15:00 или Артём 01.09 в 17:00',
    }
  }

  const explicit = parseExplicitDate(raw)
  let day
  if (explicit?.date) {
    day = new Date(explicit.date)
  } else {
    const dayOffset = intent.dayOffsets?.[0] ?? intent.dayOffset ?? 0
    day = dayAt(dayOffset)
  }

  const dayParts = partsInAppTz(day)
  const start = appZonedDateTime(
    dayParts.year,
    dayParts.month,
    dayParts.day,
    time.hour,
    time.minute,
    0,
  )

  if (start.getTime() < Date.now() - 30 * 60_000) {
    return {
      ok: false,
      error:
        'Похоже, дата в прошлом. Пример: Артём 01.09 в 17:00 или 01.09.2026 в 17:00',
    }
  }

  const source = extractSource(raw)
  return {
    ok: true,
    kind: 'single',
    source,
    startsAt: start,
    durationMin: time.durationMin ?? 60,
  }
}

async function parseWithGemini(text) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  const todayParts = partsInAppTz(new Date())
  const todayIso = `${todayParts.year}-${String(todayParts.month + 1).padStart(2, '0')}-${String(todayParts.day).padStart(2, '0')}`

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
                text: `Мастер добавляет стороннюю запись из другого сервиса.
Сегодня: ${todayIso} (UTC+3 Москва).
Текст: «${text}»

Верни ТОЛЬКО JSON:
{"source":"YClients","dayOffset":1,"hour":15,"minute":0,"durationMin":60,"explicitDate":null,"weekdays":null,"untilDate":null}
- source: короткое название источника (1–3 слова), не дата/время
- dayOffset: 0=сегодня, 1=завтра, 2=послезавтра (если нет explicitDate)
- explicitDate: "YYYY-MM-DD" или null
- weekdays: массив 0-6 (вс=0) для серии или null
- untilDate: "YYYY-MM-DD" конец серии или null
- hour 0-23, minute 0-59
- durationMin: 30–120, по умолчанию 60
Не выдумывай, если непонятно — null в полях.`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
        },
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    const blob = (json?.candidates?.[0]?.content?.parts || [])
      .map((p) => (typeof p?.text === 'string' ? p.text : ''))
      .join('')
      .trim()
    let parsed = null
    try {
      parsed = JSON.parse(blob)
    } catch {
      const m = blob.match(/\{[\s\S]*\}/)
      if (m) parsed = JSON.parse(m[0])
    }
    if (!parsed || parsed.hour == null) return null

    const hour = Number(parsed.hour)
    const minute = Number(parsed.minute) || 0
    const durationMin = Math.min(180, Math.max(15, Number(parsed.durationMin) || 60))
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null

    const source = String(parsed.source || extractSource(text)).slice(0, 60) || 'Другое'

    if (Array.isArray(parsed.weekdays) && parsed.weekdays.length) {
      const until =
        parsed.untilDate && !Number.isNaN(new Date(`${parsed.untilDate}T12:00:00Z`).getTime())
          ? endOfDayApp(new Date(`${parsed.untilDate}T12:00:00Z`))
          : parseUntilDate(text)
      const weekdays = parsed.weekdays.map(Number).filter((d) => d >= 0 && d <= 6)
      const slots = generateSeriesSlots(weekdays, hour, minute, until, SERIES_MAX_SLOTS)
      if (slots.length) {
        return { ok: true, kind: 'series', source, slots, durationMin, total: slots.length }
      }
    }

    let day
    if (parsed.explicitDate && /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.explicitDate))) {
      const [y, mo, da] = String(parsed.explicitDate).split('-').map(Number)
      day = appZonedDateTime(y, mo - 1, da, 0, 0, 0)
    } else {
      const dayOffset = Number(parsed.dayOffset) || 0
      day = dayAt(dayOffset)
    }

    const dayParts = partsInAppTz(day)
    const start = appZonedDateTime(
      dayParts.year,
      dayParts.month,
      dayParts.day,
      hour,
      minute,
      0,
    )
    if (start.getTime() < Date.now() - 30 * 60_000) return null

    return { ok: true, kind: 'single', source, startsAt: start, durationMin }
  } catch {
    return null
  }
}

export async function parseExternalBookingSmart(text) {
  const direct = parseExternalBooking(text)
  if (direct.ok) return direct
  const ai = await parseWithGemini(text)
  if (ai?.ok) return ai
  return direct
}

export async function resolveMasterForTelegram(telegramId) {
  const supabase = getSupabase()
  if (!supabase || !telegramId) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, slug')
    .eq('telegram_id', telegramId)
    .maybeSingle()
  if (!profile) return null

  const { data: member } = await supabase
    .from('business_members')
    .select('business_id, businesses(id, slug, name)')
    .eq('profile_id', profile.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  let businessId = member?.business_id || null
  let businessName = member?.businesses?.name || null
  let slug = member?.businesses?.slug || profile.slug

  if (!businessId && profile.role === 'master' && profile.slug) {
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, name, slug')
      .eq('owner_profile_id', profile.id)
      .limit(1)
      .maybeSingle()
    if (biz) {
      businessId = biz.id
      businessName = biz.name
      slug = biz.slug
    }
  }

  if (!businessId && profile.role !== 'master') return null

  const { data: service } = await supabase
    .from('services')
    .select('id, title, duration_min, price_cents, currency')
    .eq('is_active', true)
    .eq('master_id', profile.id)
    .limit(1)
    .maybeSingle()

  return {
    masterId: profile.id,
    businessId,
    businessName,
    slug,
    service: service || null,
  }
}

export async function createExternalBooking({
  masterId,
  businessId,
  service,
  source,
  startsAt,
  durationMin = 60,
}) {
  let supabase = getWriteSupabase()
  if (!supabase) {
    supabase = getSupabase()
    if (supabase) {
      console.warn(
        '[BOT] insert без service_role — нужна миграция migration_bookings_external_rls.sql',
      )
    }
  }
  if (!supabase) {
    return {
      ok: false,
      error:
        'Запись недоступна: добавьте SUPABASE_SERVICE_ROLE_KEY в bot/.env или выполните SQL-миграцию RLS',
    }
  }
  if (!masterId || !source || !startsAt) {
    return { ok: false, error: 'Нет данных для записи' }
  }

  const start = startsAt instanceof Date ? startsAt : new Date(startsAt)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'Плохое время' }

  const duration = durationMin || service?.duration_min || 60
  const end = new Date(start.getTime() + duration * 60_000)

  const { data: clash } = await supabase
    .from('bookings')
    .select('id')
    .eq('master_id', masterId)
    .in('status', ['pending', 'confirmed', 'completed'])
    .lt('starts_at', end.toISOString())
    .gt('ends_at', start.toISOString())
    .limit(1)

  if (clash?.length) {
    return { ok: false, error: 'Это время уже занято', clash: true }
  }

  const row = {
    master_id: masterId,
    service_id: service?.id || null,
    status: 'confirmed',
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    price_cents: 0,
    currency: service?.currency || 'RUB',
    client_telegram_id: null,
    external_source: source,
    notes: `Сторонняя: ${source}`,
  }
  if (businessId) row.business_id = businessId

  const { data, error } = await supabase
    .from('bookings')
    .insert(row)
    .select('id, starts_at, ends_at, external_source, status')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, booking: data }
}

export async function createExternalBookingBatch({
  masterId,
  businessId,
  service,
  source,
  slots,
  durationMin = 60,
}) {
  const list = Array.isArray(slots) ? slots : []
  let added = 0
  let skipped = 0
  const errors = []

  for (const startsAt of list) {
    const result = await createExternalBooking({
      masterId,
      businessId,
      service,
      source,
      startsAt,
      durationMin,
    })
    if (result.ok) {
      added += 1
    } else if (result.clash) {
      skipped += 1
    } else {
      errors.push(result.error)
    }
  }

  return {
    ok: added > 0,
    added,
    skipped,
    total: list.length,
    errors: errors.slice(0, 3),
  }
}

export function formatExternalWhen(startsAt) {
  return formatWhenRu(startsAt)
}
