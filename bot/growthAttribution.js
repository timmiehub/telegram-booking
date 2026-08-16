/** Метки каналов и реферал (зеркало webapp/src/lib/growthAttribution.js). */

export const GROWTH_CHANNEL_SOURCES = ['master', 'vk', 'ig', 'chat', 'story']

const CHANNEL_SET = new Set(GROWTH_CHANNEL_SOURCES)

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
