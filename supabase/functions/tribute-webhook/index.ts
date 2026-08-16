/**
 * Permanent Tribute webhook → businesses.settings.plan = pro|free
 * URL: https://jwmequerozztzpzisusa.supabase.co/functions/v1/tribute-webhook
 * Deploy: supabase functions deploy tribute-webhook --no-verify-jwt
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, trbt-signature',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message),
  )
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

function eventName(body: Record<string, unknown>) {
  return String(body?.name || body?.event || body?.type || '').toLowerCase()
}

function pickCheckoutBusiness(
  rows: Array<{ id: string; settings?: Record<string, unknown> }>,
  telegramUserId: string | number,
) {
  if (!rows?.length) return null
  const tg = String(telegramUserId)
  const ranked = [...rows].sort((a, b) => {
    const ta = Date.parse(String(a.settings?.pro_checkout_at || 0)) || 0
    const tb = Date.parse(String(b.settings?.pro_checkout_at || 0)) || 0
    return tb - ta
  })
  const matched = ranked.find(
    (b) => String(b.settings?.pro_checkout_by || '') === tg,
  )
  return matched || ranked[0]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, service: 'tribute-webhook' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('TRIBUTE_API_KEY') || ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const subFilter = Deno.env.get('TRIBUTE_SUBSCRIPTION_ID') || ''

  if (!apiKey || !supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ ok: false, error: 'server_misconfigured' }),
      {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      },
    )
  }

  const raw = await req.text()
  const signature =
    req.headers.get('trbt-signature') ||
    req.headers.get('Trbt-Signature') ||
    req.headers.get('x-trbt-signature') ||
    ''

  const expected = await hmacHex(apiKey, raw)
  if (!signature || !timingSafeEqual(expected, String(signature).trim())) {
    return new Response(JSON.stringify({ ok: false, error: 'bad_signature' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(raw || '{}')
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const name = eventName(body)
  const payload = (body.payload || body.data || body) as Record<string, unknown>
  const telegramUserId = payload.telegram_user_id
  const subId = payload.subscription_id

  if (subFilter && subId != null && String(subId) !== String(subFilter)) {
    return new Response(JSON.stringify({ ok: true, skipped: 'subscription_filter' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const isActivate =
    name.includes('new_subscription') || name.includes('renewed_subscription')
  const isCancel = name.includes('cancelled_subscription')

  if (!isActivate && !isCancel) {
    return new Response(
      JSON.stringify({ ok: true, skipped: 'unhandled_event', name }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const tg = Number(telegramUserId)
  if (!Number.isFinite(tg)) {
    return new Response(JSON.stringify({ ok: false, error: 'no_telegram_id' }), {
      status: 422,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_id', tg)
    .maybeSingle()

  if (!profile?.id) {
    return new Response(
      JSON.stringify({ ok: false, error: 'profile_not_found', telegram_user_id: tg }),
      {
        status: 422,
        headers: { ...cors, 'Content-Type': 'application/json' },
      },
    )
  }

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, settings, owner_profile_id')
    .eq('owner_profile_id', profile.id)

  const business = pickCheckoutBusiness(owned || [], tg)
  if (!business) {
    return new Response(
      JSON.stringify({ ok: false, error: 'business_not_found', telegram_user_id: tg }),
      {
        status: 422,
        headers: { ...cors, 'Content-Type': 'application/json' },
      },
    )
  }

  const patch = isActivate
    ? {
        plan: 'pro',
        pro_source: 'tribute',
        pro_until: payload.expires_at || null,
        tribute_subscription_id: payload.subscription_id ?? null,
        pro_waitlist: false,
      }
    : {
        plan: 'free',
        pro_source: 'tribute',
        pro_until: payload.expires_at || new Date().toISOString(),
        tribute_subscription_id: payload.subscription_id ?? null,
      }

  const next = { ...(business.settings || {}), ...patch }
  const { error } = await supabase
    .from('businesses')
    .update({ settings: next })
    .eq('id', business.id)

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  let referral: Record<string, unknown> | null = null
  if (isActivate) {
    referral = await maybeGrantReferralReward(supabase, {
      id: business.id,
      settings: next,
    })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      action: isActivate ? 'activate' : 'deactivate',
      businessId: business.id,
      referral,
    }),
    { headers: { ...cors, 'Content-Type': 'application/json' } },
  )
})

async function maybeGrantReferralReward(
  supabase: ReturnType<typeof createClient>,
  payingBusiness: { id: string; settings?: Record<string, unknown> },
) {
  const DAY_MS = 864e5
  const REWARD_DAYS = 14
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
    await supabase
      .from('businesses')
      .update({
        settings: {
          ...settings,
          referral_rewarded_at: new Date().toISOString(),
          referral_reward_skip: 'referrer_not_found',
        },
      })
      .eq('id', payingBusiness.id)
    return { rewarded: false, reason: 'referrer_not_found', referrerTelegramId: referrerTg }
  }

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, settings')
    .eq('owner_profile_id', refProfile.id)

  const referrerBiz = (owned || [])[0] as
    | { id: string; settings?: Record<string, unknown> }
    | undefined
  if (!referrerBiz) {
    await supabase
      .from('businesses')
      .update({
        settings: {
          ...settings,
          referral_rewarded_at: new Date().toISOString(),
          referral_reward_skip: 'referrer_no_business',
        },
      })
      .eq('id', payingBusiness.id)
    return {
      rewarded: false,
      reason: 'referrer_no_business',
      referrerTelegramId: referrerTg,
    }
  }

  const refSettings = referrerBiz.settings || {}
  const src = String(refSettings.pro_source || '')
  const lifetime =
    src.startsWith('lifetime') ||
    src.startsWith('early') ||
    (refSettings.plan === 'pro' && !refSettings.pro_until)

  if (!lifetime) {
    const base = refSettings.pro_until
      ? Math.max(
          Date.now(),
          new Date(String(refSettings.pro_until)).getTime() || Date.now(),
        )
      : Date.now()
    const until = new Date(base + REWARD_DAYS * DAY_MS).toISOString()
    await supabase
      .from('businesses')
      .update({
        settings: {
          ...refSettings,
          plan: 'pro',
          pro_source: `referral:${payingBusiness.id}`,
          pro_until: until,
          pro_waitlist: false,
        },
      })
      .eq('id', referrerBiz.id)
  }

  await supabase
    .from('businesses')
    .update({
      settings: {
        ...settings,
        referral_rewarded_at: new Date().toISOString(),
        referral_rewarded_to: referrerTg,
      },
    })
    .eq('id', payingBusiness.id)

  const botToken = Deno.env.get('BOT_TOKEN') || ''
  if (botToken) {
    const text = lifetime
      ? 'Коллега по вашей ссылке подключил Pro. Спасибо за рекомендацию!'
      : `Коллега по вашей ссылке подключил Pro — вам +${REWARD_DAYS} дней Pro. Спасибо!`
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: referrerTg,
          text,
          disable_web_page_preview: true,
        }),
      })
    } catch {
      // ignore notify errors
    }
  }

  return { rewarded: true, referrerTelegramId: referrerTg }
}
