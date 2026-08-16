import { supabase } from './supabase'

const DEFAULT_LAYER = { scale: 1, x: 50, y: 50 }

export const DEFAULT_BUSINESS_SETTINGS = {
  reschedule_min_hours: 24,
  require_confirm: false,
  plan: 'free',
  pro_waitlist: false,
  media_frame: {
    cover: { ...DEFAULT_LAYER },
    avatar: { ...DEFAULT_LAYER },
  },
}

const PASS_THROUGH_KEYS = [
  'pro_waitlist_at',
  'pro_source',
  'pro_until',
  'tribute_subscription_id',
  'pro_checkout_at',
  'pro_checkout_by',
  'team_invite_code',
  'team_invite_at',
  'reminders',
  'reply_templates',
  'locations',
  'request_report',
  'acquisition_source',
  'referred_by_telegram_id',
  'referral_rewarded_at',
  'referral_rewarded_to',
  'referral_reward_skip',
  'pro_nudge_at',
]

function clampPos(n, fallback = 50) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(0, Math.min(100, Math.round(v)))
}

function clampScale(n, fallback = 1) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(1, Math.min(3, Math.round(v * 100) / 100))
}

function normalizeLayer(raw, legacyX, legacyY) {
  if (raw && typeof raw === 'object') {
    return {
      scale: clampScale(raw.scale, 1),
      x: clampPos(raw.x, 50),
      y: clampPos(raw.y, 50),
    }
  }
  return {
    scale: 1,
    x: clampPos(legacyX, 50),
    y: clampPos(legacyY, 50),
  }
}

export function normalizeMediaFrame(raw) {
  const base = {
    cover: { ...DEFAULT_LAYER },
    avatar: { ...DEFAULT_LAYER },
  }
  if (!raw || typeof raw !== 'object') return base
  return {
    cover: normalizeLayer(raw.cover, raw.cover_x, raw.cover_y),
    avatar: normalizeLayer(raw.avatar, raw.avatar_x, raw.avatar_y),
  }
}

export function mediaFrameStyle(frame) {
  const f = normalizeMediaFrame(frame)
  return {
    '--cover-pos-x': `${f.cover.x}%`,
    '--cover-pos-y': `${f.cover.y}%`,
    '--cover-scale': String(f.cover.scale),
    '--avatar-pos-x': `${f.avatar.x}%`,
    '--avatar-pos-y': `${f.avatar.y}%`,
    '--avatar-scale': String(f.avatar.scale),
  }
}

/** Accent from button primary — soft gold mix, no manual picker */
export function accentFromPrimary(primary) {
  const p = String(primary || '#cf9a4a').trim()
  if (!/^#[0-9a-fA-F]{6}$/.test(p)) return '#e8b84a'
  const r = parseInt(p.slice(1, 3), 16)
  const g = parseInt(p.slice(3, 5), 16)
  const b = parseInt(p.slice(5, 7), 16)
  const mix = (c, t, a = 0.45) => Math.round(c * (1 - a) + t * a)
  const nr = mix(r, 232)
  const ng = mix(g, 184)
  const nb = mix(b, 74)
  return `#${[nr, ng, nb].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

export function normalizeSettings(raw) {
  const base = {
    ...DEFAULT_BUSINESS_SETTINGS,
    media_frame: normalizeMediaFrame(null),
  }
  if (!raw || typeof raw !== 'object') return base
  const hours = Number(raw.reschedule_min_hours)
  if (Number.isFinite(hours) && hours >= 0 && hours <= 168) {
    base.reschedule_min_hours = Math.round(hours)
  }
  if (typeof raw.require_confirm === 'boolean') {
    base.require_confirm = raw.require_confirm
  }
  if (raw.plan === 'pro' || raw.plan === 'free') {
    base.plan = raw.plan
  }
  if (typeof raw.pro_waitlist === 'boolean') {
    base.pro_waitlist = raw.pro_waitlist
  }
  base.media_frame = normalizeMediaFrame(raw.media_frame)
  for (const k of PASS_THROUGH_KEYS) {
    if (raw[k] != null && raw[k] !== '') base[k] = raw[k]
  }
  for (const k of Object.keys(raw)) {
    if (k.startsWith('report_sent_') && raw[k] != null) base[k] = raw[k]
  }
  return base
}

export async function fetchBusinessSettings(businessId) {
  if (!businessId || !supabase) {
    return { settings: DEFAULT_BUSINESS_SETTINGS }
  }
  const { data, error } = await supabase
    .from('businesses')
    .select('settings')
    .eq('id', businessId)
    .maybeSingle()

  if (error) {
    if (/settings/i.test(String(error.message || ''))) {
      return { settings: DEFAULT_BUSINESS_SETTINGS }
    }
    console.warn('settings:', error.message)
    return { settings: DEFAULT_BUSINESS_SETTINGS }
  }
  return { settings: normalizeSettings(data?.settings) }
}

export async function updateBusinessSettings(businessId, patch) {
  if (!businessId || !supabase) {
    return { ok: false, error: 'Нет подключения' }
  }
  const current = await fetchBusinessSettings(businessId)
  const next = normalizeSettings({ ...current.settings, ...patch })
  const { error } = await supabase
    .from('businesses')
    .update({ settings: next })
    .eq('id', businessId)

  if (error) {
    if (/settings/i.test(String(error.message || ''))) {
      return {
        ok: false,
        error: 'Колонка settings не найдена. Выполните migration_yclients_features.sql.',
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, settings: next }
}

export function canModifyBooking(startsAtIso, settings, { now = Date.now() } = {}) {
  const start = new Date(startsAtIso).getTime()
  if (Number.isNaN(start)) return false
  const minMs = (settings?.reschedule_min_hours ?? 24) * 60 * 60 * 1000
  return start - now >= minMs
}
