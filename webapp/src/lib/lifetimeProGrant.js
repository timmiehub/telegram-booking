import { isProPlan } from './pro'
import { supabase } from './supabase'
import {
  LAUNCH_PRO_CUTOFF_MS,
  LAUNCH_PRO_DAYS,
  launchProGift,
} from './lifetimePro'

/**
 * Pro на 1 месяц для кабинетов, созданных до LAUNCH_PRO_CUTOFF (включительно).
 * Уже активный Pro не трогаем.
 */
export async function ensureLaunchProForBusiness(businessId) {
  if (!businessId || !supabase) {
    return { ok: false, applied: false, grant: null }
  }

  const { data, error: readErr } = await supabase
    .from('businesses')
    .select('settings, created_at')
    .eq('id', businessId)
    .maybeSingle()

  if (readErr) {
    return { ok: false, applied: false, grant: null, error: readErr.message }
  }
  if (!data) {
    return { ok: false, applied: false, grant: null, error: 'Кабинет не найден' }
  }

  const settings =
    data.settings && typeof data.settings === 'object' ? data.settings : {}

  if (isProPlan(settings)) {
    return { ok: true, applied: false, grant: null }
  }

  const createdMs = data.created_at ? Date.parse(data.created_at) : NaN
  if (!Number.isFinite(createdMs) || createdMs > LAUNCH_PRO_CUTOFF_MS) {
    return { ok: true, applied: false, grant: null }
  }

  const until = new Date(
    Date.now() + LAUNCH_PRO_DAYS * 864e5,
  ).toISOString()

  const next = {
    ...settings,
    plan: 'pro',
    pro_source: 'launch:1m',
    pro_until: until,
    pro_waitlist: false,
  }

  const { error } = await supabase
    .from('businesses')
    .update({ settings: next })
    .eq('id', businessId)

  if (error) {
    return { ok: false, applied: false, grant: null, error: error.message }
  }

  return {
    ok: true,
    applied: true,
    grant: launchProGift(),
    settings: next,
  }
}

/** @deprecated alias — старые импорты */
export async function ensureLifetimeProForBusiness(businessId) {
  return ensureLaunchProForBusiness(businessId)
}
