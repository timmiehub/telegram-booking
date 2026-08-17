import { WebApp } from './telegram'
import { ensureProfile } from './profile'
import { resolveOrCreateVkProfile } from './vk'

let cachedIdentity = null
let cachedProfile = null

export function isTelegramEnvironment() {
  try {
    const wa = WebApp
    if (wa.initData && wa.initData.length > 0) return true
    if (wa.initDataUnsafe?.user?.id) return true
    return false
  } catch {
    return false
  }
}

export function getTelegramIdentity() {
  try {
    const user = WebApp.initDataUnsafe?.user
    if (!user?.id) return null
    return {
      type: 'telegram',
      id: Number(user.id),
      name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Telegram',
      username: user.username || null,
    }
  } catch {
    return null
  }
}

export async function getVkIdentity() {
  const result = await resolveOrCreateVkProfile()
  if (!result.ok || !result.profile) return null
  return {
    type: 'vk',
    id: Number(result.profile.vk_id),
    name: result.profile.full_name || `VK ${result.profile.vk_id}`,
    username: result.profile.username || null,
    profile: result.profile,
  }
}

export async function resolveCurrentIdentity() {
  if (cachedIdentity) return cachedIdentity
  const tg = getTelegramIdentity()
  if (tg) {
    cachedIdentity = tg
    return tg
  }
  const vk = await getVkIdentity()
  if (vk) {
    cachedIdentity = vk
    return vk
  }
  return null
}

export async function resolveCurrentProfile() {
  if (cachedProfile) return cachedProfile
  const identity = await resolveCurrentIdentity()
  if (!identity) return null

  if (identity.type === 'telegram') {
    const ensured = await ensureProfile({
      telegramId: identity.id,
      fullName: identity.name,
      username: identity.username,
    })
    cachedProfile = ensured.profile
    return ensured.profile
  }

  if (identity.type === 'vk') {
    if (identity.profile) {
      cachedProfile = identity.profile
      return identity.profile
    }
  }

  return null
}

export function getCachedProfile() {
  return cachedProfile
}

export function getCachedIdentity() {
  return cachedIdentity
}

export function clearIdentityCache() {
  cachedIdentity = null
  cachedProfile = null
}
