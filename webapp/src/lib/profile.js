import { supabase } from './supabase'

/** Найти или создать профиль по Telegram ID и/или VK ID */
export async function ensureProfile({ telegramId, vkId, fullName, username }) {
  if (!supabase) {
    return { profile: null, error: 'Нет Supabase' }
  }
  if (!telegramId && !vkId) {
    return { profile: null, error: 'Нет Telegram ID или VK ID' }
  }

  // Поиск по Telegram
  if (telegramId) {
    const { data: existingTg, error: selectError } = await supabase
      .from('profiles')
      .select('id, telegram_id, vk_id, full_name, username, role, slug, business_name')
      .eq('telegram_id', telegramId)
      .maybeSingle()

    if (selectError) {
      console.warn('ensureProfile select (tg):', selectError.message)
    }

    if (existingTg) {
      const patch = {}
      if (fullName && existingTg.full_name !== fullName) patch.full_name = fullName
      if (username && existingTg.username !== username) patch.username = username
      if (Object.keys(patch).length) {
        await supabase.from('profiles').update(patch).eq('id', existingTg.id)
        return { profile: { ...existingTg, ...patch }, error: null }
      }
      return { profile: existingTg, error: null }
    }
  }

  // Поиск по VK
  if (vkId) {
    const { data: existingVk, error: selectError } = await supabase
      .from('profiles')
      .select('id, telegram_id, vk_id, full_name, username, role, slug, business_name')
      .eq('vk_id', vkId)
      .maybeSingle()

    if (selectError) {
      console.warn('ensureProfile select (vk):', selectError.message)
    }

    if (existingVk) {
      const patch = {}
      if (fullName && existingVk.full_name !== fullName) patch.full_name = fullName
      if (username && existingVk.username !== username) patch.username = username
      if (Object.keys(patch).length) {
        await supabase.from('profiles').update(patch).eq('id', existingVk.id)
        return { profile: { ...existingVk, ...patch }, error: null }
      }
      return { profile: existingVk, error: null }
    }
  }

  // Создание нового
  const insert = {
    full_name: fullName || null,
    username: username || null,
    role: 'client',
  }
  if (telegramId) insert.telegram_id = telegramId
  if (vkId) insert.vk_id = vkId

  const { data: created, error } = await supabase
    .from('profiles')
    .insert(insert)
    .select('id, telegram_id, vk_id, full_name, username, role, slug, business_name')
    .single()

  if (error) {
    console.warn('ensureProfile:', error.message)
    const rls = /row-level security|RLS/i.test(error.message)
    return {
      profile: null,
      error: rls
        ? 'База не пускает создание профиля. Нужен SQL: supabase/migration_profiles_rls.sql'
        : error.message,
    }
  }
  return { profile: created, error: null }
}

/** Членства пользователя в заведениях */
export async function fetchMemberships(profileId) {
  if (!supabase || !profileId) return []

  const { data, error } = await supabase
    .from('business_members')
    .select(
      'id, role, title, is_active, business_id, businesses(id, slug, name, type)',
    )
    .eq('profile_id', profileId)
    .eq('is_active', true)

  if (error) {
    if (String(error.message || '').includes('business_members')) {
      return fetchLegacyMemberships(profileId)
    }
    console.warn('memberships:', error.message)
    return []
  }
  return data ?? []
}

async function fetchLegacyMemberships(profileId) {
  const { data } = await supabase
    .from('profiles')
    .select('id, slug, business_name, role')
    .eq('id', profileId)
    .eq('role', 'master')
    .maybeSingle()

  if (!data?.slug) return []
  return [
    {
      id: 'legacy',
      role: 'owner',
      title: 'Мастер',
      is_active: true,
      business_id: null,
      businesses: {
        id: null,
        slug: data.slug,
        name: data.business_name || data.slug,
        type: 'barbershop',
      },
      legacy_master_id: data.id,
    },
  ]
}
