import { WebApp } from './telegram'

let vkBridge = null

export function isVkEnvironment() {
  try {
    return (
      typeof window !== 'undefined' &&
      (window.location.search?.includes('vk_') || window.location.hash?.includes('vk_'))
    )
  } catch {
    return false
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function initVkBridge() {
  if (!isVkEnvironment()) return null
  try {
    const { default: bridge } = await import('@vkontakte/vk-bridge')
    vkBridge = bridge
    await Promise.race([bridge.send('VKWebAppInit'), wait(1500)])
  } catch (err) {
    console.warn('VK Bridge init skipped', err)
  }
  return vkBridge
}

export function getVkBridge() {
  return vkBridge
}

function getAllVkParams() {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const params = {}
  for (const [k, v] of [...search, ...hash]) {
    if (k.startsWith('vk_') || k === 'sign') params[k] = v
  }
  return params
}

export function getTelegramIdFromVk() {
  const params = new URLSearchParams(window.location.search)
  const tg = params.get('tg')
  if (tg) return Number(tg)
  const hash = String(window.location.hash || '').replace(/^#/, '')
  const m = hash.match(/(?:^|&)tg_(\d+)/)
  return m ? Number(m[1]) : null
}

export async function getVkLaunchParams() {
  const fromUrl = getAllVkParams()
  if (fromUrl.vk_user_id && fromUrl.sign) return fromUrl
  if (!vkBridge) return fromUrl
  try {
    const params = await Promise.race([vkBridge.send('VKWebAppGetLaunchParams'), wait(2000)])
    return { ...fromUrl, ...(params || {}) }
  } catch {
    return fromUrl
  }
}

export async function resolveVkProfile() {
  const params = await getVkLaunchParams()
  const vkUserId = Number(params.vk_user_id)
  if (!Number.isFinite(vkUserId)) return { ok: false, error: 'no_vk_user' }
  if (!params.sign) return { ok: false, error: 'no_vk_sign' }

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vk-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'resolve',
      params,
    }),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: json.error || 'resolve_failed' }
  if (json.profile && !json.profile.vk_id) json.profile.vk_id = vkUserId
  return { ok: true, ...json }
}

export async function getVkUserInfo() {
  if (!vkBridge) return null
  try {
    const user = await Promise.race([vkBridge.send('VKWebAppGetUserInfo'), wait(2000)])
    return user || null
  } catch {
    return null
  }
}

export async function createVkProfile() {
  const params = await getVkLaunchParams()
  const vkUserId = Number(params.vk_user_id)
  if (!Number.isFinite(vkUserId)) return { ok: false, error: 'no_vk_user' }
  if (!params.sign) return { ok: false, error: 'no_vk_sign' }

  const userInfo = await getVkUserInfo()

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vk-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'resolve_or_create',
      params,
      first_name: userInfo?.first_name || '',
      last_name: userInfo?.last_name || '',
      username: userInfo?.screen_name || userInfo?.domain || '',
    }),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: json.error || 'create_failed' }
  if (json.profile && !json.profile.vk_id) json.profile.vk_id = vkUserId
  return { ok: true, ...json }
}

export async function resolveOrCreateVkProfile() {
  return createVkProfile()
}

export async function linkVkAccount(telegramId) {
  const params = await getVkLaunchParams()
  const vkUserId = Number(params.vk_user_id)
  if (!Number.isFinite(vkUserId)) return { ok: false, error: 'no_vk_user' }
  if (!params.sign) return { ok: false, error: 'no_vk_sign' }

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vk-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'link',
      params,
      telegram_id: Number(telegramId),
    }),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: json.error || 'link_failed' }
  return { ok: true, ...json }
}

export async function createVkLinkCode() {
  const params = await getVkLaunchParams()
  const vkUserId = Number(params.vk_user_id)
  if (!Number.isFinite(vkUserId)) return { ok: false, error: 'no_vk_user' }
  if (!params.sign) return { ok: false, error: 'no_vk_sign' }

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vk-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: 'create_link_code',
      params,
    }),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: json.error || 'create_failed' }
  return { ok: true, ...json }
}

export function openVkMiniApp(telegramId) {
  const url = `https://vk.com/app54724722?tg=${telegramId}`
  if (vkBridge?.send) {
    vkBridge.send('VKWebAppOpenLink', { url })
  } else {
    window.open(url, '_blank')
  }
}

export function openTelegramForVkLink(code) {
  const url = `https://t.me/booking_inapp_bot?start=link_${code}`
  if (vkBridge?.send) {
    vkBridge.send('VKWebAppOpenLink', { url })
    return
  }
  const opened = window.open(url, '_blank')
  if (!opened) {
    // popup blocked or not allowed — open in the same tab
    window.location.href = url
  }
}
