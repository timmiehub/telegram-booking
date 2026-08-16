import { isProPlan } from './proPlan.js'

export function formatMonthlyReport({
  monthLabel,
  businessName,
  completed = 0,
  cancelled = 0,
  noShow = 0,
  revenueCents = 0,
}) {
  const rub = Math.round(Number(revenueCents || 0) / 100)
  const name = businessName ? `«${businessName}»` : 'Кабинет'
  return (
    `Отчёт за ${monthLabel}\n` +
    `${name}\n\n` +
    `Визиты: ${completed}\n` +
    `Отмены: ${cancelled}\n` +
    `Не пришли: ${noShow}\n` +
    `Сумма: ${rub.toLocaleString('ru-RU')} ₽`
  )
}

function monthKeyFromIso(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function monthLabelRu(monthIso) {
  const d = new Date(monthIso)
  if (Number.isNaN(d.getTime())) return monthIso
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

async function loadMonthAgg(supabase, { businessId, masterId, month }) {
  let q = supabase
    .from('booking_stats_monthly')
    .select('completed_count, cancelled_count, no_show_count, revenue_cents')
    .eq('month', month)
    .limit(5)
  if (masterId) q = q.eq('master_id', masterId)
  else if (businessId) q = q.eq('business_id', businessId)

  const { data, error } = await q
  if (error) {
    console.warn('monthly report agg:', error.message)
    return null
  }
  const rows = data || []
  if (!rows.length) {
    return {
      completed_count: 0,
      cancelled_count: 0,
      no_show_count: 0,
      revenue_cents: 0,
    }
  }
  return rows.reduce(
    (acc, r) => ({
      completed_count: acc.completed_count + (Number(r.completed_count) || 0),
      cancelled_count: acc.cancelled_count + (Number(r.cancelled_count) || 0),
      no_show_count: acc.no_show_count + (Number(r.no_show_count) || 0),
      revenue_cents: acc.revenue_cents + (Number(r.revenue_cents) || 0),
    }),
    {
      completed_count: 0,
      cancelled_count: 0,
      no_show_count: 0,
      revenue_cents: 0,
    },
  )
}

/**
 * Ручной запрос: settings.request_report = 'YYYY-MM-01'
 * Авто: settings.request_report_auto ignored; dataRetention can set request_report.
 */
export async function processReportRequests(bot, supabase, guardedSend) {
  const { data: businesses, error } = await supabase
    .from('businesses')
    .select('id, name, settings, owner_profile_id')
    .not('settings->>request_report', 'is', null)
    .limit(20)

  if (error) {
    if (!/settings/i.test(String(error.message || ''))) {
      console.warn('report requests:', error.message)
    }
    return
  }

  for (const biz of businesses || []) {
    const settings =
      biz.settings && typeof biz.settings === 'object' ? { ...biz.settings } : {}
    const month = monthKeyFromIso(settings.request_report)
    if (!month || !isProPlan(settings)) {
      delete settings.request_report
      await supabase.from('businesses').update({ settings }).eq('id', biz.id)
      continue
    }

    const sentKey = `report_sent_${month.slice(0, 7)}`
    const { data: owner } = await supabase
      .from('profiles')
      .select('telegram_id')
      .eq('id', biz.owner_profile_id)
      .maybeSingle()

    const tg = owner?.telegram_id
    if (!tg) {
      delete settings.request_report
      settings[sentKey] = new Date().toISOString()
      await supabase.from('businesses').update({ settings }).eq('id', biz.id)
      continue
    }

    const agg = await loadMonthAgg(supabase, {
      businessId: biz.id,
      masterId: biz.owner_profile_id,
      month,
    })
    const text = formatMonthlyReport({
      monthLabel: monthLabelRu(month),
      businessName: biz.name,
      completed: agg?.completed_count || 0,
      cancelled: agg?.cancelled_count || 0,
      noShow: agg?.no_show_count || 0,
      revenueCents: agg?.revenue_cents || 0,
    })

    const ok = await guardedSend(bot, tg, text)
    if (!ok) continue

    delete settings.request_report
    settings[sentKey] = new Date().toISOString()
    await supabase.from('businesses').update({ settings }).eq('id', biz.id)
    console.log(`Отчёт ${month} → ${tg}`)
  }
}

/** После rollup прошлого месяца — поставить request_report для Pro-кабинетов. */
export async function queueAutoMonthlyReports(supabase, prevMonthIso) {
  const month = monthKeyFromIso(prevMonthIso)
  if (!month) return 0
  const sentKey = `report_sent_${month.slice(0, 7)}`

  const { data: businesses, error } = await supabase
    .from('businesses')
    .select('id, settings')
    .eq('settings->>plan', 'pro')
    .limit(200)

  if (error) {
    console.warn('queue auto reports:', error.message)
    return 0
  }

  let n = 0
  for (const biz of businesses || []) {
    const settings =
      biz.settings && typeof biz.settings === 'object' ? { ...biz.settings } : {}
    if (!isProPlan(settings)) continue
    if (settings[sentKey]) continue
    if (settings.request_report) continue
    settings.request_report = month
    const { error: upErr } = await supabase
      .from('businesses')
      .update({ settings })
      .eq('id', biz.id)
    if (!upErr) n += 1
  }
  return n
}
