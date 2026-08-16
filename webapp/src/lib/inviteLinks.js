const BOT_USERNAME = 'booking_inapp_bot'

const APP_SHORT_NAME =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TG_APP_SHORT_NAME) ||
  ''

const WEBAPP_BASE = (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WEBAPP_BASE) ||
  'https://timmiehub.github.io/telegram-booking/'
).replace(/\/?$/, '/')

/** startapp payload: slug[_s{8}uuid][_unixTs] */
export function buildInviteStartParam(slug, { serviceId = null, slotIso = null } = {}) {
  const s = String(slug || 'demo').trim() || 'demo'
  const parts = [s]
  if (serviceId) {
    parts.push(`s${String(serviceId).slice(0, 8)}`)
  }
  if (slotIso) {
    const ts = Math.floor(new Date(slotIso).getTime() / 1000)
    if (Number.isFinite(ts)) parts.push(String(ts))
  }
  return parts.join('_')
}

import { isReservedGrowthStartParam } from './growthAttribution'

/**
 * Парсит start_param / startapp.
 * Slug может содержать `_` — service/timestamp только в хвосте.
 * Резерв: master/vk/ig/chat/story/ref_* — не slug бизнеса.
 */
export function parseInviteStartParam(startParam) {
  if (!startParam) {
    return { slug: null, serviceIdPrefix: null, slotAt: null, raw: '' }
  }
  const raw = String(startParam).trim()
  if (/^(invite_|join_)/i.test(raw) || isReservedGrowthStartParam(raw)) {
    return { slug: null, serviceIdPrefix: null, slotAt: null, raw }
  }

  const parts = raw.split('_')
  if (parts.length === 1) {
    return { slug: parts[0] || null, serviceIdPrefix: null, slotAt: null, raw }
  }

  let slotTs = null
  let serviceId = null
  let slugParts = [...parts]

  const last = parts[parts.length - 1]
  if (/^\d{9,12}$/.test(last)) {
    slotTs = Number(last)
    slugParts = parts.slice(0, -1)
  }

  if (slugParts.length > 1) {
    const tail = slugParts[slugParts.length - 1]
    if (/^s[a-f0-9]{8}$/i.test(tail)) {
      serviceId = tail.slice(1)
      slugParts = slugParts.slice(0, -1)
    }
  }

  const slug = slugParts.join('_') || null
  return {
    slug,
    serviceIdPrefix: serviceId,
    slotAt: slotTs && Number.isFinite(slotTs) ? new Date(slotTs * 1000) : null,
    raw,
  }
}

/** start_param + query ?business= / ?service= / ?slot= */
export function resolveInviteFromContext() {
  const params = new URLSearchParams(window.location.search || '')
  const fromBusiness = params.get('business') || params.get('master')
  let startParam = ''
  try {
    startParam = String(window.Telegram?.WebApp?.initDataUnsafe?.start_param || '').trim()
  } catch {
    // ignore
  }

  const parsed = parseInviteStartParam(startParam || fromBusiness || '')
  const slug = parsed.slug || (fromBusiness ? fromBusiness.trim() : null)

  const serviceFromUrl = params.get('service')
  const slotFromUrl = params.get('slot')

  return {
    slug,
    serviceIdPrefix: serviceFromUrl || parsed.serviceIdPrefix || null,
    slotAt: slotFromUrl
      ? new Date(slotFromUrl)
      : parsed.slotAt,
    raw: parsed.raw || startParam,
  }
}

/** Main Mini App link — primary (не зависит от Direct Link) */
export function buildClientBookingLink(businessSlug, extra = {}) {
  const startapp = buildInviteStartParam(businessSlug, extra)
  return `https://t.me/${BOT_USERNAME}?startapp=${startapp}`
}

/** Direct Link — только если short name настроен в BotFather */
export function buildDirectBookingLink(businessSlug, extra = {}) {
  if (!APP_SHORT_NAME) return buildClientBookingLink(businessSlug, extra)
  const startapp = buildInviteStartParam(businessSlug, extra)
  return `https://t.me/${BOT_USERNAME}/${APP_SHORT_NAME}?startapp=${startapp}`
}

/** HTTPS fallback для браузера / copy */
export function buildWebAppBookingLink(businessSlug, extra = {}) {
  const slug = String(businessSlug || 'demo').trim() || 'demo'
  const url = new URL(WEBAPP_BASE)
  url.searchParams.set('business', slug)
  if (extra.serviceId) {
    url.searchParams.set('service', String(extra.serviceId).slice(0, 8))
  }
  if (extra.slotIso) {
    url.searchParams.set('slot', new Date(extra.slotIso).toISOString())
  }
  url.searchParams.set('view', 'book')
  return url.toString()
}

export function buildShareText(businessName) {
  const name = String(businessName || '').trim() || 'мастеру'
  return `Записаться онлайн · ${name}`
}

export function buildShareLine(businessName, businessSlug, extra = {}) {
  const link = buildClientBookingLink(businessSlug, extra)
  return `${buildShareText(businessName)}\n${link}`
}

export function buildBookingInviteLink({
  businessSlug,
  serviceId = null,
  slotIso = null,
}) {
  return buildClientBookingLink(businessSlug, { serviceId, slotIso })
}

/** @deprecated Используйте openClientChat из lib/contacts.js */
export function buildTelegramChatLink(_telegramId) {
  return '#'
}

export { BOT_USERNAME, APP_SHORT_NAME, WEBAPP_BASE }
