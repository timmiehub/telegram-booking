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

function verifyVkAuthKey(vkUserId: number, sign: string, secret: string) {
  return sign === md5(`${APP_ID}_${vkUserId}_${secret}`)
}

async function assertSign(params: Record<string, string>, vkSecret: string) {
  const vkUserId = Number(params.vk_user_id)
  if (!Number.isFinite(vkUserId) || !params.sign) return { ok: false, error: 'bad_vk_params' }
  const isMiniAppSign = await verifyVkMiniAppSign(params, vkSecret)
  const isAuthKey = verifyVkAuthKey(vkUserId, params.sign, vkSecret)
  if (!isMiniAppSign && !isAuthKey) return { ok: false, error: 'bad_sign' }
  return { ok: true, vkUserId }
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

  const action = String(body.action || '')

  try {

  // action: link — Telegram -> VK (direct, mini app passes vk params + telegram_id)
  if (action === 'link') {
    const params = (body.params as Record<string, string>) || {}
    const signRes = await assertSign(params, vkSecret)
    if (!signRes.ok) {
      return new Response(JSON.stringify(signRes), { status: 422, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const vkUserId = signRes.vkUserId
    const telegramId = Number(body.telegram_id)
    if (!Number.isFinite(telegramId)) {
      return new Response(JSON.stringify({ ok: false, error: 'bad_telegram_id' }), { status: 422, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const existing = await rest(`/profiles?select=id&vk_id=eq.${vkUserId}&limit=1`)
    if (existing?.length) {
      return new Response(JSON.stringify({ ok: false, error: 'vk_already_linked' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const profile = await rest(`/profiles?select=id&telegram_id=eq.${telegramId}&limit=1`)
    if (!profile?.length) {
      return new Response(JSON.stringify({ ok: false, error: 'profile_not_found' }), { status: 422, headers: { ...cors, 'Content-Type': 'application/json' } })
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

  // action: resolve — find profile by vk_id
  if (action === 'resolve') {
    const params = (body.params as Record<string, string>) || {}
    const signRes = await assertSign(params, vkSecret)
    if (!signRes.ok) {
      return new Response(JSON.stringify(signRes), { status: 422, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const vkUserId = signRes.vkUserId
    const profile = await rest(`/profiles?select=id,telegram_id,vk_id,full_name,username,role,slug,business_name&vk_id=eq.${vkUserId}&limit=1`)
    return new Response(JSON.stringify({ ok: true, profile: profile?.[0] || null }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // action: create_link_code — VK -> Telegram flow
  if (action === 'create_link_code') {
    const params = (body.params as Record<string, string>) || {}
    const signRes = await assertSign(params, vkSecret)
    if (!signRes.ok) {
      return new Response(JSON.stringify(signRes), { status: 422, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const vkUserId = signRes.vkUserId

    const code = crypto.randomUUID().replace(/-/g, '')
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    await rest('/vk_link_tokens', {
      method: 'POST',
      headers: supabaseHeaders,
      body: JSON.stringify({
        code,
        vk_id: vkUserId,
        sign: params.sign,
        expires_at: expiresAt,
      }),
    })

    return new Response(JSON.stringify({ ok: true, code, vk_id: vkUserId, expires_at: expiresAt }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // action: consume_link_code — Telegram bot uses code to link VK
  if (action === 'consume_link_code') {
    const code = String(body.code || '')
    const telegramId = Number(body.telegram_id)
    if (!code) return new Response(JSON.stringify({ ok: false, error: 'no_code' }), { status: 422, headers: { ...cors, 'Content-Type': 'application/json' } })
    if (!Number.isFinite(telegramId)) return new Response(JSON.stringify({ ok: false, error: 'bad_telegram_id' }), { status: 422, headers: { ...cors, 'Content-Type': 'application/json' } })

    const token = await rest(`/vk_link_tokens?select=code,vk_id,used,expires_at&code=eq.${encodeURIComponent(code)}&limit=1`)
    if (!token?.length) return new Response(JSON.stringify({ ok: false, error: 'code_not_found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })

    const t = token[0]
    if (t.used) return new Response(JSON.stringify({ ok: false, error: 'code_used' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } })
    if (new Date(t.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ ok: false, error: 'code_expired' }), { status: 410, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const existingVk = await rest(`/profiles?select=id&vk_id=eq.${t.vk_id}&limit=1`)
    if (existingVk?.length) {
      return new Response(JSON.stringify({ ok: false, error: 'vk_already_linked' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const profile = await rest(`/profiles?select=id,vk_id&telegram_id=eq.${telegramId}&limit=1`)
    if (!profile?.length) {
      return new Response(JSON.stringify({ ok: false, error: 'profile_not_found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    if (profile[0].vk_id && Number(profile[0].vk_id) !== Number(t.vk_id)) {
      return new Response(JSON.stringify({ ok: false, error: 'telegram_already_linked' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    await rest(`/profiles?id=eq.${profile[0].id}`, {
      method: 'PATCH',
      headers: supabaseHeaders,
      body: JSON.stringify({ vk_id: t.vk_id }),
    })

    await rest(`/vk_link_tokens?code=eq.${encodeURIComponent(code)}`, {
      method: 'PATCH',
      headers: supabaseHeaders,
      body: JSON.stringify({ used: true }),
    })

    return new Response(JSON.stringify({ ok: true, profile_id: profile[0].id, vk_id: t.vk_id }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // action: resolve_or_create — VK-only вход (без Telegram)
  if (action === 'resolve_or_create') {
    const params = (body.params as Record<string, string>) || {}
    const signRes = await assertSign(params, vkSecret)
    if (!signRes.ok) {
      return new Response(JSON.stringify(signRes), { status: 422, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const vkUserId = signRes.vkUserId

    const existing = await rest(`/profiles?select=id,telegram_id,vk_id,full_name,username,role,slug,business_name&vk_id=eq.${vkUserId}&limit=1`)
    if (existing?.length) {
      return new Response(JSON.stringify({ ok: true, profile: existing[0], created: false }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const firstName = body.first_name || params.vk_first_name || ''
    const lastName = body.last_name || params.vk_last_name || ''
    const fullName = `${firstName} ${lastName}`.trim() || null
    const username = body.username || params.vk_username || null

    const inserted = await rest('/profiles', {
      method: 'POST',
      headers: supabaseHeaders,
      body: JSON.stringify({
        vk_id: vkUserId,
        full_name: fullName,
        username,
        role: 'client',
      }),
    })

    if (!inserted?.length) {
      return new Response(JSON.stringify({ ok: false, error: 'create_profile_failed' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, profile: inserted[0], created: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: false, error: 'unknown_action' }), {
    status: 422,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String((err as Error)?.message || err) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }
})
