/**
 * Суточный rollup статистики + purge старых bookings.
 * Константы политики хранения — здесь.
 *
 * Основное хранилище: public.booking_stats_monthly (migration_booking_stats_monthly.sql).
 * Fallback до миграции: businesses.settings.stats_monthly[master_id][month].
 */
import cron from 'node-cron'
import { getBotSupabase } from './supabaseBot.js'

/** Сырые записи храним N месяцев от ends_at. */
export const RAW_BOOKINGS_KEEP_MONTHS = 18
/** UI клиента «прошлые» — не глубже этого окна. */
export const CLIENT_PAST_UI_MONTHS = 12
/** UI аналитики мастера — месячные агрегаты за этот срок. */
export const STATS_UI_MONTHS = 12

const PURGE_BATCH = 2000

function monthStartUtc(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function addMonthsUtc(d, delta) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1))
}

function toMonthDate(d) {
  return d.toISOString().slice(0, 10)
}

function emptyAgg(masterId, businessId, month) {
  return {
    master_id: masterId,
    business_id: businessId || null,
    month,
    completed_count: 0,
    cancelled_count: 0,
    no_show_count: 0,
    revenue_cents: 0,
    updated_at: new Date().toISOString(),
  }
}

async function upsertStatsTable(supabase, rows) {
  const { error } = await supabase
    .from('booking_stats_monthly')
    .upsert(rows, { onConflict: 'master_id,month' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Fallback: settings.stats_monthly[masterId][month] = agg */
async function upsertStatsSettingsFallback(supabase, rows) {
  let wrote = 0
  for (const row of rows) {
    if (!row.business_id) continue
    const { data: biz, error: readErr } = await supabase
      .from('businesses')
      .select('settings')
      .eq('id', row.business_id)
      .maybeSingle()
    if (readErr) return { ok: false, error: readErr.message }

    const settings =
      biz?.settings && typeof biz.settings === 'object' ? { ...biz.settings } : {}
    const byMaster =
      settings.stats_monthly && typeof settings.stats_monthly === 'object'
        ? { ...settings.stats_monthly }
        : {}
    const masterKey = String(row.master_id)
    const months =
      byMaster[masterKey] && typeof byMaster[masterKey] === 'object'
        ? { ...byMaster[masterKey] }
        : {}
    months[row.month] = {
      completed_count: row.completed_count,
      cancelled_count: row.cancelled_count,
      no_show_count: row.no_show_count,
      revenue_cents: row.revenue_cents,
      updated_at: row.updated_at,
    }
    byMaster[masterKey] = months
    settings.stats_monthly = byMaster

    const { error: upErr } = await supabase
      .from('businesses')
      .update({ settings })
      .eq('id', row.business_id)
    if (upErr) return { ok: false, error: upErr.message }
    wrote += 1
  }
  return { ok: true, wrote, via: 'settings' }
}

/**
 * Агрегат одного календарного месяца [monthStart, nextMonth).
 */
export async function rollupMonth(supabase, monthStart) {
  const start = monthStart instanceof Date ? monthStart : new Date(monthStart)
  const end = addMonthsUtc(start, 1)
  const month = toMonthDate(start)

  const { data, error } = await supabase
    .from('bookings')
    .select('id, master_id, business_id, status, price_cents, starts_at')
    .gte('starts_at', start.toISOString())
    .lt('starts_at', end.toISOString())
    .limit(20000)

  if (error) {
    return { ok: false, month, error: error.message, upserted: 0 }
  }

  /** @type {Map<string, object>} */
  const byKey = new Map()
  for (const row of data || []) {
    if (!row.master_id) continue
    const key = `${row.master_id}|${month}`
    let agg = byKey.get(key)
    if (!agg) {
      agg = emptyAgg(row.master_id, row.business_id, month)
      byKey.set(key, agg)
    }
    if (row.business_id && !agg.business_id) agg.business_id = row.business_id
    if (row.status === 'completed') {
      agg.completed_count += 1
      agg.revenue_cents += Number(row.price_cents) || 0
    } else if (
      row.status === 'cancelled_by_client' ||
      row.status === 'cancelled_by_master'
    ) {
      agg.cancelled_count += 1
    } else if (row.status === 'no_show') {
      agg.no_show_count += 1
    }
  }

  const rows = [...byKey.values()]
  if (!rows.length) {
    return { ok: true, month, upserted: 0, via: 'none' }
  }

  const tableRes = await upsertStatsTable(supabase, rows)
  if (tableRes.ok) {
    return { ok: true, month, upserted: rows.length, via: 'table' }
  }

  const fb = await upsertStatsSettingsFallback(supabase, rows)
  if (!fb.ok) {
    return {
      ok: false,
      month,
      error: `table: ${tableRes.error}; settings: ${fb.error}`,
      upserted: 0,
    }
  }
  return {
    ok: true,
    month,
    upserted: fb.wrote || rows.length,
    via: 'settings',
    tableError: tableRes.error,
  }
}

/** Rollup прошлого и текущего месяца. */
export async function runStatsRollup(supabase) {
  const now = new Date()
  const current = monthStartUtc(now)
  const previous = addMonthsUtc(current, -1)
  const results = []
  for (const m of [previous, current]) {
    results.push(await rollupMonth(supabase, m))
  }
  return results
}

/**
 * Удаляет сырые bookings старше keepMonths (по ends_at).
 * Батчами, чтобы не лочить таблицу.
 */
export async function purgeOldBookings(
  supabase,
  { keepMonths = RAW_BOOKINGS_KEEP_MONTHS, batch = PURGE_BATCH } = {},
) {
  const cutoff = new Date()
  cutoff.setUTCMonth(cutoff.getUTCMonth() - keepMonths)
  const cutoffIso = cutoff.toISOString()

  const { data, error } = await supabase
    .from('bookings')
    .select('id')
    .lt('ends_at', cutoffIso)
    .order('ends_at', { ascending: true })
    .limit(batch)

  if (error) {
    return { ok: false, deleted: 0, error: error.message, cutoff: cutoffIso }
  }

  const ids = (data || []).map((r) => r.id).filter(Boolean)
  if (!ids.length) {
    return { ok: true, deleted: 0, cutoff: cutoffIso }
  }

  const { error: delErr } = await supabase.from('bookings').delete().in('id', ids)
  if (delErr) {
    return { ok: false, deleted: 0, error: delErr.message, cutoff: cutoffIso }
  }
  return { ok: true, deleted: ids.length, cutoff: cutoffIso }
}

export async function runDataRetentionTick() {
  const supabase = getBotSupabase({ write: true })
  if (!supabase) {
    console.warn('[retention] нет service_role — пропуск')
    return { ok: false, error: 'no supabase' }
  }

  const rollups = await runStatsRollup(supabase)
  for (const r of rollups) {
    if (!r.ok) {
      console.warn(`[retention] rollup ${r.month}:`, r.error)
    } else {
      console.log(
        `[retention] rollup ${r.month}: upserted=${r.upserted} via=${r.via || '?'}`,
      )
    }
  }

  try {
    const { queueAutoMonthlyReports } = await import('./monthlyReport.js')
    const prevMonth = toMonthDate(addMonthsUtc(monthStartUtc(), -1))
    const queued = await queueAutoMonthlyReports(supabase, prevMonth)
    if (queued) console.log(`[retention] queued monthly reports: ${queued}`)
  } catch (err) {
    console.warn('[retention] auto reports:', err?.message || err)
  }

  const purged = await purgeOldBookings(supabase)
  if (!purged.ok) {
    console.warn('[retention] purge:', purged.error)
  } else if (purged.deleted) {
    console.log(`[retention] purge deleted=${purged.deleted} older than ${purged.cutoff}`)
  }

  return { ok: true, rollups, purged }
}

/** Cron 03:15 каждый день (локальное время процесса). */
export function startDataRetentionJobs() {
  const supabase = getBotSupabase({ write: true })
  if (!supabase) {
    console.warn('Retention выключен: нет SUPABASE_SERVICE_ROLE_KEY')
    return
  }

  cron.schedule('15 3 * * *', () => {
    runDataRetentionTick().catch((err) => {
      console.warn('[retention] tick failed:', err?.message || err)
    })
  })

  console.log(
    `Retention: rollup+purge cron 03:15 (keep raw ${RAW_BOOKINGS_KEEP_MONTHS} мес)`,
  )

  runStatsRollup(supabase)
    .then((rows) => {
      for (const r of rows) {
        if (!r.ok) console.warn(`[retention] boot rollup ${r.month}:`, r.error)
        else {
          console.log(
            `[retention] boot rollup ${r.month}: upserted=${r.upserted} via=${r.via || '?'}`,
          )
        }
      }
    })
    .catch((err) => console.warn('[retention] boot rollup:', err?.message || err))
}
