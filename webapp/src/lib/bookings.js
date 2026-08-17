import { supabase } from './supabase'
import { dayOffset } from './slots'
import { canModifyBooking } from './settings'
import { assertClientCanModifyBooking, bookingModifyPolicy } from './bookingModify'

export { bookingModifyPolicy } from './bookingModify'

function isProfileId(v) {
  return typeof v === 'string' && v.length === 36 && v.includes('-')
}

function clientColumn(v) {
  return isProfileId(v) ? 'client_id' : 'client_telegram_id'
}

/** Записи мастера на календарный день */
export async function fetchDayBookings(masterId, day = dayOffset(0)) {
  if (!masterId || !supabase) return []

  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(day)
  end.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, starts_at, ends_at, status, price_cents, currency, client_id, client_telegram_id, client_vk_id, external_source, service_id, services(title, duration_min)',
    )
    .eq('master_id', masterId)
    .gte('starts_at', start.toISOString())
    .lte('starts_at', end.toISOString())
    .order('starts_at')

  if (error) {
    console.warn('day bookings:', error.message)
    return []
  }
  return data ?? []
}

const AGENDA_DOT_STATUSES = ['pending', 'confirmed', 'completed']

/**
 * Число визитов по дням в диапазоне (для точек на месячном календаре).
 * @returns {Promise<Map<string, number>>} ключ YYYY-MM-DD
 */
export async function fetchBookingDayCounts(masterId, fromDate, toDate) {
  const map = new Map()
  if (!masterId || !supabase || !fromDate || !toDate) return map

  const start = new Date(fromDate)
  start.setHours(0, 0, 0, 0)
  const end = new Date(toDate)
  end.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('bookings')
    .select('starts_at, status')
    .eq('master_id', masterId)
    .in('status', AGENDA_DOT_STATUSES)
    .gte('starts_at', start.toISOString())
    .lte('starts_at', end.toISOString())
    .limit(2000)

  if (error) {
    console.warn('booking day counts:', error.message)
    return map
  }

  for (const row of data ?? []) {
    if (!row?.starts_at) continue
    const d = new Date(row.starts_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    map.set(key, (map.get(key) || 0) + 1)
  }
  return map
}

/** Подтянуть @username / имя клиента из profiles */
export async function attachClientLabels(rows) {
  if (!supabase || !rows?.length) return rows || []

  // Подбираем client_id и telegram_id — покрываем и TG, и VK
  const profileIds = []
  const tgIds = []
  for (const r of rows) {
    if (r.client_id) profileIds.push(r.client_id)
    if (r.client_telegram_id) tgIds.push(r.client_telegram_id)
  }

  if (!profileIds.length && !tgIds.length) {
    return rows.map((r) => ({ ...r, client_label: null }))
  }

  let data = []
  if (profileIds.length) {
    const res = await supabase
      .from('profiles')
      .select('id, telegram_id, vk_id, username, full_name')
      .in('id', [...new Set(profileIds)])
    if (res.error) console.warn('client labels by id:', res.error.message)
    data = res.data || []
  }
  if (tgIds.length) {
    const res = await supabase
      .from('profiles')
      .select('id, telegram_id, vk_id, username, full_name')
      .in('telegram_id', [...new Set(tgIds)])
    if (res.error) console.warn('client labels by tg:', res.error.message)
    data = [...data, ...(res.data || [])]
  }

  const byId = new Map((data || []).map((p) => [String(p.id), p]))
  const byTg = new Map((data || []).map((p) => (p.telegram_id ? [String(p.telegram_id), p] : null)).filter(Boolean))

  return rows.map((r) => {
    const p = r.client_id ? byId.get(String(r.client_id)) : byTg.get(String(r.client_telegram_id))
    let label = null
    if (p?.username) label = `@${p.username}`
    else if (p?.full_name) label = p.full_name
    else if (r.client_telegram_id) label = `TG ${r.client_telegram_id}`
    else if (r.client_vk_id) label = `VK ${r.client_vk_id}`
    return { ...r, client_label: label }
  })
}

/** Клиенты без визита > days дней */
export async function fetchClientsAtRisk(masterId, days = 45) {
  if (!masterId || !supabase) return []

  const { data, error } = await supabase
    .from('bookings')
    .select('client_telegram_id, starts_at, status, price_cents')
    .eq('master_id', masterId)
    .eq('status', 'completed')
    .not('client_telegram_id', 'is', null)
    .order('starts_at', { ascending: false })
    .limit(200)

  if (error) {
    console.warn('clients at risk:', error.message)
    return []
  }

  const byClient = new Map()
  for (const row of data ?? []) {
    const key = String(row.client_telegram_id)
    if (!byClient.has(key)) {
      byClient.set(key, {
        client_telegram_id: row.client_telegram_id,
        last_visit_at: row.starts_at,
        visits: 1,
        last_price_cents: row.price_cents,
      })
    } else {
      byClient.get(key).visits += 1
    }
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return [...byClient.values()]
    .filter((c) => new Date(c.last_visit_at).getTime() < cutoff)
    .sort(
      (a, b) =>
        new Date(a.last_visit_at).getTime() - new Date(b.last_visit_at).getTime(),
    )
}

/** Записи клиента у мастера (upcoming) */
export async function fetchClientBookings(masterId, clientTelegramId) {
  if (!masterId || !clientTelegramId || !supabase) return []

  const now = new Date().toISOString()
  const fieldsWithBuf =
    'id, starts_at, ends_at, status, price_cents, currency, business_id, master_id, service_id, services(title, duration_min, buffer_min), businesses(id, settings)'
  const fieldsCore =
    'id, starts_at, ends_at, status, price_cents, currency, business_id, master_id, service_id, services(title, duration_min), businesses(id, settings)'
  let { data, error } = await supabase
    .from('bookings')
    .select(fieldsWithBuf)
    .eq('master_id', masterId)
    .eq(clientColumn(clientTelegramId), clientTelegramId)
    .gte('starts_at', now)
    .in('status', ['pending', 'confirmed'])
    .order('starts_at')
    .limit(20)

  if (error && /buffer_min/i.test(String(error.message || ''))) {
    ;({ data, error } = await supabase
      .from('bookings')
      .select(fieldsCore)
      .eq('master_id', masterId)
      .eq(clientColumn(clientTelegramId), clientTelegramId)
      .gte('starts_at', now)
      .in('status', ['pending', 'confirmed'])
      .order('starts_at')
      .limit(20))
  }

  if (error) {
    console.warn('client bookings:', error.message)
    return []
  }
  return data ?? []
}

/** Все предстоящие записи клиента (все мастера) */
export async function fetchClientUpcomingAll(clientTelegramId) {
  if (!clientTelegramId || !supabase) return []

  const now = new Date().toISOString()
  const fieldsWithBuf =
    'id, starts_at, ends_at, status, price_cents, currency, master_id, business_id, service_id, services(title, duration_min, buffer_min), businesses(id, slug, name, avatar_url, settings)'
  const fieldsCore =
    'id, starts_at, ends_at, status, price_cents, currency, master_id, business_id, service_id, services(title, duration_min), businesses(id, slug, name, avatar_url, settings)'
  let { data, error } = await supabase
    .from('bookings')
    .select(fieldsWithBuf)
    .eq(clientColumn(clientTelegramId), clientTelegramId)
    .gte('starts_at', now)
    .in('status', ['pending', 'confirmed'])
    .order('starts_at')
    .limit(30)

  if (error && /buffer_min/i.test(String(error.message || ''))) {
    ;({ data, error } = await supabase
      .from('bookings')
      .select(fieldsCore)
      .eq(clientColumn(clientTelegramId), clientTelegramId)
      .gte('starts_at', now)
      .in('status', ['pending', 'confirmed'])
      .order('starts_at')
      .limit(30))
  }

  if (error) {
    console.warn('client upcoming all:', error.message)
    return []
  }
  return data ?? []
}

/** Мастера / заведения, к которым клиент уже ходил */
export async function fetchClientMasters(clientTelegramId) {
  if (!clientTelegramId || !supabase) return []

  const { data, error } = await supabase
    .from('bookings')
    .select(
      'master_id, business_id, starts_at, businesses(id, slug, name, avatar_url, city, created_at)',
    )
    .eq(clientColumn(clientTelegramId), clientTelegramId)
    .not('master_id', 'is', null)
    .order('starts_at', { ascending: false })
    .limit(100)

  if (error) {
    console.warn('client masters:', error.message)
    return []
  }

  const seen = new Map()
  for (const row of data ?? []) {
    const biz = row.businesses
    const key = biz?.id || row.business_id || row.master_id
    if (!key) continue
    const k = String(key)
    if (seen.has(k)) {
      seen.get(k).visit_count += 1
      continue
    }
    seen.set(k, {
      business_id: biz?.id || row.business_id || null,
      master_id: row.master_id,
      slug: biz?.slug || null,
      name: biz?.name || 'Мастер',
      avatar_url: biz?.avatar_url || null,
      city: biz?.city || null,
      created_at: biz?.created_at || null,
      last_visit_at: row.starts_at,
      visit_count: 1,
    })
  }
  return [...seen.values()]
}

export async function cancelClientBooking(id, clientTelegramId = null) {
  if (!id || !supabase) return { ok: false, error: 'Нет id' }

  const gate = await assertClientCanModifyBooking(id, clientTelegramId)
  if (!gate.ok) return gate

  const run = async (body) => {
    let query = supabase.from('bookings').update(body).eq('id', id)
    if (clientTelegramId) query = query.eq(clientColumn(clientTelegramId), clientTelegramId)
    return query.select('id, master_id, business_id, client_telegram_id').maybeSingle()
  }

  const full = {
    status: 'cancelled_by_client',
    cancelled_at: new Date().toISOString(),
    notify_kind: 'cancelled_by_client',
    notify_sent: false,
  }
  let { data, error } = await run(full)
  if (error && /notify_/i.test(String(error.message || ''))) {
    ;({ data, error } = await run({
      status: 'cancelled_by_client',
      cancelled_at: new Date().toISOString(),
    }))
  }

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Запись не найдена' }
  return { ok: true, booking: data }
}

export async function fetchClientPastBookings(clientTelegramId, limit = 10) {
  if (!clientTelegramId || !supabase) return []

  const now = new Date()
  const since = new Date(now)
  since.setUTCMonth(since.getUTCMonth() - 12)

  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, starts_at, status, master_id, business_id, service_id, hidden_by_client, services(id, title, duration_min, price_cents, currency), businesses(slug, name)',
    )
    .eq(clientColumn(clientTelegramId), clientTelegramId)
    .eq('hidden_by_client', false)
    .lt('starts_at', now.toISOString())
    .gte('starts_at', since.toISOString())
    .in('status', ['completed', 'confirmed', 'no_show', 'cancelled_by_client', 'cancelled_by_master'])
    .order('starts_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('past bookings:', error.message)
    return []
  }
  return data ?? []
}

export async function hideClientBooking(id, clientTelegramId = null) {
  if (!id || !supabase) return { ok: false, error: 'Нет id' }

  let query = supabase
    .from('bookings')
    .update({ hidden_by_client: true })
    .eq('id', id)
  if (clientTelegramId) query = query.eq(clientColumn(clientTelegramId), clientTelegramId)

  const { data, error } = await query.select('id').maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Запись не найдена' }
  return { ok: true }
}

/**
 * Последняя бронь для «как в прошлый раз»: услуга + slug заведения.
 * Берём свежайшую не-отменённую с service_id и businesses.slug.
 */
export async function fetchLastRepeatableBooking(clientTelegramId) {
  if (!clientTelegramId || !supabase) return null

  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, starts_at, status, master_id, business_id, service_id, services(id, title, duration_min, price_cents, currency, is_active), businesses(id, slug, name, avatar_url)',
    )
    .eq(clientColumn(clientTelegramId), clientTelegramId)
    .not('service_id', 'is', null)
    .not('status', 'like', 'cancelled%')
    .order('starts_at', { ascending: false })
    .limit(20)

  if (error) {
    console.warn('last repeatable:', error.message)
    return null
  }

  for (const row of data ?? []) {
    const slug = row.businesses?.slug
    const serviceId = row.service_id || row.services?.id
    if (!slug || !serviceId) continue
    if (row.services && row.services.is_active === false) continue
    return {
      bookingId: row.id,
      masterId: row.master_id,
      businessId: row.business_id || row.businesses?.id || null,
      serviceId,
      serviceTitle: row.services?.title || 'Услуга',
      businessSlug: slug,
      businessName: row.businesses?.name || 'Мастер',
      avatarUrl: row.businesses?.avatar_url || null,
      startsAt: row.starts_at,
      status: row.status,
    }
  }
  return null
}

export function bookingAllowsReschedule(booking, settings) {
  if (!booking) return false
  if (!['pending', 'confirmed'].includes(booking.status)) return false
  if (settings) return canModifyBooking(booking.starts_at, settings)
  return bookingModifyPolicy(booking).allowed
}

/** Записи всех мастеров бизнеса на день (для журнала) */
export async function fetchBusinessDayBookings(businessId, masterIds = [], day = dayOffset(0)) {
  if (!supabase || !masterIds.length) return []

  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(day)
  end.setHours(23, 59, 59, 999)

  let query = supabase
    .from('bookings')
    .select(
      'id, master_id, starts_at, ends_at, status, client_telegram_id, external_source, service_id, services(title, duration_min)',
    )
    .in('master_id', masterIds)
    .gte('starts_at', start.toISOString())
    .lte('starts_at', end.toISOString())
    .order('starts_at')

  if (businessId) query = query.eq('business_id', businessId)

  const { data, error } = await query
  if (error) {
    console.warn('business day bookings:', error.message)
    return []
  }
  return data ?? []
}

export function daysSince(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)))
}

/** История визитов клиентов мастера (для «Заполнить окна») */
export async function fetchClientVisitHistory(masterId) {
  if (!masterId || !supabase) return []

  const { data, error } = await supabase
    .from('bookings')
    .select('client_telegram_id, starts_at, status')
    .eq('master_id', masterId)
    .in('status', ['completed', 'confirmed', 'pending'])
    .not('client_telegram_id', 'is', null)
    .order('starts_at', { ascending: false })
    .limit(400)

  if (error) {
    console.warn('client visit history:', error.message)
    return []
  }
  return data ?? []
}

/**
 * Ранжирование без AI: давно не был + похожий weekday/час + есть telegram_id.
 * freeSlots: [{ start: Date, ... }]
 */
export function rankInviteCandidates(historyRows, freeSlots, { limit = 6 } = {}) {
  if (!historyRows?.length || !freeSlots?.length) return []

  const byClient = new Map()
  for (const row of historyRows) {
    const key = String(row.client_telegram_id)
    const start = new Date(row.starts_at)
    if (Number.isNaN(start.getTime())) continue
    let entry = byClient.get(key)
    if (!entry) {
      entry = {
        client_telegram_id: row.client_telegram_id,
        last_visit_at: row.starts_at,
        visits: 0,
        weekdayHits: new Array(7).fill(0),
        hourHits: new Array(24).fill(0),
      }
      byClient.set(key, entry)
    }
    entry.visits += 1
    if (new Date(row.starts_at) > new Date(entry.last_visit_at)) {
      entry.last_visit_at = row.starts_at
    }
    entry.weekdayHits[start.getDay()] += 1
    entry.hourHits[start.getHours()] += 1
  }

  const slots = freeSlots
    .map((s) => {
      const start = s.start instanceof Date ? s.start : new Date(s.start || s.iso)
      return { start, iso: start.toISOString() }
    })
    .filter((s) => !Number.isNaN(s.start.getTime()))

  const scored = []
  for (const c of byClient.values()) {
    const days = daysSince(c.last_visit_at)
    let preferredWeekday = 0
    let preferredHour = 12
    let maxW = -1
    let maxH = -1
    for (let i = 0; i < 7; i += 1) {
      if (c.weekdayHits[i] > maxW) {
        maxW = c.weekdayHits[i]
        preferredWeekday = i
      }
    }
    for (let h = 0; h < 24; h += 1) {
      if (c.hourHits[h] > maxH) {
        maxH = c.hourHits[h]
        preferredHour = h
      }
    }

    let bestSlot = slots[0]
    let bestFit = -1
    for (const slot of slots) {
      const wd = slot.start.getDay()
      const hr = slot.start.getHours()
      const fit =
        (c.weekdayHits[wd] || 0) * 3 +
        (c.hourHits[hr] || 0) * 2 +
        (Math.abs(hr - preferredHour) <= 1 ? 2 : 0)
      if (fit > bestFit) {
        bestFit = fit
        bestSlot = slot
      }
    }

    // Бонус «давно не был», но не новичков с 0 историей паттерна
    const recency = Math.min(days, 120)
    const score = recency * 2 + bestFit * 4 + Math.min(c.visits, 10)

    scored.push({
      client_telegram_id: c.client_telegram_id,
      last_visit_at: c.last_visit_at,
      visits: c.visits,
      preferred_weekday: preferredWeekday,
      preferred_hour: preferredHour,
      best_slot_iso: bestSlot.iso,
      score,
    })
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Сторонняя запись из кабинета (YClients, ЛС и т.п.) */
export async function createExternalBooking({
  masterId,
  businessId = null,
  source,
  startsAt,
  durationMin = 60,
}) {
  if (!supabase) return { ok: false, error: 'Нет подключения к Supabase' }
  if (!masterId || !source?.trim() || !startsAt) {
    return { ok: false, error: 'Заполните источник, дату и время' }
  }

  const start = startsAt instanceof Date ? startsAt : new Date(startsAt)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'Некорректное время' }

  const duration = Math.min(180, Math.max(15, Number(durationMin) || 60))
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
    return { ok: false, error: 'Это время уже занято' }
  }

  const row = {
    master_id: masterId,
    service_id: null,
    status: 'confirmed',
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    price_cents: 0,
    currency: 'RUB',
    client_telegram_id: null,
    external_source: String(source).trim().slice(0, 60),
    notes: `Сторонняя: ${String(source).trim().slice(0, 60)}`,
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

export const EXTERNAL_BOT_DEEPLINK = 'https://t.me/booking_inapp_bot?start=external'
