/**
 * VK auth + account linking (Telegram <-> VK).
 * URL: https://jwmequerozztzpzisusa.supabase.co/functions/v1/vk-auth
 */
import md5 from 'npm:md5'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const APP_ID = 54724722

async function hmacSha256B64(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  let b64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
  b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return b64
}

/**
 * Проверка подписи launch params VK Mini App.
 * Алгоритм: https://dev.vk.com/mini-apps/development/launch-params-sign
 */
async function verifyVkMiniAppSign(params: Record<string, string>, secret: string) {
  const vkParams: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    if (k.startsWith('vk_')) vkParams[k] = v
  }
  const sortedKeys = Object.keys(vkParams).sort()
  const query = sortedKeys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(vkParams[k])}`).join('&')
  const expected = await hmacSha256B64(query, secret)
  return params.sign === expected
}

/** Legacy auth_key из standalone/OAuth (md5(app_id + '_' + user_id + '_' + secret)). */
function verifyVkAuthKey(vkUserId: number, sign: string, secret: string) {
  return sign === md5(`${APP_ID}_${vkUserId}_${secret}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, service: 'vk-auth' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const vkSecret = Deno.env.get('VK_SERVICE_KEY') || ''

  if (!supabaseUrl || !serviceKey || !vkSecret) {
    return new Response(JSON.stringify({ ok: false, error: 'server_misconfigured' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const action = String(body.action || '')
  const params = (body.params as Record<string, string>) || {}
  const vkUserId = Number(params.vk_user_id || body.vk_user_id)
  const sign = String(params.sign || body.sign || '')
  const telegramId = Number(body.telegram_id)

  if (!Number.isFinite(vkUserId) || !sign) {
    return new Response(JSON.stringify({ ok: false, error: 'bad_vk_params' }), {
      status: 422,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const isMiniAppSign = await verifyVkMiniAppSign(params, vkSecret)
  const isAuthKey = verifyVkAuthKey(vkUserId, sign, vkSecret)

  if (!isMiniAppSign && !isAuthKey) {
    return new Response(JSON.stringify({ ok: false, error: 'bad_sign' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const supabaseHeaders = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  async function rest(path: string, init: RequestInit = { headers: supabaseHeaders }) {
    const res = await fetch(`${supabaseUrl}/rest/v1${path}`, init)
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (!res.ok) throw new Error(data?.message || text)
    return data
  }

  if (action === 'link' && Number.isFinite(telegramId)) {
    const existing = await rest(`/profiles?select=id&vk_id=eq.${vkUserId}&limit=1`)
    if (existing?.length) {
      return new Response(JSON.stringify({ ok: false, error: 'vk_already_linked' }), {
        status: 409,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const profile = await rest(`/profiles?select=id&telegram_id=eq.${telegramId}&limit=1`)
    if (!profile?.length) {
      return new Response(JSON.stringify({ ok: false, error: 'profile_not_found' }), {
        status: 422,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const updated = await rest(`/profiles?id=eq.${profile[0].id}`, {
      method: 'PATCH',
      headers: supabaseHeaders,
      body: JSON.stringify({ vk_id: vkUserId }),
    })

    return new Response(JSON.stringify({ ok: true, profile_id: updated[0].id, vk_id: vkUserId }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (action === 'resolve') {
    const profile = await rest(`/profiles?select=id,telegram_id,full_name,role&vk_id=eq.${vkUserId}&limit=1`)
    return new Response(JSON.stringify({ ok: true, profile: profile?.[0] || null }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: false, error: 'unknown_action' }), {
    status: 422,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
