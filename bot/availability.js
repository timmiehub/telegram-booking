/**
 * Расписание мастера (work_hours) — та же логика, что в webapp/src/lib/availability.js.
 * Слоты только внутри отмеченных дней и часов.
 */

import { getBotSupabase } from './supabaseBot.js'

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

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function dayKeyFromDate(date) {
  return DAY_KEYS[date.getDay()]
}

function dayOffset(offset = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d
}

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

/** Без «фейковых» 09–20: пустое расписание = нет слотов */
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
  return createEmptySchedule()
}

export function getWindowForDate(schedule, date) {
  const normalized = normalizeSchedule(schedule)
  const entry = normalized.dates[dateKey(date)]
  if (!entry?.start || !entry?.end) return null
  return { start: entry.start, end: entry.end }
}

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
  if (end.getDate() !== start.getDate()) return false
  return s >= startMin && e <= endMin
}

export function isWholeHoursSchedule(schedule) {
  return Boolean(normalizeSchedule(schedule).default?.whole_hours)
}

export function resolveSlotStepMin(durationMin, schedule) {
  if (isWholeHoursSchedule(schedule)) return 60
  const d = Number(durationMin) || 60
  return Math.min(30, Math.max(15, d))
}

export function alignSlotCursorMin(startMin, schedule) {
  const t = Number(startMin) || 0
  if (!isWholeHoursSchedule(schedule)) return t
  if (t % 60 === 0) return t
  return Math.ceil(t / 60) * 60
}

export async function fetchMemberSchedule(masterId) {
  const empty = createEmptySchedule()
  const supabase = getBotSupabase({ write: false })
  if (!masterId || !supabase) return empty

  const { data, error } = await supabase
    .from('business_members')
    .select('work_hours')
    .eq('profile_id', masterId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('fetchMemberSchedule:', error.message)
    return empty
  }
  return normalizeSchedule(data?.work_hours)
}
