/**
 * Tribute webhooks → businesses.settings.plan
 * Docs: https://wiki.tribute.tg/ru/api-dokumentaciya/vebkhuki
 */
import http from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'

import { maybeGrantReferralReward } from './referralReward.js'

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function verifyTributeSignature(rawBody, signatureHeader, apiKey) {
  if (!apiKey || !signatureHeader) return false
  const expected = createHmac('sha256', apiKey).update(rawBody).digest('hex')
  const got = String(signatureHeader).trim()
  try {
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(got, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function eventName(body) {
  return String(body?.name || body?.event || body?.type || '').toLowerCase()
}

async function findBusinessesForTelegram(supabase, telegramUserId) {
  const tg = Number(telegramUserId)
  if (!Number.isFinite(tg)) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_id', tg)
    .maybeSingle()

  if (!profile?.id) return []

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, settings, owner_profile_id')
    .eq('owner_profile_id', profile.id)

  return owned || []
}

function pickCheckoutBusiness(rows, telegramUserId) {
  if (!rows?.length) return null
  const tg = String(telegramUserId)
  const ranked = [...rows].sort((a, b) => {
    const ta = Date.parse(a.settings?.pro_checkout_at || 0) || 0
    const tb = Date.parse(b.settings?.pro_checkout_at || 0) || 0
    return tb - ta
  })
  const matched = ranked.find((b) => String(b.settings?.pro_checkout_by || '') === tg)
  return matched || ranked[0]
}

async function patchBusinessSettings(supabase, businessId, currentSettings, patch) {
  const next = { ...(currentSettings || {}), ...patch }
  const { error } = await supabase
    .from('businesses')
    .update({ settings: next })
    .eq('id', businessId)
  if (error) throw new Error(error.message)
  return next
}

async function activatePro(supabase, business, payload) {
  return patchBusinessSettings(supabase, business.id, business.settings, {
    plan: 'pro',
    pro_source: 'tribute',
    pro_until: payload.expires_at || null,
    tribute_subscription_id: payload.subscription_id ?? null,
    pro_waitlist: false,
  })
}

async function deactivatePro(supabase, business, payload) {
  return patchBusinessSettings(supabase, business.id, business.settings, {
    plan: 'free',
    pro_source: 'tribute',
    pro_until: payload.expires_at || new Date().toISOString(),
    tribute_subscription_id: payload.subscription_id ?? null,
  })
}

export async function handleTributeEvent(supabase, body, { subscriptionIdFilter } = {}) {
  const name = eventName(body)
  const payload = body?.payload || body?.data || body
  const telegramUserId = payload?.telegram_user_id
  const subId = payload?.subscription_id

  if (
    subscriptionIdFilter &&
    subId != null &&
    String(subId) !== String(subscriptionIdFilter)
  ) {
    return { ok: true, skipped: 'subscription_filter' }
  }

  const isActivate =
    name.includes('new_subscription') || name.includes('renewed_subscription')
  const isCancel = name.includes('cancelled_subscription')

  if (!isActivate && !isCancel) {
    return { ok: true, skipped: 'unhandled_event', name }
  }

  const rows = await findBusinessesForTelegram(supabase, telegramUserId)
  const business = pickCheckoutBusiness(rows, telegramUserId)
  if (!business) {
    return {
      ok: false,
      error: 'business_not_found',
      telegram_user_id: telegramUserId,
    }
  }

  if (isActivate) {
    const nextSettings = await activatePro(supabase, business, payload)
    const referral = await maybeGrantReferralReward(supabase, {
      id: business.id,
      settings: nextSettings,
    })
    return {
      ok: true,
      action: 'activate',
      businessId: business.id,
      referral,
    }
  }

  await deactivatePro(supabase, business, payload)
  return { ok: true, action: 'deactivate', businessId: business.id }
}

/**
 * HTTP listener for Tribute. Path: POST /tribute/webhook
 */
export function startTributeWebhookServer(supabase, {
  port = 8787,
  apiKey = '',
  subscriptionIdFilter = '',
} = {}) {
  if (!apiKey) {
    console.warn(
      'Tribute webhook: TRIBUTE_API_KEY пуст — сервер не стартует. Задайте ключ в bot/.env',
    )
    return null
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/tribute/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, service: 'tribute-webhook' }))
      return
    }

    if (req.method !== 'POST' || url.pathname !== '/tribute/webhook') {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'not_found' }))
      return
    }

    try {
      const raw = await readRawBody(req)
      const signature =
        req.headers['trbt-signature'] ||
        req.headers['Trbt-Signature'] ||
        req.headers['x-trbt-signature']

      if (!verifyTributeSignature(raw, signature, apiKey)) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'bad_signature' }))
        return
      }

      let body = {}
      try {
        body = JSON.parse(raw.toString('utf8') || '{}')
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'invalid_json' }))
        return
      }

      const result = await handleTributeEvent(supabase, body, {
        subscriptionIdFilter: subscriptionIdFilter || '',
      })
      console.log('Tribute webhook:', result)
      res.writeHead(result.ok ? 200 : 422, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (err) {
      console.error('Tribute webhook error:', err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: err.message || 'server_error' }))
    }
  })

  server.listen(port, () => {
    console.log(
      `Tribute webhook: http://0.0.0.0:${port}/tribute/webhook (нужен публичный HTTPS → этот порт)`,
    )
  })

  return server
}
