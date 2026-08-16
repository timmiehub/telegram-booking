import cron from 'node-cron'
import { Markup } from 'telegraf'
import { getBotSupabase } from './supabaseBot.js'
import {
  copyCancelledByClient,
  copyCancelledByMaster,
  copyConfirmedByMaster,
  copyClientReminder24h,
  copyClientReminder2h,
  copyClientAfterVisit,
  copyMasterHourBefore,
  copyNewBooking,
  copyRescheduledClient,
  copyRescheduledMaster,
  formatTimeOnly,
} from './notifyCopy.js'
import { isProPlan } from './proPlan.js'
import { fillReminderTemplate, normalizeReminders } from './remindersSettings.js'
import { processReportRequests } from './monthlyReport.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** Пауза между исходящими, чтобы не бить API пачкой (антиспам Telegram). */
const SEND_GAP_MS = 120
/** Жёсткий потолок исходящих за один cron-tick */
const MAX_SENDS_PER_TICK = 40

let sendsThisTick = 0

function resetTickBudget() {
  sendsThisTick = 0
}

async function guardedSend(bot, chatId, text, extra) {
  if (sendsThisTick >= MAX_SENDS_PER_TICK) {
    console.warn('[ANTIBAN] reminder tick budget exhausted')
    return false
  }
  try {
    await bot.telegram.sendMessage(chatId, text, extra)
    sendsThisTick += 1
    await sleep(SEND_GAP_MS)
    return true
  } catch (err) {
    const msg = String(err?.message || '')
    if (/429|Too Many Requests/i.test(msg)) {
      const retry = Number((msg.match(/retry after (\d+)/i) || [])[1]) || 5
      console.warn(`[ANTIBAN] reminder 429 — sleep ${retry}s`)
      await sleep(retry * 1000)
      return false
    }
    console.warn(`Не отправили → ${chatId}:`, msg)
    await sleep(SEND_GAP_MS)
    return false
  }
}

/**
 * Poll: напоминания клиенту (24ч/2ч) + пуш мастеру + события отмены/переноса.
 */
export function startReminderJobs(bot) {
  const supabase = getBotSupabase({ write: true }) || getBotSupabase({ write: false })

  if (!supabase) {
    console.warn('Напоминания выключены: нет SUPABASE_URL / ключей в bot/.env')
    return
  }

  async function tick() {
    resetTickBudget()
    const now = Date.now()
    const in26h = new Date(now + 26 * 60 * 60 * 1000).toISOString()
    const in22h = new Date(now + 22 * 60 * 60 * 1000).toISOString()
    const in3h = new Date(now + 3 * 60 * 60 * 1000).toISOString()
    const in1h = new Date(now + 1 * 60 * 60 * 1000).toISOString()

    await sendBatch(bot, supabase, {
      from: in22h,
      to: in26h,
      flag: 'reminded_24h',
      kind: '24h',
      withConfirm: true,
    })

    await sendBatch(bot, supabase, {
      from: in1h,
      to: in3h,
      flag: 'reminded_2h',
      kind: '2h',
      withConfirm: false,
    })

    await notifyMasters(bot, supabase)
    await notifyMastersHourBefore(bot, supabase)
    await sendAfterVisitThanks(bot, supabase)
    await processEventNotifications(bot, supabase)
    await processReportRequests(bot, supabase, guardedSend)
  }

  cron.schedule('*/1 * * * *', () => {
    tick().catch((err) => console.error('reminder tick:', err))
  })

  console.log('Напоминания + пуш мастеру + события: cron каждую минуту')
  tick().catch((err) => console.error('reminder first tick:', err))
}

async function sendBatch(bot, supabase, { from, to, flag, kind, withConfirm = false }) {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, starts_at, client_telegram_id, status, business_id, services(title), businesses(settings, address, name)',
    )
    .in('status', ['pending', 'confirmed'])
    .eq(flag, false)
    .not('client_telegram_id', 'is', null)
    .gte('starts_at', from)
    .lte('starts_at', to)
    .limit(30)

  if (error) {
    if (String(error.message || '').includes('reminded_')) {
      console.warn(
        'Нужна миграция: supabase/migration_reminders.sql или migration_master_notify.sql',
      )
    } else {
      console.warn('reminder query:', error.message)
    }
    return
  }

  for (const row of data ?? []) {
    const title = row.services?.title || 'визит'
    const time = formatTimeOnly(row.starts_at)
    const place = row.businesses?.address || row.businesses?.name || ''
    const settings = row.businesses?.settings || {}
    const rem = normalizeReminders(settings.reminders)
    const pro = isProPlan(settings)

    let text
    if (kind === '24h') {
      text =
        pro && rem.client_24h
          ? fillReminderTemplate(rem.client_24h, { time, title, place })
          : copyClientReminder24h({ title, startsAt: row.starts_at })
    } else {
      text =
        pro && rem.client_2h
          ? fillReminderTemplate(rem.client_2h, { time, title, place })
          : copyClientReminder2h({ title, startsAt: row.starts_at })
    }

    const extra =
      withConfirm && row.status === 'pending'
        ? Markup.inlineKeyboard([
            [Markup.button.callback('Подтверждаю визит', `confirm:${row.id}`)],
          ])
        : undefined

    try {
      const ok = await guardedSend(bot, row.client_telegram_id, text, extra)
      if (!ok) continue
      await supabase
        .from('bookings')
        .update({ [flag]: true })
        .eq('id', row.id)
      console.log(`Напоминание ${flag} → ${row.client_telegram_id}`)
    } catch (err) {
      console.warn(`Не отправили ${row.id}:`, err.message)
    }
  }
}

/** Pro: «спасибо после визита» для completed без thanked_after. */
async function sendAfterVisitThanks(bot, supabase) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, starts_at, client_telegram_id, business_id, services(title), businesses(settings, address, name)',
    )
    .eq('status', 'completed')
    .eq('thanked_after', false)
    .not('client_telegram_id', 'is', null)
    .gte('starts_at', since)
    .limit(20)

  if (error) {
    if (/thanked_after/i.test(String(error.message || ''))) {
      console.warn('Нужна миграция: supabase/migration_pro_extras.sql')
    } else {
      console.warn('after-visit query:', error.message)
    }
    return
  }

  for (const row of data ?? []) {
    const settings = row.businesses?.settings || {}
    if (!isProPlan(settings)) {
      await supabase.from('bookings').update({ thanked_after: true }).eq('id', row.id)
      continue
    }
    const rem = normalizeReminders(settings.reminders)
    if (!rem.after_visit_on) {
      await supabase.from('bookings').update({ thanked_after: true }).eq('id', row.id)
      continue
    }
    const title = row.services?.title || 'визит'
    const time = formatTimeOnly(row.starts_at)
    const place = row.businesses?.address || row.businesses?.name || ''
    const text = rem.after_visit
      ? fillReminderTemplate(rem.after_visit, { time, title, place })
      : copyClientAfterVisit({ title })

    const ok = await guardedSend(bot, row.client_telegram_id, text)
    if (ok) {
      await supabase.from('bookings').update({ thanked_after: true }).eq('id', row.id)
      console.log(`После визита → ${row.client_telegram_id}`)
    }
  }
}

async function resolveClientTag(supabase, bot, telegramId) {
  if (!telegramId) return ''

  const { data } = await supabase
    .from('profiles')
    .select('username, full_name')
    .eq('telegram_id', telegramId)
    .maybeSingle()

  if (data?.username) return `@${data.username}`
  if (data?.full_name) return data.full_name

  try {
    const chat = await bot.telegram.getChat(telegramId)
    if (chat?.username) return `@${chat.username}`
    const name = [chat?.first_name, chat?.last_name].filter(Boolean).join(' ')
    if (name) return name
  } catch {
    // ignore
  }

  return `TG ${telegramId}`
}

async function notifyMasters(bot, supabase) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('bookings')
    .select('id, starts_at, master_id, client_telegram_id, services(title)')
    .eq('status', 'pending')
    .eq('master_notified', false)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(20)

  if (error) {
    if (String(error.message || '').includes('master_notified')) {
      console.warn(
        'Нужна миграция: выполни supabase/migration_master_notify.sql в SQL Editor',
      )
    } else {
      console.warn('master notify query:', error.message)
    }
    return
  }

  for (const row of data ?? []) {
    const { data: master } = await supabase
      .from('profiles')
      .select('telegram_id')
      .eq('id', row.master_id)
      .maybeSingle()

    const masterTg = master?.telegram_id
    if (!masterTg) {
      await supabase
        .from('bookings')
        .update({ master_notified: true })
        .eq('id', row.id)
      continue
    }

    const title = row.services?.title || 'услуга'
    const clientTag = await resolveClientTag(
      supabase,
      bot,
      row.client_telegram_id,
    )
    const text = copyNewBooking({
      title,
      startsAt: row.starts_at,
      clientTag,
    })

    const extra = Markup.inlineKeyboard([
      [
        Markup.button.callback('Подтвердить', `mconfirm:${row.id}`),
        Markup.button.callback('Отменить', `mdecline:${row.id}`),
      ],
    ])

    const ok = await guardedSend(bot, masterTg, text, extra)
    if (ok) {
      await supabase
        .from('bookings')
        .update({ master_notified: true })
        .eq('id', row.id)
      console.log(`Пуш мастеру ${masterTg} о ${row.id}`)
    }
  }
}

/**
 * Pro: напоминание мастеру ~за час до визита.
 */
async function notifyMastersHourBefore(bot, supabase) {
  const now = Date.now()
  const from = new Date(now + 50 * 60 * 1000).toISOString()
  const to = new Date(now + 70 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, starts_at, master_id, business_id, client_telegram_id, services(title), businesses(settings)',
    )
    .in('status', ['pending', 'confirmed'])
    .eq('master_reminded_1h', false)
    .gte('starts_at', from)
    .lte('starts_at', to)
    .limit(30)

  if (error) {
    if (/master_reminded_1h/i.test(String(error.message || ''))) {
      console.warn(
        'Нужна миграция: supabase/migration_pro_promo.sql (колонка master_reminded_1h)',
      )
    } else {
      console.warn('master 1h remind:', error.message)
    }
    return
  }

  for (const row of data ?? []) {
    let settings = row.businesses?.settings || null
    if (!settings && row.business_id) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('settings')
        .eq('id', row.business_id)
        .maybeSingle()
      settings = biz?.settings || {}
    }
    if (!settings) {
      const { data: mem } = await supabase
        .from('business_members')
        .select('business_id, businesses(settings)')
        .eq('profile_id', row.master_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      settings = mem?.businesses?.settings || {}
    }

    const planOk = settings.plan === 'pro'
    const untilOk =
      !settings.pro_until || new Date(settings.pro_until).getTime() > Date.now()
    if (!planOk || !untilOk) {
      await supabase
        .from('bookings')
        .update({ master_reminded_1h: true })
        .eq('id', row.id)
      continue
    }

    const { data: master } = await supabase
      .from('profiles')
      .select('telegram_id')
      .eq('id', row.master_id)
      .maybeSingle()

    const masterTg = master?.telegram_id
    if (!masterTg) {
      await supabase
        .from('bookings')
        .update({ master_reminded_1h: true })
        .eq('id', row.id)
      continue
    }

    const title = row.services?.title || 'визит'
    const clientTag = await resolveClientTag(
      supabase,
      bot,
      row.client_telegram_id,
    )
    const text = copyMasterHourBefore({
      title,
      startsAt: row.starts_at,
      clientTag,
    })

    const ok = await guardedSend(bot, masterTg, text)
    if (ok) {
      await supabase
        .from('bookings')
        .update({ master_reminded_1h: true })
        .eq('id', row.id)
      console.log(`Pro 1h мастеру ${masterTg} о ${row.id}`)
    }
  }
}

async function markNotifySent(supabase, id) {
  await supabase.from('bookings').update({ notify_sent: true }).eq('id', id)
}

async function processEventNotifications(bot, supabase) {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, starts_at, master_id, client_telegram_id, notify_kind, services(title)',
    )
    .eq('notify_sent', false)
    .not('notify_kind', 'is', null)
    .limit(20)

  if (error) {
    if (/notify_/i.test(String(error.message || ''))) return
    console.warn('event notify:', error.message)
    return
  }

  for (const row of data ?? []) {
    const title = row.services?.title || 'услуга'

    const { data: master } = await supabase
      .from('profiles')
      .select('telegram_id')
      .eq('id', row.master_id)
      .maybeSingle()

    const masterTg = master?.telegram_id || null
    const clientTg = row.client_telegram_id || null

    try {
      if (row.notify_kind === 'cancelled_by_client') {
        // Только мастеру, с тегом клиента — без дубля клиенту
        if (!masterTg) {
          await markNotifySent(supabase, row.id)
          continue
        }
        const clientTag = await resolveClientTag(supabase, bot, clientTg)
        const text = copyCancelledByClient({
          title,
          startsAt: row.starts_at,
          clientTag,
        })
        const ok = await guardedSend(bot, masterTg, text)
        if (ok) {
          await markNotifySent(supabase, row.id)
          console.log(`Отмена клиентом → мастер ${masterTg}`)
        }
        continue
      }

      if (row.notify_kind === 'cancelled_by_master') {
        // Только клиенту
        if (!clientTg) {
          await markNotifySent(supabase, row.id)
          continue
        }
        const text = copyCancelledByMaster({
          title,
          startsAt: row.starts_at,
        })
        const ok = await guardedSend(bot, clientTg, text)
        if (ok) {
          await markNotifySent(supabase, row.id)
          console.log(`Отмена мастером → клиент ${clientTg}`)
        }
        continue
      }

      if (row.notify_kind === 'confirmed_by_master') {
        if (!clientTg) {
          await markNotifySent(supabase, row.id)
          continue
        }
        const text = copyConfirmedByMaster({
          title,
          startsAt: row.starts_at,
        })
        const ok = await guardedSend(bot, clientTg, text)
        if (ok) {
          await markNotifySent(supabase, row.id)
          console.log(`Подтверждение мастером → клиент ${clientTg}`)
        }
        continue
      }

      if (row.notify_kind === 'rescheduled') {
        const clientTag = await resolveClientTag(supabase, bot, clientTg)
        const clientText = copyRescheduledClient({
          title,
          startsAt: row.starts_at,
        })
        const masterText = copyRescheduledMaster({
          title,
          startsAt: row.starts_at,
          clientTag,
        })

        // Один chat — одно сообщение (с тегом)
        if (clientTg && masterTg && String(clientTg) === String(masterTg)) {
          await guardedSend(bot, masterTg, masterText)
        } else {
          if (clientTg) await guardedSend(bot, clientTg, clientText)
          if (masterTg) await guardedSend(bot, masterTg, masterText)
        }
        await markNotifySent(supabase, row.id)
        continue
      }

      await markNotifySent(supabase, row.id)
    } catch (err) {
      console.warn(`event notify ${row.id}:`, err.message)
    }
  }
}

/** Подтверждение визита из inline-кнопки (клиент) */
export async function confirmBookingFromCallback(supabase, bookingId) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ client_confirmed: true, status: 'confirmed' })
    .eq('id', bookingId)
    .in('status', ['pending', 'confirmed'])
    .select('id, status')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Запись не найдена' }
  return { ok: true, booking: data }
}

/**
 * Мастер подтверждает/отменяет pending-запись из чата.
 * telegramId — кто нажал; должен совпасть с profiles.telegram_id мастера.
 */
export async function masterRespondBookingFromCallback(
  supabase,
  bookingId,
  telegramId,
  action,
) {
  if (!supabase || !bookingId || !telegramId) {
    return { ok: false, error: 'Нет данных' }
  }

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, status, master_id, starts_at, services(title)')
    .eq('id', bookingId)
    .maybeSingle()

  if (fetchErr) return { ok: false, error: fetchErr.message }
  if (!booking) return { ok: false, error: 'Запись не найдена' }
  if (booking.status !== 'pending') {
    return { ok: false, error: 'Уже обработана', booking }
  }

  const { data: master, error: masterErr } = await supabase
    .from('profiles')
    .select('telegram_id')
    .eq('id', booking.master_id)
    .maybeSingle()

  if (masterErr) return { ok: false, error: masterErr.message }
  if (String(master?.telegram_id || '') !== String(telegramId)) {
    return { ok: false, error: 'Это не ваша запись' }
  }

  const title = booking.services?.title || 'услуга'
  if (action === 'confirm') {
    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        notify_kind: 'confirmed_by_master',
        notify_sent: false,
      })
      .eq('id', bookingId)
      .eq('status', 'pending')
      .select('id, status')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: 'Уже обработана' }
    return { ok: true, action: 'confirm', title, startsAt: booking.starts_at, booking: data }
  }

  if (action === 'decline') {
    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled_by_master',
        cancelled_at: new Date().toISOString(),
        notify_kind: 'cancelled_by_master',
        notify_sent: false,
      })
      .eq('id', bookingId)
      .eq('status', 'pending')
      .select('id, status')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: 'Уже обработана' }
    return { ok: true, action: 'decline', title, startsAt: booking.starts_at, booking: data }
  }

  return { ok: false, error: 'Неизвестное действие' }
}
