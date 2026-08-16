import { supabase } from './supabase'

/**
 * Метрики удержания для кабинета мастера.
 * - bookings7d: записи за 7 дней (не отменённые)
 * - hoursToFirst: часы от создания бизнеса до первой записи (null если ещё нет)
 * - hasFirstBooking: была ли хоть одна запись
 */
export async function fetchGrowthMetrics({ masterId, businessId, businessCreatedAt }) {
  const empty = {
    bookings7d: 0,
    hasFirstBooking: false,
    hoursToFirst: null,
    firstBookingAt: null,
  }
  if (!supabase || !masterId) return empty

  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  let q7 = supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('master_id', masterId)
    .gte('starts_at', since7)
    .not('status', 'like', 'cancelled%')

  if (businessId) q7 = q7.eq('business_id', businessId)

  const { count: bookings7d, error: e7 } = await q7
  if (e7) console.warn('growth 7d:', e7.message)

  let qFirst = supabase
    .from('bookings')
    .select('id, created_at, starts_at')
    .eq('master_id', masterId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (businessId) qFirst = qFirst.eq('business_id', businessId)

  const { data: firstRows, error: e1 } = await qFirst
  if (e1) console.warn('growth first:', e1.message)

  const first = firstRows?.[0] || null
  let hoursToFirst = null
  if (first && businessCreatedAt) {
    const t0 = new Date(businessCreatedAt).getTime()
    const t1 = new Date(first.created_at || first.starts_at).getTime()
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) {
      hoursToFirst = Math.round(((t1 - t0) / 36e5) * 10) / 10
    }
  }

  return {
    bookings7d: bookings7d || 0,
    hasFirstBooking: Boolean(first),
    hoursToFirst,
    firstBookingAt: first?.created_at || first?.starts_at || null,
  }
}

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'completed'])
const CANCEL_STATUSES = new Set(['cancelled_by_client', 'cancelled_by_master'])

/**
 * Честная недельная сводка для блока «Цифры».
 * Сумма — только completed (не pending).
 */
export async function fetchWeekStats({ masterId, businessId = null, days = 7 } = {}) {
  const empty = {
    bookings: 0,
    completed: 0,
    cancelled: 0,
    noShow: 0,
    revenueCents: 0,
    hasFirstBooking: false,
  }
  if (!supabase || !masterId) return empty

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const now = Date.now()

  let q = supabase
    .from('bookings')
    .select('id, starts_at, status, price_cents')
    .eq('master_id', masterId)
    .gte('starts_at', since)
    .limit(500)
  if (businessId) q = q.eq('business_id', businessId)

  const { data, error } = await q
  if (error) {
    console.warn('week stats:', error.message)
    return empty
  }

  let bookings = 0
  let completed = 0
  let cancelled = 0
  let noShow = 0
  let revenueCents = 0

  for (const row of data || []) {
    const st = String(row.status || '')
    if (ACTIVE_STATUSES.has(st)) bookings += 1
    if (CANCEL_STATUSES.has(st)) cancelled += 1
    if (st === 'no_show') noShow += 1

    const startMs = new Date(row.starts_at).getTime()
    const past = Number.isFinite(startMs) && startMs <= now
    if (st === 'completed' || (st === 'confirmed' && past)) {
      completed += 1
    }
    if (st === 'completed') {
      revenueCents += Number(row.price_cents) || 0
    }
  }

  return {
    bookings,
    completed,
    cancelled,
    noShow,
    revenueCents,
    hasFirstBooking: (data || []).length > 0,
  }
}

/**
 * Состоявшиеся визиты за N дней (для soft-nudge).
 */
export async function fetchCompletedVisitsCount({
  masterId,
  businessId = null,
  days = 30,
} = {}) {
  if (!supabase || !masterId) return 0
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const nowIso = new Date().toISOString()

  let qCompleted = supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('master_id', masterId)
    .eq('status', 'completed')
    .gte('starts_at', since)
  if (businessId) qCompleted = qCompleted.eq('business_id', businessId)

  let qPastConfirmed = supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('master_id', masterId)
    .eq('status', 'confirmed')
    .gte('starts_at', since)
    .lte('starts_at', nowIso)
  if (businessId) qPastConfirmed = qPastConfirmed.eq('business_id', businessId)

  const [a, b] = await Promise.all([qCompleted, qPastConfirmed])
  if (a.error) console.warn('visits completed:', a.error.message)
  if (b.error) console.warn('visits past confirmed:', b.error.message)
  return (a.count || 0) + (b.count || 0)
}
