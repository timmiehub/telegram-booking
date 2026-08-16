import { supabase } from './supabase'
import { incrementNoShow } from './clientNotes'
import { computeDayFillRate } from './slots'

/** Окно месячной аналитики в UI (согласовано с bot/dataRetention.js). */
export const STATS_UI_MONTHS = 12

function monthsAgoIsoDate(months) {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - months)
  d.setUTCDate(1)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function daysAgoIso(days) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Агрегаты для графиков мастера */
export async function fetchMasterAnalytics(masterId) {
  if (!masterId || !supabase) {
    return { revenueMonthly: [], densityDaily: [], bookings: [] }
  }

  const monthFrom = monthsAgoIsoDate(STATS_UI_MONTHS)
  const dayFrom = daysAgoIso(30)

  const statsQuery = supabase
    .from('booking_stats_monthly')
    .select('month, revenue_cents, completed_count, cancelled_count')
    .eq('master_id', masterId)
    .gte('month', monthFrom)
    .order('month')

  const viewFallback = supabase
    .from('v_revenue_monthly')
    .select('month, revenue_cents, completed_count, cancelled_count')
    .eq('master_id', masterId)
    .gte('month', monthFrom)
    .order('month')

  const [statsRes, density, bookings, memberBiz] = await Promise.all([
    statsQuery,
    supabase
      .from('v_booking_density_daily')
      .select('day, booked_count, cancelled_count, completed_count, revenue_cents')
      .eq('master_id', masterId)
      .gte('day', dayFrom)
      .order('day'),
    supabase
      .from('bookings')
      .select('id, starts_at, status, price_cents')
      .eq('master_id', masterId)
      .order('starts_at', { ascending: false })
      .limit(50),
    supabase
      .from('business_members')
      .select('business_id, businesses(settings)')
      .eq('profile_id', masterId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),
  ])

  let revenueMonthly = statsRes.data ?? []
  if (statsRes.error || !revenueMonthly.length) {
    if (statsRes.error) {
      console.warn('booking_stats_monthly:', statsRes.error.message)
    }
    // Fallback: businesses.settings.stats_monthly[masterId]
    const settings = memberBiz?.data?.businesses?.settings
    const byMaster = settings?.stats_monthly?.[String(masterId)]
    if (byMaster && typeof byMaster === 'object') {
      revenueMonthly = Object.entries(byMaster)
        .filter(([month]) => month >= monthFrom)
        .map(([month, v]) => ({
          month,
          revenue_cents: v?.revenue_cents || 0,
          completed_count: v?.completed_count || 0,
          cancelled_count: v?.cancelled_count || 0,
        }))
        .sort((a, b) => String(a.month).localeCompare(String(b.month)))
    }
    if (!revenueMonthly.length) {
      const fallback = await viewFallback
      if (fallback.error) console.warn('revenue view:', fallback.error.message)
      revenueMonthly = fallback.data ?? []
    }
  }

  if (density.error) console.warn('density view:', density.error.message)
  if (bookings.error) console.warn('bookings:', bookings.error.message)

  return {
    revenueMonthly,
    densityDaily: density.data ?? [],
    bookings: bookings.data ?? [],
  }
}

export function kopecksToRub(cents) {
  return Math.round((Number(cents) || 0) / 100)
}

export function statusLabel(status) {
  switch (status) {
    case 'pending':
      return 'Ожидает'
    case 'confirmed':
      return 'Подтверждена'
    case 'completed':
      return 'Завершена'
    case 'cancelled_by_client':
      return 'Отмена клиентом'
    case 'cancelled_by_master':
      return 'Отмена мастером'
    case 'no_show':
      return 'Не пришёл'
    default:
      return status
  }
}

/** Смена статуса записи (нужна RLS policy на UPDATE) */
export async function updateBookingStatus(bookingId, status, { masterId = null, clientTelegramId = null } = {}) {
  if (!supabase || !bookingId) {
    return { ok: false, error: 'Нет подключения' }
  }

  let prevStatus = null
  if (status === 'confirmed') {
    const { data: prev } = await supabase
      .from('bookings')
      .select('status')
      .eq('id', bookingId)
      .maybeSingle()
    prevStatus = prev?.status || null
  }

  const patch = { status }
  if (String(status).startsWith('cancelled')) {
    patch.cancelled_at = new Date().toISOString()
  }
  if (status === 'cancelled_by_master') {
    patch.notify_kind = 'cancelled_by_master'
    patch.notify_sent = false
  }
  if (status === 'confirmed' && prevStatus === 'pending') {
    patch.notify_kind = 'confirmed_by_master'
    patch.notify_sent = false
  }

  let query = supabase.from('bookings').update(patch).eq('id', bookingId)
  if (masterId) query = query.eq('master_id', masterId)

  let { data, error } = await query
    .select('id, status, master_id, client_telegram_id, business_id, starts_at, services(title)')
    .maybeSingle()

  if (
    error &&
    /notify_/i.test(String(error.message || '')) &&
    (status === 'cancelled_by_master' || status === 'confirmed')
  ) {
    const fallback = { status }
    if (patch.cancelled_at) fallback.cancelled_at = patch.cancelled_at
    let q2 = supabase.from('bookings').update(fallback).eq('id', bookingId)
    if (masterId) q2 = q2.eq('master_id', masterId)
    ;({ data, error } = await q2
      .select('id, status, master_id, client_telegram_id, business_id, starts_at, services(title)')
      .maybeSingle())
  }

  if (error) return { ok: false, error: error.message }
  if (!data) {
    return {
      ok: false,
      error: 'Статус не обновился. Нужна политика UPDATE в Supabase.',
    }
  }

  if (status === 'no_show' && data.client_telegram_id && data.master_id) {
    await incrementNoShow(data.master_id, data.client_telegram_id)
  }

  return { ok: true, booking: data }
}

export async function fetchMasterFillRate(masterId, day) {
  return computeDayFillRate(masterId, day)
}
