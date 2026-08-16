import 'dotenv/config'
import logger from './logger.js'
import { Telegraf, Markup } from 'telegraf'
import { startReminderJobs, confirmBookingFromCallback, masterRespondBookingFromCallback } from './reminders.js'
import { startDataRetentionJobs } from './dataRetention.js'
import { startWeeklyProPushJobs } from './weeklyProPush.js'
import { startTributeWebhookServer } from './tributeWebhook.js'
import {
  createPendingFromSlot,
  resolveMaster,
} from './aiBook.js'
import {
  buildClientBookingLink,
  parseInviteStartParam,
} from './inviteLinks.js'
import { parseGrowthStartParam } from './growthAttribution.js'
import {
  parseExternalBookingSmart,
  resolveMasterForTelegram,
  createExternalBooking,
  createExternalBookingBatch,
  formatExternalWhen,
} from './externalBooking.js'
import {
  acquireSingleInstanceLock,
  antibanMiddleware,
  safeAnswerCbQuery,
  safeReply,
  safeEditMessage,
  wireFatalPollingGuard,
} from './telegramSafety.js'
import { handleAssistantMessage } from './assistantRouter.js'
import { getBotSupabase } from './supabaseBot.js'
import {
  setChatRole,
  roleLabel,
  resolveEffectiveRole,
} from './chatRole.js'
import { COPY, menuIntro } from './roleCopy.js'
import { formatWhenRu } from './timeFormat.js'
import {
  getClientBookingSession,
  setClientBookingSession,
  clearClientBookingSession,
  buildPlacePickerKeyboard,
  buildServicePickerKeyboard,
  buildDayPickerKeyboard,
  buildSlotsKeyboard,
  dayPickerText,
  dayOffsetToQuery,
  hasExplicitDay,
  loadSlotsForSlug,
  loadServicesForSlug,
  servicesPickerText,
} from './clientBookingFlow.js'
import { isSlugAllowedForClient, fetchClientMasters } from './clientMasters.js'

/** Мастер ждёт текст сторонней записи */
const externalPending = new Map()
const EXTERNAL_TTL_MS = 10 * 60_000

const BOT_TOKEN = process.env.BOT_TOKEN
const WEBAPP_URL = process.env.WEBAPP_URL || ''

if (!BOT_TOKEN) {
  logger.error('Ошибка: не задан BOT_TOKEN в файле .env')
  process.exit(1)
}

// Один polling на токен — иначе 409 и риск блокировки
acquireSingleInstanceLock()

function isValidWebAppUrl(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    if (parsed.hostname.includes('example')) return false
    if (/[а-яё]/i.test(parsed.hostname)) return false
    return true
  } catch {
    return false
  }
}

function withParams(extra = {}, { bare = false } = {}) {
  try {
    const u = new URL(WEBAPP_URL)
    u.searchParams.set('v', '2')
    if (bare) {
      u.searchParams.delete('business')
      u.searchParams.delete('master')
      u.searchParams.delete('view')
    }
    for (const [k, v] of Object.entries(extra)) {
      if (v == null || v === '') u.searchParams.delete(k)
      else u.searchParams.set(k, v)
    }
    return u.toString()
  } catch {
    const q = new URLSearchParams(
      Object.fromEntries(
        Object.entries(extra).filter(([, v]) => v != null && v !== ''),
      ),
    ).toString()
    const base = String(WEBAPP_URL || '').split('?')[0]
    return q ? `${base}?${q}` : base
  }
}


function getSupabase() {
  return getBotSupabase({ write: false })
}

async function ensureBotProfile(from) {
  const supabase = getSupabase()
  if (!supabase || !from?.id) return null
  const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ')
  const { data: existing } = await supabase
    .from('profiles')
    .select('id, telegram_id, role, slug')
    .eq('telegram_id', from.id)
    .maybeSingle()
  if (existing) return existing

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      telegram_id: from.id,
      full_name: fullName || null,
      username: from.username || null,
      role: 'client',
    })
    .select('id, telegram_id, role, slug')
    .single()
  if (error) {
    logger.warn('ensureBotProfile:', error.message)
    return null
  }
  return data
}

async function userHasCabinet(telegramId) {
  const supabase = getSupabase()
  if (!supabase || !telegramId) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, slug')
    .eq('telegram_id', telegramId)
    .maybeSingle()
  if (!profile) return false

  const { data: members, error } = await supabase
    .from('business_members')
    .select('id')
    .eq('profile_id', profile.id)
    .eq('is_active', true)
    .limit(1)

  if (!error && members?.length) return true
  // legacy
  return profile.role === 'master' && Boolean(profile.slug)
}

const webAppReady = isValidWebAppUrl(WEBAPP_URL)
if (!webAppReady) {
  logger.warn('WEBAPP_URL ещё не готов — кнопки Mini App будут текстовыми.')
}

const bot = new Telegraf(BOT_TOKEN, {
  handlerTimeout: 30_000,
})
bot.use(antibanMiddleware())
wireFatalPollingGuard(bot)

/**
 * Компактное меню: роли 2 в ряд, max 3–4 ряда.
 */
async function menuInline(ctx) {
  const hasCabinet = await userHasCabinet(ctx.from?.id)
  const role = resolveEffectiveRole(ctx.from?.id, { hasCabinet })
  const roleRu = role === 'master' ? 'исполнитель' : 'клиент'

  const rows = [
    [
      Markup.button.callback(
        role === 'client' ? '✓ Я клиент' : 'Я клиент',
        'role:client',
      ),
      Markup.button.callback(
        role === 'master' ? '✓ Я исполнитель' : 'Я исполнитель',
        'role:master',
      ),
    ],
  ]

  if (role === 'master' && hasCabinet) {
    rows.push([
      Markup.button.webApp(
        'Кабинет',
        withParams({ view: 'dashboard' }, { bare: true }),
      ),
      Markup.button.callback('➕ Сторонняя', 'ext:start'),
    ])
  } else if (role === 'master' && !hasCabinet) {
    rows.push([
      Markup.button.webApp(
        'Открыть кабинет',
        withParams({ view: 'onboard' }, { bare: true }),
      ),
    ])
  } else {
    // client
    const appRow = [
      Markup.button.callback('Записаться', 'chat:book'),
      Markup.button.webApp(
        'Приложение',
        withParams({ view: 'home' }, { bare: true }),
      ),
    ]
    rows.push(appRow)
    rows.push([
      Markup.button.webApp(
        'Мои записи',
        withParams({ view: 'mine' }, { bare: true }),
      ),
    ])
  }

  return {
    markup: Markup.inlineKeyboard(rows),
    roleRu,
    hasCabinet,
    role,
  }
}

async function sendAppMenu(ctx, intro, { edit = false } = {}) {
  if (!webAppReady) {
    const send = edit ? safeEditMessage : safeReply
    await send(ctx, 'Mini App не подключено. Нужен HTTPS WEBAPP_URL.')
    return
  }
  const menu = await menuInline(ctx)
  const text = `${intro}\n\nРежим: ${menu.roleRu}`
  if (edit) {
    await safeEditMessage(ctx, text, menu.markup)
  } else {
    await safeReply(ctx, text, menu.markup)
  }
}

function getExternalPending(telegramId) {
  const pending = externalPending.get(telegramId)
  if (!pending) return null
  if (Date.now() - (pending.startedAt || 0) > EXTERNAL_TTL_MS) {
    externalPending.delete(telegramId)
    return null
  }
  return pending
}

async function startExternalBookingFlow(ctx) {
  const hasCabinet = await userHasCabinet(ctx.from?.id)
  if (!hasCabinet) {
    await safeReply(
      ctx,
      'Команда для мастеров. Сначала создайте заведение в приложении.',
    )
    return
  }
  const master = await resolveMasterForTelegram(ctx.from?.id)
  if (!master?.masterId) {
    await safeReply(ctx, 'Не нашёл ваш профиль мастера.')
    return
  }
  externalPending.set(ctx.from.id, {
    ...master,
    startedAt: Date.now(),
  })
  await safeReply(
    ctx,
    'Напишите одной строкой: источник и когда.\n\nПримеры:\n• YClients завтра 15:00\n• Артём 01.09 в 17:00\n• Артём каждый вт и чт 17:00 до 31.12.2026',
    Markup.inlineKeyboard([[Markup.button.callback('Отмена', 'ext:cancel')]]),
  )
}

async function handleExternalBookingText(ctx, text) {
  const pending = getExternalPending(ctx.from?.id)
  if (!pending) return false

  if (!text?.trim()) {
    await safeReply(
      ctx,
      'Напишите источник и время, например: YClients завтра 15:00',
    )
    return true
  }

  // Без промежуточного «Разбираю…» — меньше исходящих
  const parsed = await parseExternalBookingSmart(text)
  externalPending.delete(ctx.from?.id)

  if (!parsed.ok) {
    await safeReply(ctx, `${parsed.error}\n\nПопробуйте снова: /external`)
    return true
  }

  const kb = webAppReady
    ? Markup.inlineKeyboard([
        [
          Markup.button.webApp(
            'Расписание',
            withParams({ view: 'dashboard' }, { bare: true }),
          ),
        ],
      ])
    : undefined

  if (parsed.kind === 'series' && parsed.slots?.length) {
    const result = await createExternalBookingBatch({
      masterId: pending.masterId,
      businessId: pending.businessId,
      service: pending.service,
      source: parsed.source,
      slots: parsed.slots,
      durationMin: parsed.durationMin,
    })

    if (!result.ok) {
      const hint =
        result.skipped > 0
          ? `Все ${result.total} слотов заняты.`
          : `Не вышло: ${result.errors?.[0] || 'ошибка'}`
      await safeReply(ctx, `${hint}\n\nПопробуйте снова: /external`)
      return true
    }

    const first = formatExternalWhen(parsed.slots[0])
    const last = formatExternalWhen(parsed.slots[parsed.slots.length - 1])
    const skipNote = result.skipped ? `, ${result.skipped} занято` : ''
    await safeReply(
      ctx,
      `Добавлено ${result.added} из ${result.total}${skipNote} ✅\n${parsed.source} · ${first} — ${last}`,
      kb,
    )
    return true
  }

  const result = await createExternalBooking({
    masterId: pending.masterId,
    businessId: pending.businessId,
    service: pending.service,
    source: parsed.source,
    startsAt: parsed.startsAt,
    durationMin: parsed.durationMin,
  })

  if (!result.ok) {
    await safeReply(
      ctx,
      result.error === 'Это время уже занято'
        ? 'Это время уже занято. Напишите /external — укажите другое.'
        : `Не вышло: ${result.error}`,
    )
    return true
  }

  const when = formatExternalWhen(parsed.startsAt)
  await safeReply(
    ctx,
    `Добавлено ✅\n${parsed.source} · ${when}\nСлот занят в расписании.`,
    kb,
  )
  return true
}

/** Если у человека ещё висят старые текстовые кнопки — сразу даём рабочую web_app. */
async function replyOpenApp(ctx, buttonLabel, url) {
  if (!webAppReady) {
    await safeReply(ctx, 'Mini App не подключено.')
    return
  }
  await safeReply(
    ctx,
    'Нажмите кнопку — откроется приложение:',
    Markup.inlineKeyboard([[Markup.button.webApp(buttonLabel, url)]]),
  )
}

bot.start(async (ctx) => {
  const name = ctx.from?.first_name ?? 'друг'
  logger.info('Получен /start от', name, ctx.from?.id)
  await ensureBotProfile(ctx.from)

  const payload = String(ctx.startPayload || '').trim()

  if (/^external$/i.test(payload)) {
    await startExternalBookingFlow(ctx)
    return
  }

  const joinMatch = payload.match(/^join_([A-Za-z0-9]+)$/i)
  if (joinMatch && webAppReady) {
    const code = joinMatch[1].toUpperCase()
    await ctx.reply(
      `Вас пригласили в команду.\nКод: ${code}\n\nОткройте приложение и подтвердите вступление.`,
      Markup.inlineKeyboard([
        [
          Markup.button.webApp(
            'Вступить в команду',
            withParams({ view: 'join', invite: code }, { bare: true }),
          ),
        ],
      ]),
    )
    return
  }

  const growth = parseGrowthStartParam(payload)
  if (webAppReady && (growth.kind === 'channel' || growth.kind === 'referral')) {
    const extra = { view: 'onboard' }
    if (growth.source) extra.src = growth.source
    if (growth.referrerTelegramId) extra.ref = String(growth.referrerTelegramId)
    const hint =
      growth.kind === 'referral'
        ? 'Вас пригласил коллега. Кабинет бесплатно — клиент сам выбирает время в Telegram.'
        : 'Кабинет мастера бесплатно: услуги, расписание, ссылка для клиентов. Pro — по желанию внутри.'
    await ctx.reply(
      `${hint}\n\nОткройте приложение и создайте кабинет за пару минут.`,
      Markup.inlineKeyboard([
        [Markup.button.webApp('Создать кабинет', withParams(extra, { bare: true }))],
      ]),
    )
    return
  }

  const invite = parseInviteStartParam(payload)
  if (invite.slug && webAppReady) {
    const extra = {}
    if (invite.serviceIdPrefix) extra.service = invite.serviceIdPrefix
    if (invite.slotAt && !Number.isNaN(invite.slotAt.getTime())) {
      extra.slot = invite.slotAt.toISOString()
    }
    const link = buildClientBookingLink(invite.slug, {
      serviceId: invite.serviceIdPrefix,
      slotIso: invite.slotAt?.toISOString(),
    })
    await ctx.reply(
      `Запись · ${invite.slug}\n${link}`,
      Markup.inlineKeyboard([
        [
          Markup.button.webApp(
            'Записаться',
            withParams({ business: invite.slug, view: 'book', ...extra }, { bare: true }),
          ),
        ],
      ]),
    )
    return
  }

  if (webAppReady) {
    const hasCabinet = await userHasCabinet(ctx.from?.id)
    const role = resolveEffectiveRole(ctx.from?.id, { hasCabinet })
    await sendAppMenu(ctx, menuIntro(name, roleLabel(role)))
    return
  }

  await ctx.reply(`Привет, ${name}!\nБот онлайн. Нужен HTTPS WEBAPP_URL.`)
})

bot.command('grantpro', async (ctx) => {
  const ownerId = String(process.env.OWNER_TELEGRAM_ID || '').trim()
  if (!ownerId || String(ctx.from?.id) !== ownerId) {
    await ctx.reply('Команда только для владельца продукта.')
    return
  }
  const supabase = getSupabase()
  if (!supabase) {
    await ctx.reply('Нет Supabase')
    return
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_id', ctx.from.id)
    .maybeSingle()
  if (!profile) {
    await ctx.reply('Профиль не найден')
    return
  }
  const { data: owned } = await supabase
    .from('businesses')
    .select('id, name, settings')
    .eq('owner_profile_id', profile.id)
  if (!owned?.length) {
    await ctx.reply('Нет заведений')
    return
  }
  for (const b of owned) {
    const settings = {
      ...(b.settings || {}),
      plan: 'pro',
      pro_source: 'grantpro',
      pro_until: new Date(Date.now() + 30 * 864e5).toISOString(),
    }
    await supabase.from('businesses').update({ settings }).eq('id', b.id)
  }
  await ctx.reply(`Pro выдан на ${owned.length} каб. (smoke /grantpro)`)
})

bot.command('promos', async (ctx) => {
  const ownerId = String(process.env.OWNER_TELEGRAM_ID || '').trim()
  if (ownerId && String(ctx.from?.id) !== ownerId) {
    await ctx.reply('Команда только для владельца продукта.')
    return
  }
  const supabase = getSupabase()
  if (!supabase) {
    await ctx.reply('Нет Supabase')
    return
  }
  const { data, error } = await supabase
    .from('pro_promo_codes')
    .select('code, used_at')
    .order('code', { ascending: true })
  if (error) {
    await ctx.reply(
      `Нет таблицы промокодов. Выполните migration_pro_promo.sql\n${error.message}`,
    )
    return
  }
  const free = (data || []).filter((r) => !r.used_at).map((r) => r.code)
  const used = (data || []).filter((r) => r.used_at).length
  if (!free.length) {
    await ctx.reply(`Свободных кодов нет. Использовано: ${used}`)
    return
  }
  const chunk = free.join('\n')
  await ctx.reply(
    `Свободные промокоды (3 месяца Pro, 1 раз):\n${chunk}\n\nИспользовано: ${used}`,
  )
})

function isNatimceAdmin(ctx) {
  return String(ctx.from?.username || '').toLowerCase() === 'natimce'
}

async function resolveOwnedBusinessesByTarget(supabase, rawTarget) {
  const target = String(rawTarget || '').trim()
  if (!target) return { error: 'Укажите @username или telegram_id' }

  let profile = null
  const asId = target.replace(/^@/, '')
  if (/^\d+$/.test(asId)) {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, telegram_id')
      .eq('telegram_id', Number(asId))
      .maybeSingle()
    profile = data
  } else {
    const uname = asId.toLowerCase()
    const { data } = await supabase
      .from('profiles')
      .select('id, username, telegram_id')
      .ilike('username', uname)
      .maybeSingle()
    profile = data
  }

  if (!profile) return { error: 'Профиль не найден' }

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, name, settings')
    .eq('owner_profile_id', profile.id)

  if (!owned?.length) {
    return { error: 'У пользователя нет кабинетов', profile }
  }
  return { profile, owned }
}

bot.command('grant_forever', async (ctx) => {
  if (!isNatimceAdmin(ctx)) {
    await ctx.reply('Команда только для @natimce.')
    return
  }
  const supabase = getSupabase()
  if (!supabase) {
    await ctx.reply('Нет Supabase')
    return
  }
  const arg = ctx.message?.text?.split(/\s+/).slice(1).join(' ')
  const resolved = await resolveOwnedBusinessesByTarget(supabase, arg)
  if (resolved.error) {
    await ctx.reply(resolved.error)
    return
  }
  let n = 0
  for (const b of resolved.owned) {
    const settings = {
      ...(b.settings || {}),
      plan: 'pro',
      pro_source: 'lifetime:admin',
      pro_waitlist: false,
    }
    delete settings.pro_until
    const { error } = await supabase
      .from('businesses')
      .update({ settings })
      .eq('id', b.id)
    if (!error) n += 1
  }
  const who =
    resolved.profile.username
      ? `@${resolved.profile.username}`
      : String(resolved.profile.telegram_id)
  await ctx.reply(`Вечный Pro: ${n} каб. → ${who}`)
})

bot.command('grant_pro3', async (ctx) => {
  if (!isNatimceAdmin(ctx)) {
    await ctx.reply('Команда только для @natimce.')
    return
  }
  const supabase = getSupabase()
  if (!supabase) {
    await ctx.reply('Нет Supabase')
    return
  }
  const arg = ctx.message?.text?.split(/\s+/).slice(1).join(' ')
  const resolved = await resolveOwnedBusinessesByTarget(supabase, arg)
  if (resolved.error) {
    await ctx.reply(resolved.error)
    return
  }
  const days = 90
  let n = 0
  let untilLabel = ''
  for (const b of resolved.owned) {
    const prev = b.settings || {}
    // Уже вечный — не укорачиваем сроком
    if (prev.plan === 'pro' && !prev.pro_until) {
      n += 1
      untilLabel = 'без срока'
      continue
    }
    const baseMs = Math.max(
      Date.now(),
      prev.pro_until ? new Date(prev.pro_until).getTime() || Date.now() : Date.now(),
    )
    const until = new Date(baseMs + days * 864e5).toISOString()
    untilLabel = new Date(until).toLocaleDateString('ru-RU')
    const settings = {
      ...prev,
      plan: 'pro',
      pro_source: 'admin:3m',
      pro_until: until,
      pro_waitlist: false,
    }
    const { error } = await supabase
      .from('businesses')
      .update({ settings })
      .eq('id', b.id)
    if (!error) n += 1
  }
  const who =
    resolved.profile.username
      ? `@${resolved.profile.username}`
      : String(resolved.profile.telegram_id)
  await ctx.reply(`Pro +3 мес: ${n} каб. → ${who}${untilLabel ? ` до ${untilLabel}` : ''}`)
})

bot.command('menu', async (ctx) => {
  await sendAppMenu(ctx, 'Меню приложения:')
})

bot.command('help', async (ctx) => {
  await safeReply(ctx, COPY.helpBot)
})

bot.hears(/^Открыть приложение$/i, async (ctx) => {
  const hasCabinet = await userHasCabinet(ctx.from?.id)
  await replyOpenApp(
    ctx,
    hasCabinet ? 'Мой кабинет' : 'Открыть приложение',
    withParams({ view: hasCabinet ? 'dashboard' : 'home' }, { bare: true }),
  )
})

bot.hears(/^Мои записи$/i, async (ctx) => {
  await replyOpenApp(ctx, 'Мои записи', withParams({ view: 'mine' }, { bare: true }))
})

bot.hears(/^Мой кабинет$/i, async (ctx) => {
  if (!(await userHasCabinet(ctx.from?.id))) {
    await replyOpenApp(
      ctx,
      'Создать заведение',
      withParams({ view: 'onboard' }, { bare: true }),
    )
    return
  }
  await replyOpenApp(ctx, 'Мой кабинет', withParams({ view: 'dashboard' }, { bare: true }))
})

bot.hears(/^Новое заведение$/i, async (ctx) => {
  await replyOpenApp(ctx, 'Стать мастером', withParams({ view: 'onboard' }, { bare: true }))
})

bot.command('ping', async (ctx) => {
  await ctx.reply('pong ✅ Бот онлайн.')
})

bot.command('pingweb', async (ctx) => {
  if (!WEBAPP_URL) {
    await ctx.reply('WEBAPP_URL пустой в bot/.env')
    return
  }
  const base = WEBAPP_URL.split('?')[0]
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(base, { method: 'HEAD', signal: ctrl.signal })
    clearTimeout(t)
    if (res.ok || res.status === 405 || res.status === 301 || res.status === 302) {
      await ctx.reply(`Сайт доступен ✅\n${WEBAPP_URL}\nHTTP ${res.status}`)
      return
    }
    await ctx.reply(`Сайт отвечает плохо: HTTP ${res.status}\n${WEBAPP_URL}`)
  } catch (err) {
    await ctx.reply(`Сайт недоступен ❌\n${WEBAPP_URL}\n${err.message}`)
  }
})

bot.command('register', async (ctx) => {
  await ensureBotProfile(ctx.from)
  await replyOpenApp(ctx, 'Стать мастером', withParams({ view: 'onboard' }, { bare: true }))
})

bot.hears(/^Стать мастером$/i, async (ctx) => {
  await ensureBotProfile(ctx.from)
  await replyOpenApp(ctx, 'Стать мастером', withParams({ view: 'onboard' }, { bare: true }))
})

bot.hears(
  [/открыть заведение/i, /регистрац/i],
  async (ctx) => {
    await ensureBotProfile(ctx.from)
    await replyOpenApp(ctx, 'Стать мастером', withParams({ view: 'onboard' }, { bare: true }))
  },
)

bot.command('app', async (ctx) => {
  await sendAppMenu(ctx, 'Приложение:')
})

bot.command('cabinet', async (ctx) => {
  const hasCabinet = await userHasCabinet(ctx.from?.id)
  if (!hasCabinet) {
    await replyOpenApp(
      ctx,
      'Создать заведение',
      withParams({ view: 'onboard' }, { bare: true }),
    )
    return
  }
  await replyOpenApp(ctx, 'Мой кабинет', withParams({ view: 'dashboard' }, { bare: true }))
})

bot.command('external', async (ctx) => {
  await ensureBotProfile(ctx.from)
  await startExternalBookingFlow(ctx)
})

bot.hears(/^➕\s*Сторонняя запись$/i, async (ctx) => {
  await ensureBotProfile(ctx.from)
  await startExternalBookingFlow(ctx)
})

bot.hears(/^➕\s*Запись$/i, async (ctx) => {
  await ensureBotProfile(ctx.from)
  await startExternalBookingFlow(ctx)
})

bot.action('ext:start', async (ctx) => {
  await safeAnswerCbQuery(ctx)
  await ensureBotProfile(ctx.from)
  await startExternalBookingFlow(ctx)
})

bot.action('ext:cancel', async (ctx) => {
  externalPending.delete(ctx.from?.id)
  await safeAnswerCbQuery(ctx, 'Отменено')
  await safeReply(ctx, 'Добавление отменено.')
})

bot.action('role:client', async (ctx) => {
  setChatRole(ctx.from?.id, 'client')
  await safeAnswerCbQuery(ctx, 'Клиент')
  await sendAppMenu(ctx, COPY.roleClient, { edit: true })
})

bot.action('role:master', async (ctx) => {
  const hasCabinet = await userHasCabinet(ctx.from?.id)
  setChatRole(ctx.from?.id, 'master')
  await safeAnswerCbQuery(ctx, 'Исполнитель')
  if (!hasCabinet) {
    await safeEditMessage(
      ctx,
      COPY.masterNoCabinet,
      Markup.inlineKeyboard([
        webAppReady
          ? [
              Markup.button.webApp(
                'Открыть кабинет',
                withParams({ view: 'onboard' }, { bare: true }),
              ),
              Markup.button.callback('Я клиент', 'role:client'),
            ]
          : [Markup.button.callback('Я клиент', 'role:client')],
      ]),
    )
    return
  }
  await sendAppMenu(ctx, COPY.roleMaster, { edit: true })
})

bot.action('chat:book', async (ctx) => {
  setChatRole(ctx.from?.id, 'client')
  await safeAnswerCbQuery(ctx)
  await safeEditMessage(
    ctx,
    COPY.clientHintBook,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('← Меню', 'menu:refresh'),
        Markup.button.webApp(
          'Приложение',
          withParams({ view: 'home' }, { bare: true }),
        ),
      ],
    ]),
  )
})

bot.action('menu:refresh', async (ctx) => {
  await safeAnswerCbQuery(ctx)
  const hasCabinet = await userHasCabinet(ctx.from?.id)
  const role = resolveEffectiveRole(ctx.from?.id, { hasCabinet })
  await sendAppMenu(ctx, menuIntro(ctx.from?.first_name, roleLabel(role)), {
    edit: true,
  })
})

bot.command('role', async (ctx) => {
  const hasCabinet = await userHasCabinet(ctx.from?.id)
  const role = resolveEffectiveRole(ctx.from?.id, { hasCabinet })
  await sendAppMenu(ctx, `Сейчас: ${roleLabel(role)}.`)
})

async function showDayPickerForPick(ctx, slug, businessName, { serviceId = null, serviceTitle = null } = {}) {
  setClientBookingSession(ctx.from.id, {
    slug,
    businessName: businessName || slug,
    serviceId: serviceId || null,
    serviceTitle: serviceTitle || null,
    timeQuery: null,
    dayOffset: null,
  })
  const session = getClientBookingSession(ctx.from.id)
  await safeEditMessage(
    ctx,
    dayPickerText(
      businessName || session?.businessName,
      serviceTitle || session?.serviceTitle,
    ),
    buildDayPickerKeyboard(),
  )
}

async function showSlotsForPick(
  ctx,
  slug,
  businessName,
  timeQuery = '',
  { serviceId = null, dayOffset = null } = {},
) {
  const session = getClientBookingSession(ctx.from?.id)
  if (dayOffset == null && !hasExplicitDay(timeQuery)) {
    await showDayPickerForPick(ctx, slug, businessName, {
      serviceId: serviceId || session?.serviceId || null,
      serviceTitle: session?.serviceTitle || null,
    })
    return
  }

  const query =
    dayOffset != null ? dayOffsetToQuery(dayOffset) : timeQuery || ''
  const found = await loadSlotsForSlug(slug, query, { serviceId, dayOffset })
  setClientBookingSession(ctx.from.id, {
    slug,
    businessName: businessName || found.master?.businessName || slug,
    timeQuery: query,
    dayOffset: dayOffset != null ? Number(dayOffset) : null,
    serviceId: found.master?.service?.id || serviceId || null,
    serviceTitle: found.master?.service?.title || session?.serviceTitle || null,
  })
  if (!found.ok || !found.slots?.length) {
    await safeEditMessage(
      ctx,
      COPY.noSlots,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('← Другой день', 'day:back'),
          Markup.button.callback('Отмена', 'pick:cancel'),
        ],
      ]),
    )
    return
  }
  const name = found.master?.businessName || businessName || slug
  const svc = found.master?.service?.title
  const head = svc
    ? `«${name}» · ${svc}. Нажмите время:`
    : `Свободно у «${name}». Нажмите время:`
  await safeEditMessage(ctx, head, buildSlotsKeyboard(slug, found.slots))
}

async function showServicesOrSlots(ctx, slug, businessName, timeQuery = '') {
  const session = getClientBookingSession(ctx.from?.id)
  const placeHint = session?.places?.find((p) => p.slug === slug)
  const preselectedId = session?.serviceId || placeHint?.serviceId || null

  let services = await loadServicesForSlug(slug)
  // Услуга из поиска — первой в списке
  if (preselectedId && services.length > 1) {
    const hitIdx = services.findIndex(
      (s) =>
        s.id === preselectedId ||
        String(s.id).startsWith(String(preselectedId)),
    )
    if (hitIdx > 0) {
      const [hit] = services.splice(hitIdx, 1)
      services = [hit, ...services]
    }
  }

  setClientBookingSession(ctx.from.id, {
    slug,
    businessName: businessName || slug,
    timeQuery: timeQuery || null,
    services: services.map((s) => ({
      id: s.id,
      title: s.title,
      duration_min: s.duration_min,
      price_cents: s.price_cents,
      currency: s.currency,
    })),
  })

  if (services.length <= 1) {
    const only = services[0]
    setClientBookingSession(ctx.from.id, {
      serviceId: only?.id || preselectedId || null,
      serviceTitle: only?.title || null,
    })
    await showSlotsForPick(ctx, slug, businessName, timeQuery, {
      serviceId: only?.id || preselectedId || null,
    })
    return
  }

  await safeEditMessage(
    ctx,
    servicesPickerText(businessName || slug, services),
    buildServicePickerKeyboard(slug, services),
  )
}

bot.action('pick:cancel', async (ctx) => {
  clearClientBookingSession(ctx.from?.id)
  await safeAnswerCbQuery(ctx, 'Отменено')
  await safeEditMessage(
    ctx,
    COPY.pickCancelled,
    Markup.inlineKeyboard([[Markup.button.callback('← Меню', 'menu:refresh')]]),
  )
})

bot.action('pick:back', async (ctx) => {
  await safeAnswerCbQuery(ctx)
  const session = getClientBookingSession(ctx.from?.id)
  // Сброс выбранной услуги при возврате к списку мест
  setClientBookingSession(ctx.from?.id, {
    serviceId: null,
    serviceTitle: null,
    services: null,
    slug: null,
  })
  const places =
    session?.places?.length
      ? session.places
      : (await fetchClientMasters(ctx.from?.id, { limit: 4 })).map((p) => ({
          slug: p.slug,
          name: p.name,
        }))
  if (!places.length) {
    await safeEditMessage(
      ctx,
      COPY.clientHintBook,
      Markup.inlineKeyboard([[Markup.button.callback('← Меню', 'menu:refresh')]]),
    )
    return
  }
  await safeEditMessage(
    ctx,
    'К кому записать?',
    buildPlacePickerKeyboard(places, {
      withAppSearch: webAppReady,
      webAppUrl: webAppReady
        ? withParams({ view: 'home' }, { bare: true })
        : null,
    }),
  )
})

bot.action('svc:back', async (ctx) => {
  await safeAnswerCbQuery(ctx)
  const session = getClientBookingSession(ctx.from?.id)
  const slug = session?.slug
  if (!slug) {
    await safeEditMessage(
      ctx,
      COPY.clientHintBook,
      Markup.inlineKeyboard([[Markup.button.callback('← Меню', 'menu:refresh')]]),
    )
    return
  }
  // Вернуться к выбору услуги (сбросить preselect, чтобы показать список)
  setClientBookingSession(ctx.from.id, {
    serviceId: null,
    serviceTitle: null,
  })
  const name = session.businessName || slug
  const services =
    session.services?.length
      ? session.services
      : await loadServicesForSlug(slug)
  if (services.length <= 1) {
    // Некуда — к списку мест
    await safeEditMessage(
      ctx,
      'К кому записать?',
      buildPlacePickerKeyboard(session.places || [], {
        withAppSearch: webAppReady,
        webAppUrl: webAppReady
          ? withParams({ view: 'home' }, { bare: true })
          : null,
      }),
    )
    return
  }
  setClientBookingSession(ctx.from.id, { services })
  await safeEditMessage(
    ctx,
    servicesPickerText(name, services),
    buildServicePickerKeyboard(slug, services),
  )
})

bot.action(/^svc:(?!back$)(.+):(\d+)$/, async (ctx) => {
  const slug = String(ctx.match[1] || '').trim()
  const idx = Number(ctx.match[2])
  await safeAnswerCbQuery(ctx)
  const session = getClientBookingSession(ctx.from?.id)
  const services =
    session?.services?.length && session.slug === slug
      ? session.services
      : await loadServicesForSlug(slug)
  const service = services[idx]
  if (!service?.id) {
    await safeEditMessage(
      ctx,
      'Услуга не найдена. Выберите снова.',
      Markup.inlineKeyboard([[Markup.button.callback('← Меню', 'menu:refresh')]]),
    )
    return
  }
  setClientBookingSession(ctx.from.id, {
    slug,
    services,
    serviceId: service.id,
    serviceTitle: service.title,
    businessName: session?.businessName || slug,
  })
  await showSlotsForPick(
    ctx,
    slug,
    session?.businessName || slug,
    session?.timeQuery || '',
    { serviceId: service.id },
  )
})

bot.action('day:back', async (ctx) => {
  await safeAnswerCbQuery(ctx)
  const session = getClientBookingSession(ctx.from?.id)
  const slug = session?.slug
  if (!slug) {
    await safeEditMessage(
      ctx,
      COPY.clientHintBook,
      Markup.inlineKeyboard([[Markup.button.callback('← Меню', 'menu:refresh')]]),
    )
    return
  }
  await showDayPickerForPick(ctx, slug, session.businessName || slug, {
    serviceId: session.serviceId || null,
    serviceTitle: session.serviceTitle || null,
  })
})

bot.action(/^day:(\d+)$/, async (ctx) => {
  const offset = Number(ctx.match[1])
  await safeAnswerCbQuery(ctx)
  const session = getClientBookingSession(ctx.from?.id)
  const slug = session?.slug
  if (!slug || !Number.isFinite(offset)) {
    await safeEditMessage(
      ctx,
      COPY.clientHintBook,
      Markup.inlineKeyboard([[Markup.button.callback('← Меню', 'menu:refresh')]]),
    )
    return
  }
  await showSlotsForPick(
    ctx,
    slug,
    session.businessName || slug,
    dayOffsetToQuery(offset),
    {
      serviceId: session.serviceId || null,
      dayOffset: offset,
    },
  )
})

bot.action(/^pick:(?!cancel$|back$)(.+)$/, async (ctx) => {
  const slug = String(ctx.match[1] || '').trim()

  await safeAnswerCbQuery(ctx)
  const session = getClientBookingSession(ctx.from?.id)
  const query = session?.lastQuery || ''
  const allowed = await isSlugAllowedForClient(ctx.from?.id, slug, { query })
  const inSession = session?.places?.some((p) => p.slug === slug)
  if (!allowed && !inSession) {
    await safeEditMessage(
      ctx,
      'Это заведение недоступно. Выберите из списка или напишите снова.',
      Markup.inlineKeyboard([[Markup.button.callback('← Меню', 'menu:refresh')]]),
    )
    return
  }

  const place = session?.places?.find((p) => p.slug === slug)
  const name = place?.name || slug
  // Подтянуть serviceId из карточки поиска, если есть
  if (place?.serviceId) {
    setClientBookingSession(ctx.from.id, {
      serviceId: place.serviceId,
      serviceTitle: place.serviceTitle || null,
    })
  } else {
    // Обычный выбор заведения — дать выбрать услугу
    setClientBookingSession(ctx.from.id, {
      serviceId: null,
      serviceTitle: null,
    })
  }
  await showServicesOrSlots(ctx, slug, name, session?.timeQuery || '')
})

bot.command('today', async (ctx) => {
  if (!(await userHasCabinet(ctx.from?.id))) {
    await ctx.reply('Команда для сотрудников заведения. /register')
    return
  }
  await replyOpenApp(ctx, 'Сегодня', withParams({ view: 'today' }, { bare: true }))
})

bot.command('windows', async (ctx) => {
  if (!webAppReady) {
    await ctx.reply('Mini App не подключено.')
    return
  }
  let business = 'demo'
  try {
    business =
      new URL(WEBAPP_URL).searchParams.get('business') ||
      new URL(WEBAPP_URL).searchParams.get('master') ||
      'demo'
  } catch {
    // ignore
  }
  const link = buildClientBookingLink(business)
  await ctx.reply(
    `Записаться онлайн · ${business}\n${link}`,
    Markup.inlineKeyboard([
      [Markup.button.webApp('Свободные окна', withParams({ view: 'windows' }))],
      [
        Markup.button.webApp(
          'Записаться',
          withParams({ business, view: 'book' }, { bare: true }),
        ),
      ],
    ]),
  )
})

bot.action(/^book:(.+)$/, async (ctx) => {
  const payload = ctx.match[1] || ''
  await safeAnswerCbQuery(ctx, 'Записываю…')
  const sep = payload.indexOf(':')
  if (sep < 0) {
    await safeEditMessage(
      ctx,
      'Не понял слот. Напишите снова, например: «есть завтра после 15?»',
    )
    return
  }
  const slug = payload.slice(0, sep)
  const startsAtIso = payload.slice(sep + 1)

  const session = getClientBookingSession(ctx.from?.id)
  const role = resolveEffectiveRole(ctx.from?.id, {
    hasCabinet: await userHasCabinet(ctx.from?.id),
  })
  if (role === 'client') {
    const allowed =
      (session?.slug && session.slug === slug) ||
      (await isSlugAllowedForClient(ctx.from?.id, slug, {
        query: session?.lastQuery || '',
      }))
    if (!allowed) {
      await safeEditMessage(
        ctx,
        'Нельзя записаться к этому мастеру из чата. Выберите из списка.',
        Markup.inlineKeyboard([[Markup.button.callback('← Меню', 'menu:refresh')]]),
      )
      return
    }
  }

  const master = await resolveMaster(slug, {
    serviceId: session?.serviceId || null,
  })
  if (!master?.service) {
    await safeEditMessage(
      ctx,
      'Сейчас не могу записаться — мастер или услуга не найдены.',
    )
    return
  }

  const result = await createPendingFromSlot({
    masterId: master.masterId,
    businessId: master.businessId,
    service: master.service,
    startsAtIso,
    clientTelegramId: ctx.from?.id,
  })

  if (!result.ok) {
    if (result.error === 'Это окно уже заняли') {
      const found = await loadSlotsForSlug(slug, session?.timeQuery || '', {
        serviceId: session?.serviceId || master.service.id,
        dayOffset: session?.dayOffset ?? null,
      })
      await safeEditMessage(
        ctx,
        'Это окно уже заняли. Выберите другое:',
        found.slots?.length
          ? buildSlotsKeyboard(slug, found.slots)
          : Markup.inlineKeyboard([
              [Markup.button.callback('← Меню', 'menu:refresh')],
            ]),
      )
      return
    }
    await safeEditMessage(
      ctx,
      result.error || 'Не удалось сохранить запись. Попробуйте ещё раз.',
      Markup.inlineKeyboard([[Markup.button.callback('← Меню', 'menu:refresh')]]),
    )
    return
  }

  clearClientBookingSession(ctx.from?.id)
  const when = formatWhenRu(startsAtIso)
  await safeEditMessage(
    ctx,
    `Заявка принята ✅\n${master.service.title} · ${when}\nОжидает подтверждения мастера.`,
    Markup.inlineKeyboard([
      [
        Markup.button.webApp(
          'Мои записи',
          withParams({ view: 'mine' }, { bare: true }),
        ),
        Markup.button.callback('Меню', 'menu:refresh'),
      ],
    ]),
  )
})

bot.on('message', async (ctx) => {
  const text = ctx.message?.text || ''
  if (text.startsWith('/')) return
  // Reply-клавиатура обрабатывается в bot.hears — не дублируем ответ
  if (
    /^(Открыть приложение|Мои записи|Мой кабинет|Новое заведение|Стать мастером|➕\s*Сторонняя(?:\s*запись)?|➕\s*Запись)$/i.test(
      text,
    )
  ) {
    return
  }

  if (getExternalPending(ctx.from?.id)) {
    await handleExternalBookingText(ctx, text)
    return
  }

  const hasCabinet = await userHasCabinet(ctx.from?.id)
  await handleAssistantMessage(ctx, text, {
    hasCabinet,
    safeReply,
    webAppReady,
    withParams,
  })
})

bot.action(/^confirm:(.+)$/, async (ctx) => {
  const bookingId = ctx.match[1]
  const supabase = getSupabase()
  if (!supabase) {
    await safeAnswerCbQuery(ctx, 'Нет подключения к базе')
    return
  }
  const res = await confirmBookingFromCallback(supabase, bookingId)
  if (!res.ok) {
    await safeAnswerCbQuery(ctx, res.error || 'Не удалось подтвердить')
    return
  }
  await safeAnswerCbQuery(ctx, 'Визит подтверждён')
  await safeReply(ctx, 'Спасибо! Ждём вас на приёме ✅')
})

bot.action(/^mconfirm:(.+)$/, async (ctx) => {
  const bookingId = ctx.match[1]
  const supabase = getBotSupabase({ write: true }) || getSupabase()
  if (!supabase) {
    await safeAnswerCbQuery(ctx, 'Нет подключения к базе')
    return
  }
  const res = await masterRespondBookingFromCallback(
    supabase,
    bookingId,
    ctx.from?.id,
    'confirm',
  )
  if (!res.ok) {
    await safeAnswerCbQuery(ctx, res.error || 'Не удалось')
    if (res.booking) {
      await safeEditMessage(ctx, `Запись уже обработана\n${res.title || 'Услуга'}`)
    }
    return
  }
  await safeAnswerCbQuery(ctx, 'Подтверждено')
  const when = res.startsAt ? formatWhenRu(res.startsAt) : ''
  await safeEditMessage(
    ctx,
    `Подтверждено\n${res.title || 'Услуга'}${when ? `\n${when}` : ''}`,
  )
})

bot.action(/^mdecline:(.+)$/, async (ctx) => {
  const bookingId = ctx.match[1]
  const supabase = getBotSupabase({ write: true }) || getSupabase()
  if (!supabase) {
    await safeAnswerCbQuery(ctx, 'Нет подключения к базе')
    return
  }
  const res = await masterRespondBookingFromCallback(
    supabase,
    bookingId,
    ctx.from?.id,
    'decline',
  )
  if (!res.ok) {
    await safeAnswerCbQuery(ctx, res.error || 'Не удалось')
    if (res.booking) {
      await safeEditMessage(ctx, `Запись уже обработана\n${res.title || 'Услуга'}`)
    }
    return
  }
  await safeAnswerCbQuery(ctx, 'Отменено')
  const when = res.startsAt ? formatWhenRu(res.startsAt) : ''
  await safeEditMessage(
    ctx,
    `Отменено\n${res.title || 'Услуга'}${when ? `\n${when}` : ''}\nКлиенту уйдёт уведомление`,
  )
})

logger.info('Проверяю токен через Telegram API…')

try {
  const me = await bot.telegram.getMe()
  logger.info('Токен OK. Бот:', me.username ? `@${me.username}` : me.id)
  // НЕ await: launch в Telegraf 4 ждёт polling-loop вечно
  bot
    .launch({ dropPendingUpdates: true })
    .catch((err) => {
      logger.error('[ANTIBAN] polling упал:', err?.message || err)
      process.exit(1)
    })
  logger.info('Бот запущен. Ожидаю сообщения…')
  startReminderJobs(bot)
  startDataRetentionJobs()
  startWeeklyProPushJobs()

  const tributeKey = process.env.TRIBUTE_API_KEY || ''
  const tributePort = Number(process.env.TRIBUTE_WEBHOOK_PORT || 8787)
  const tributeSubFilter = process.env.TRIBUTE_SUBSCRIPTION_ID || ''
  const localWebhook = String(process.env.TRIBUTE_LOCAL_WEBHOOK || '') === '1'
  const supabase = getSupabase()
  // Постоянный webhook: Supabase Edge Function (не туннель).
  // Локальный HTTP — только если TRIBUTE_LOCAL_WEBHOOK=1
  if (localWebhook && supabase && tributeKey) {
    startTributeWebhookServer(supabase, {
      port: tributePort,
      apiKey: tributeKey,
      subscriptionIdFilter: tributeSubFilter,
    })
  } else {
    logger.info(
      'Tribute Pro: постоянный webhook → https://jwmequerozztzpzisusa.supabase.co/functions/v1/tribute-webhook',
    )
  }
} catch (err) {
  logger.error('Не удалось запустить бота:', err)
  process.exit(1)
}

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
