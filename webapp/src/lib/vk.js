import { WebApp } from './telegram'

function safeOpenExternal(url) {
  try {
    if (WebApp.openLink) {
      const options = { try_instant_view: false }
      const unsafe = WebApp.openLink
      return unsafe(url, options)
    }
  } catch (err) {
    console.warn('openLink failed', err)
  }
  window.open(url, '_blank')
}

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

export async function linkVkAccount(telegramId) {
  const params = getAllVkParams()
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

export async function resolveVkProfile() {
  const params = getAllVkParams()
  const vkUserId = Number(params.vk_user_id)
  if (!Number.isFinite(vkUserId)) return { ok: false, error: 'no_vk_user' }

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
  return { ok: true, ...json }
}

export function openVkMiniApp(telegramId) {
  const url = `https://vk.com/app54724722?tg=${telegramId}`
  safeOpenExternal(url)
}
