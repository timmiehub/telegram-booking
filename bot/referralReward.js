/**
 * +14 дней Pro рефереру, когда приглашённый впервые оплатил Tribute.
 */

const DAY_MS = 864e5
const REWARD_DAYS = 14

function isLifetimePro(settings) {
  const src = String(settings?.pro_source || '')
  if (src.startsWith('lifetime') || src.startsWith('early')) return true
  if (settings?.plan === 'pro' && !settings?.pro_until) return true
  return false
}

async function patchSettings(supabase, businessId, current, patch) {
  const next = { ...(current || {}), ...patch }
  const { error } = await supabase
    .from('businesses')
    .update({ settings: next })
    .eq('id', businessId)
  if (error) throw new Error(error.message)
  return next
}

async function notifyTelegram(telegramId, text) {
  const token = String(process.env.BOT_TOKEN || '').trim()
  if (!token || !telegramId || !text) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        disable_web_page_preview: true,
      }),
    })
  } catch (err) {
    console.warn('referral notify:', err?.message || err)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ id: string, settings?: object }} payingBusiness — кабинет, который только что купил Pro
 * @returns {Promise<{ rewarded: boolean, reason?: string, referrerTelegramId?: number }>}
 */
export async function maybeGrantReferralReward(supabase, payingBusiness) {
  const settings = payingBusiness?.settings || {}
  if (settings.referral_rewarded_at) {
    return { rewarded: false, reason: 'already_rewarded' }
  }
  const referrerTg = Number(settings.referred_by_telegram_id)
  if (!Number.isFinite(referrerTg) || referrerTg <= 0) {
    return { rewarded: false, reason: 'no_referrer' }
  }

  const { data: refProfile } = await supabase
    .from('profiles')
    .select('id, telegram_id')
    .eq('telegram_id', referrerTg)
    .maybeSingle()

  if (!refProfile?.id) {
    await patchSettings(supabase, payingBusiness.id, settings, {
      referral_rewarded_at: new Date().toISOString(),
      referral_reward_skip: 'referrer_not_found',
    })
    return { rewarded: false, reason: 'referrer_not_found', referrerTelegramId: referrerTg }
  }

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, settings')
    .eq('owner_profile_id', refProfile.id)

  const referrerBiz = (owned || [])[0]
  if (!referrerBiz) {
    await patchSettings(supabase, payingBusiness.id, settings, {
      referral_rewarded_at: new Date().toISOString(),
      referral_reward_skip: 'referrer_no_business',
    })
    return { rewarded: false, reason: 'referrer_no_business', referrerTelegramId: referrerTg }
  }

  const refSettings = referrerBiz.settings || {}
  if (!isLifetimePro(refSettings)) {
    const base = refSettings.pro_until
      ? Math.max(Date.now(), new Date(refSettings.pro_until).getTime() || Date.now())
      : Date.now()
    const until = new Date(base + REWARD_DAYS * DAY_MS).toISOString()
    await patchSettings(supabase, referrerBiz.id, refSettings, {
      plan: 'pro',
      pro_source: `referral:${payingBusiness.id}`,
      pro_until: until,
      pro_waitlist: false,
    })
  }

  await patchSettings(supabase, payingBusiness.id, settings, {
    referral_rewarded_at: new Date().toISOString(),
    referral_rewarded_to: referrerTg,
  })

  await notifyTelegram(
    referrerTg,
    isLifetimePro(refSettings)
      ? 'Коллега по вашей ссылке подключил Pro. Спасибо за рекомендацию!'
      : `Коллега по вашей ссылке подключил Pro — вам +${REWARD_DAYS} дней Pro. Спасибо!`,
  )

  return { rewarded: true, referrerTelegramId: referrerTg }
}
