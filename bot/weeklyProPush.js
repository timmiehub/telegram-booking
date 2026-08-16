/**
 * Недельный пуш free-мастерам: реальные цифры + тезис про приоритет Pro.
 * Пн 10:00 Europe/Moscow.
 */
import cron from 'node-cron'
import { getBotSupabase } from './supabaseBot.js'
import { isProPlan } from './proPlan.js'

const DAY_MS = 864e5
const EMPTY_CABINET_DAYS = 21

function isLifetimePro(settings) {
  const src = String(settings?.pro_source || '')
  if (src.startsWith('lifetime') || src.startsWith('early')) return true
  if (settings?.plan === 'pro' && !settings?.pro_until) return true
  return false
}

async function notifyTelegram(telegramId, text) {
  const token = String(process.env.BOT_TOKEN || '').trim()
  if (!token || !telegramId || !text) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        disable_web_page_preview: true,
      }),
    })
    return res.ok
  } catch (err) {
    console.warn('weekly pro push:', err?.message || err)
    return false
  }
}

async function weekStatsForMaster(supabase, masterId) {
  const since = new Date(Date.now() - 7 * DAY_MS).toISOString()
  const { data, error } = await supabase
    .from('bookings')
    .select('status')
    .eq('master_id', masterId)
    .gte('starts_at', since)
    .limit(400)
  if (error) {
    console.warn('weekly stats:', error.message)
    return { bookings: 0, cancelled: 0 }
  }
  let bookings = 0
  let cancelled = 0
  for (const row of data || []) {
    const st = String(row.status || '')
    if (st === 'pending' || st === 'confirmed' || st === 'completed') bookings += 1
    if (st.startsWith('cancelled')) cancelled += 1
  }
  return { bookings, cancelled }
}

export async function runWeeklyProPush() {
  const supabase = getBotSupabase({ write: false })
  if (!supabase) {
    console.warn('[weeklyProPush] нет Supabase')
    return { sent: 0 }
  }

  const { data: businesses, error } = await supabase
    .from('businesses')
    .select('id, name, created_at, settings, owner_profile_id, profiles!businesses_owner_profile_id_fkey(telegram_id)')
    .limit(800)

  if (error) {
    // fallback без join
    const { data: biz2, error: e2 } = await supabase
      .from('businesses')
      .select('id, name, created_at, settings, owner_profile_id')
      .limit(800)
    if (e2) {
      console.warn('[weeklyProPush]', e2.message)
      return { sent: 0, error: e2.message }
    }
    let sent = 0
    for (const b of biz2 || []) {
      const ok = await pushOne(supabase, b, null)
      if (ok) sent += 1
    }
    console.log(`[weeklyProPush] sent=${sent}`)
    return { sent }
  }

  let sent = 0
  for (const b of businesses || []) {
    const tg = b.profiles?.telegram_id ?? null
    const ok = await pushOne(supabase, b, tg)
    if (ok) sent += 1
  }
  console.log(`[weeklyProPush] sent=${sent}`)
  return { sent }
}

async function pushOne(supabase, business, telegramIdDirect) {
  const settings = business.settings || {}
  if (isProPlan(settings) || isLifetimePro(settings)) return false

  let telegramId = telegramIdDirect
  if (!telegramId && business.owner_profile_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('telegram_id')
      .eq('id', business.owner_profile_id)
      .maybeSingle()
    telegramId = profile?.telegram_id || null
  }
  if (!telegramId) return false

  const createdMs = business.created_at ? Date.parse(business.created_at) : NaN
  const ageDays = Number.isFinite(createdMs)
    ? (Date.now() - createdMs) / DAY_MS
    : 999

  const { data: member } = await supabase
    .from('business_members')
    .select('profile_id')
    .eq('business_id', business.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  const masterId = member?.profile_id || business.owner_profile_id
  if (!masterId) return false

  const stats = await weekStatsForMaster(supabase, masterId)
  if (stats.bookings === 0 && stats.cancelled === 0 && ageDays > EMPTY_CABINET_DAYS) {
    return false
  }

  const webapp = String(process.env.WEBAPP_URL || '').replace(/\/$/, '')
  const lines = ['Итог недели в «Моя запись»']
  if (stats.bookings || stats.cancelled) {
    lines.push(`Записи: ${stats.bookings}. Отмены: ${stats.cancelled}.`)
  } else {
    lines.push('За неделю новых записей пока не было.')
  }
  lines.push(
    'В поиске Pro показывают выше — так чаще находят новые клиенты.',
  )
  lines.push('Pro · 499 ₽/мес — в кабинете → Ещё → Pro.')
  if (webapp) lines.push(webapp)

  return notifyTelegram(telegramId, lines.join('\n'))
}

export function startWeeklyProPushJobs() {
  // Пн 07:00 UTC ≈ 10:00 МСК
  cron.schedule('0 7 * * 1', () => {
    runWeeklyProPush().catch((err) =>
      console.error('[weeklyProPush]', err?.message || err),
    )
  })
  console.log('Weekly Pro push: cron Mon 07:00 UTC (~10:00 МСК)')
}
