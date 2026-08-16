const BOT_USERNAME = 'booking_inapp_bot'

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

import { isReservedGrowthStartParam } from './growthAttribution.js'

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

/** Main Mini App — primary link */
export function buildClientBookingLink(businessSlug, extra = {}) {
  const startapp = buildInviteStartParam(businessSlug, extra)
  return `https://t.me/${BOT_USERNAME}?startapp=${startapp}`
}

export function buildWebAppBookingParams(slug, extra = {}, webAppUrl = '') {
  const params = { business: slug, view: 'book' }
  if (extra.serviceId) params.service = String(extra.serviceId).slice(0, 8)
  if (extra.slotIso) params.slot = new Date(extra.slotIso).toISOString()
  return params
}

export { BOT_USERNAME }
