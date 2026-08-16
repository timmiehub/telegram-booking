import { fetchBusinessSettings, updateBusinessSettings } from './settings'
import { supabase } from './supabase'
import { WebApp } from './telegram'

export const FREE_LIMITS = {
  maxActiveMembers: 1,
  aiTexts: false,
  brandAccents: 1,
  maxPortfolio: 2,
}

/** Публичная цена Pro для CTA (без секретов). */
export function getProPriceLabel() {
  const fromEnv = (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PRO_PRICE_LABEL) ||
    ''
  ).trim()
  return fromEnv || '499 ₽/мес'
}

/** Короткий лейбл для узких кнопок (вкладка «Ссылка»). */
export function getProPriceLabelShort() {
  const fromEnv = (
    (typeof import.meta !== 'undefined' &&
      import.meta.env?.VITE_PRO_PRICE_LABEL_SHORT) ||
    ''
  ).trim()
  if (fromEnv) return fromEnv
  return 'Pro · 499 ₽/мес'
}

export function getProCtaLabel({ busy = false } = {}) {
  if (busy) return '…'
  return `Подключить Pro · ${getProPriceLabel()}`
}

/** База + буква по QWERTY: BOOKQ … BOOKM */
export const PROMO_PREFIX = 'BOOK'
export const PROMO_SUFFIXES = 'qwertyuiopasdfghjklzxcvbnm'
export const PROMO_DAYS = 90

export const PRO_BENEFITS = [
  { text: 'Выше в поиске → больше записей', icon: 'icon-search' },
  { text: 'Ассистент и ИИ в чате мастера', icon: 'icon-chat' },
  { text: 'Свой бренд, чёрный список, шаблоны', icon: 'icon-palette' },
  { text: 'Свои тексты напоминаний и отчёт за месяц', icon: 'icon-bell' },
  { text: 'Несколько адресов на один кабинет', icon: 'icon-pin' },
]

export const PRO_FEATURES = [
  {
    id: 'search_boost',
    title: 'Выше в поиске',
    hint: 'Клиенты видят вас раньше — больше записей',
    action: 'tip',
    tip: 'С Pro ваш кабинет выше в поиске по городу и в боте. Это главный способ получить больше новых клиентов без рекламы.',
    icon: 'icon-search',
  },
  {
    id: 'ai',
    title: 'Тексты по окнам',
    hint: 'Черновики сообщений по свободным слотам',
    action: 'tool',
    tool: 'ai',
    icon: 'icon-spark',
  },
  {
    id: 'ai_chat',
    title: 'ИИ в чате',
    hint: 'Ответы бота в режиме исполнитель',
    action: 'tip',
    tip: 'Откройте чат с ботом, режим «исполнитель». Пишите обычным текстом — ИИ отвечает при активном Pro. Клиентам нейросеть не включается.',
    icon: 'icon-chat',
  },
  {
    id: 'brand',
    title: 'Свой бренд',
    hint: 'Цвет кнопки и кадр шапки — в Профиле',
    action: 'profile',
    icon: 'icon-palette',
  },
  {
    id: 'winback',
    title: 'Возврат клиентов',
    hint: 'Кто давно не был — текст и «написать»',
    action: 'tool',
    tool: 'winback',
    icon: 'icon-users',
  },
  {
    id: 'stats',
    title: 'Цифры и отчёт',
    hint: 'Неделя в кабинете и отчёт за месяц в Telegram',
    action: 'tool',
    tool: 'stats',
    icon: 'icon-chart',
  },
  {
    id: 'master_remind',
    title: 'Напоминание мастеру',
    hint: 'Пуш за час до визита',
    action: 'tip',
    tip: 'При Pro бот сам пришлёт вам напоминание примерно за час до визита. Включать ничего не нужно.',
    icon: 'icon-bell',
  },
  {
    id: 'remind_texts',
    title: 'Свои тексты клиенту',
    hint: 'Напоминания за сутки и за 2 часа',
    action: 'scroll',
    target: 'pro-reminders',
    icon: 'icon-doc',
  },
  {
    id: 'blacklist',
    title: 'Чёрный список',
    hint: 'Блок записи для выбранных клиентов',
    action: 'scroll',
    target: 'pro-blacklist',
    icon: 'icon-ban',
  },
  {
    id: 'templates',
    title: 'Шаблоны ответов',
    hint: 'Готовые ответы в чате бота без нейросети',
    action: 'scroll',
    target: 'pro-templates',
    icon: 'icon-doc',
  },
  {
    id: 'locations',
    title: 'Несколько адресов',
    hint: 'До трёх точек на один кабинет',
    action: 'scroll',
    target: 'pro-locations',
    icon: 'icon-pin',
  },
]

/** Публичная ссылка на подписку Tribute (без секретов). */
export function getTributeProUrl() {
  return (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TRIBUTE_PRO_URL) ||
    ''
  ).trim()
}

export function normalizePromoCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function isValidPromoFormat(code) {
  const c = normalizePromoCode(code)
  if (!c.startsWith(PROMO_PREFIX) || c.length !== PROMO_PREFIX.length + 1) {
    return false
  }
  return PROMO_SUFFIXES.toUpperCase().includes(c.slice(-1))
}

export function listPromoCodes() {
  return [...PROMO_SUFFIXES].map((ch) => `${PROMO_PREFIX}${ch.toUpperCase()}`)
}

export function isProPlan(settings) {
  if (settings?.plan !== 'pro') return false
  if (!settings.pro_until) return true
  const until = new Date(settings.pro_until).getTime()
  if (Number.isNaN(until)) return true
  return until > Date.now()
}

export function isOnProWaitlist(settings) {
  return Boolean(settings?.pro_waitlist)
}

/** Команда для новых кабинетов недоступна (не фича Pro). */
export function canUseTeam() {
  return false
}

export function canUseAi(settings) {
  return isProPlan(settings)
}

export function canUseBrand(settings) {
  return isProPlan(settings)
}

export function canUseWinBack(settings) {
  return isProPlan(settings)
}

export function canUseTeamDay() {
  return false
}

export function canUseRemindTexts(settings) {
  return isProPlan(settings)
}

export function canUseBlacklist(settings) {
  return isProPlan(settings)
}

export function canUseReplyTemplates(settings) {
  return isProPlan(settings)
}

export function canUseLocations(settings) {
  return isProPlan(settings)
}

export function canUseStats(settings) {
  return isProPlan(settings)
}

export function canUsePortfolio(settings) {
  // Free: до FREE_LIMITS.maxPortfolio; Pro — без жёсткого лимита в UI
  return true
}

export function portfolioMax(settings) {
  return isProPlan(settings) ? 24 : FREE_LIMITS.maxPortfolio
}

export function canAddPortfolioItem(settings, currentCount = 0) {
  return Number(currentCount) < portfolioMax(settings)
}

export function canUseMasterHourRemind(settings) {
  return isProPlan(settings)
}

export function canAddMember(_settings, activeMemberCount = 0) {
  return activeMemberCount < FREE_LIMITS.maxActiveMembers
}

/** Сколько акцентов доступно на free (первый бесплатно). */
export function allowedAccentCount(settings) {
  return canUseBrand(settings) ? 99 : FREE_LIMITS.brandAccents
}

export async function joinProWaitlist(businessId) {
  return updateBusinessSettings(businessId, {
    pro_waitlist: true,
    pro_waitlist_at: new Date().toISOString(),
  })
}

export async function setProPlan(businessId, enabled) {
  return updateBusinessSettings(businessId, {
    plan: enabled ? 'pro' : 'free',
  })
}

/**
 * Активирует Pro на N дней по одноразовому коду (BOOKQ…BOOKM, по умолчанию 90 дн.).
 */
export async function redeemPromoCode(businessId, rawCode) {
  if (!businessId || !supabase) {
    return { ok: false, error: 'Нет подключения' }
  }
  const code = normalizePromoCode(rawCode)
  if (!isValidPromoFormat(code)) {
    return { ok: false, error: 'Неверный формат кода' }
  }

  const telegramId = WebApp.initDataUnsafe?.user?.id ?? null
  const nowIso = new Date().toISOString()

  const { data: claimed, error: claimErr } = await supabase
    .from('pro_promo_codes')
    .update({
      used_at: nowIso,
      used_by_business_id: businessId,
      used_by_telegram_id: telegramId,
    })
    .eq('code', code)
    .is('used_at', null)
    .select('code, days')
    .maybeSingle()

  if (claimErr) {
    if (/pro_promo_codes|relation/i.test(String(claimErr.message || ''))) {
      return {
        ok: false,
        error: 'Таблица промокодов ещё не создана. Нужна migration_pro_promo.sql',
      }
    }
    return { ok: false, error: claimErr.message }
  }

  if (!claimed) {
    const { data: exists } = await supabase
      .from('pro_promo_codes')
      .select('code, used_at')
      .eq('code', code)
      .maybeSingle()
    if (!exists) return { ok: false, error: 'Код не найден' }
    return { ok: false, error: 'Код уже использован' }
  }

  const days = Number(claimed.days) > 0 ? Number(claimed.days) : PROMO_DAYS
  const current = await fetchBusinessSettings(businessId)
  const baseMs = Math.max(
    Date.now(),
    current.settings?.pro_until
      ? new Date(current.settings.pro_until).getTime() || Date.now()
      : Date.now(),
  )
  const until = new Date(baseMs + days * 864e5).toISOString()

  const res = await updateBusinessSettings(businessId, {
    plan: 'pro',
    pro_source: `promo:${code}`,
    pro_until: until,
    pro_waitlist: false,
  })

  if (!res.ok) {
    return { ok: false, error: res.error || 'Код списан, но Pro не включился' }
  }

  return { ok: true, settings: res.settings, code, days, until }
}

export async function loadProState(businessId) {
  const { settings } = await fetchBusinessSettings(businessId)
  return {
    settings,
    isPro: isProPlan(settings),
    waitlisted: isOnProWaitlist(settings),
  }
}

function openExternal(url) {
  try {
    if (WebApp.openTelegramLink && /t\.me\//i.test(url)) {
      WebApp.openTelegramLink(url)
      return true
    }
  } catch {
    // ignore
  }
  try {
    if (WebApp.openLink) {
      WebApp.openLink(url)
      return true
    }
  } catch {
    // ignore
  }
  try {
    window.open(url, '_blank', 'noopener,noreferrer')
    return true
  } catch {
    return false
  }
}

/**
 * Checkout Pro через Tribute.
 */
export async function startProCheckout(businessId) {
  if (!businessId) {
    return { ok: false, error: 'Нет business id', mode: 'none' }
  }

  const telegramId = WebApp.initDataUnsafe?.user?.id ?? null
  const tributeUrl = getTributeProUrl()

  const checkoutPatch = {
    pro_checkout_at: new Date().toISOString(),
    pro_checkout_by: telegramId,
    pro_waitlist: !tributeUrl,
    pro_waitlist_at: new Date().toISOString(),
  }

  const res = await updateBusinessSettings(businessId, checkoutPatch)
  if (!res.ok) return { ...res, mode: 'none' }

  if (!tributeUrl) {
    return {
      ok: true,
      settings: res.settings,
      mode: 'waitlist',
      error: null,
      hint: 'Ссылка Tribute ещё не задана (VITE_TRIBUTE_PRO_URL)',
    }
  }

  const opened = openExternal(tributeUrl)
  return {
    ok: true,
    settings: res.settings,
    mode: 'tribute',
    opened,
  }
}

export function proHintFor(featureId, settings) {
  if (isProPlan(settings)) return null
  const f = PRO_FEATURES.find((x) => x.id === featureId)
  if (!f) return null
  return `${f.title} — в Pro`
}
