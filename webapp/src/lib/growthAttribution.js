/** Метки каналов и реферал для продвижения (start= payload). */

export const GROWTH_CHANNEL_SOURCES = ['master', 'vk', 'ig', 'chat', 'story']

const CHANNEL_SET = new Set(GROWTH_CHANNEL_SOURCES)

/**
 * @returns {{
 *   kind: 'none'|'channel'|'referral'|'team'|'booking',
 *   source: string|null,
 *   referrerTelegramId: number|null,
 *   raw: string
 * }}
 */
export function parseGrowthStartParam(startParam) {
  const raw = String(startParam || '').trim()
  if (!raw) {
    return { kind: 'none', source: null, referrerTelegramId: null, raw: '' }
  }
  if (/^(invite_|join_)/i.test(raw)) {
    return { kind: 'team', source: null, referrerTelegramId: null, raw }
  }
  const ref = raw.match(/^ref_(\d{5,15})$/i)
  if (ref) {
    return {
      kind: 'referral',
      source: 'referral',
      referrerTelegramId: Number(ref[1]),
      raw,
    }
  }
  const lower = raw.toLowerCase()
  if (CHANNEL_SET.has(lower)) {
    return {
      kind: 'channel',
      source: lower,
      referrerTelegramId: null,
      raw,
    }
  }
  return { kind: 'booking', source: null, referrerTelegramId: null, raw }
}

export function isReservedGrowthStartParam(startParam) {
  const g = parseGrowthStartParam(startParam)
  return g.kind === 'channel' || g.kind === 'referral'
}

const LS_KEY = 'booking_growth_attr_v1'

export function persistGrowthAttribution({ source = null, referrerTelegramId = null } = {}) {
  const next = {
    source: source ? String(source).toLowerCase() : null,
    referrerTelegramId:
      referrerTelegramId != null && Number.isFinite(Number(referrerTelegramId))
        ? Number(referrerTelegramId)
        : null,
    at: new Date().toISOString(),
  }
  if (!next.source && !next.referrerTelegramId) return next
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
  return next
}

export function readGrowthAttribution() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { source: null, referrerTelegramId: null }
    const parsed = JSON.parse(raw)
    return {
      source: parsed?.source ? String(parsed.source).toLowerCase() : null,
      referrerTelegramId:
        parsed?.referrerTelegramId != null &&
        Number.isFinite(Number(parsed.referrerTelegramId))
          ? Number(parsed.referrerTelegramId)
          : null,
    }
  } catch {
    return { source: null, referrerTelegramId: null }
  }
}

/** Query (?src=&ref=) + Telegram start_param → атрибуция + localStorage */
export function captureGrowthAttributionFromContext() {
  const params = new URLSearchParams(window.location.search || '')
  let startParam = ''
  try {
    startParam = String(window.Telegram?.WebApp?.initDataUnsafe?.start_param || '').trim()
  } catch {
    // ignore
  }

  const fromStart = parseGrowthStartParam(startParam)
  const srcQ = String(params.get('src') || '').trim().toLowerCase()
  const refQ = params.get('ref')

  let source = null
  let referrerTelegramId = null

  if (fromStart.kind === 'channel') source = fromStart.source
  else if (fromStart.kind === 'referral') {
    source = 'referral'
    referrerTelegramId = fromStart.referrerTelegramId
  }

  if (CHANNEL_SET.has(srcQ)) source = srcQ
  else if (srcQ === 'referral') source = 'referral'

  if (refQ != null && String(refQ).trim()) {
    const n = Number(String(refQ).trim())
    if (Number.isFinite(n) && n > 0) {
      referrerTelegramId = n
      if (!source) source = 'referral'
    }
  }

  if (!source && !referrerTelegramId) {
    return readGrowthAttribution()
  }
  return persistGrowthAttribution({ source, referrerTelegramId })
}

export function growthSettingsPatch(attr, ownerTelegramId = null) {
  const patch = {}
  if (attr?.source) patch.acquisition_source = String(attr.source).slice(0, 32)
  const ref = attr?.referrerTelegramId
  if (ref != null && Number.isFinite(Number(ref)) && Number(ref) > 0) {
    const self = ownerTelegramId != null ? Number(ownerTelegramId) : null
    if (!self || Number(ref) !== self) {
      patch.referred_by_telegram_id = Number(ref)
    }
  }
  return patch
}
