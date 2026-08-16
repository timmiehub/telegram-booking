import { supabase } from './supabase'

/** Найти или создать профиль по Telegram ID */
export async function ensureProfile({ telegramId, fullName, username }) {
  if (!supabase || !telegramId) {
    return { profile: null, error: 'Нет Telegram ID или Supabase' }
  }

  const { data: existing, error: selectError } = await supabase
    .from('profiles')
    .select('id, telegram_id, full_name, username, role, slug, business_name')
    .eq('telegram_id', telegramId)
    .maybeSingle()

  if (selectError) {
    console.warn('ensureProfile select:', selectError.message)
  }

  if (existing) {
    const patch = {}
    if (fullName && existing.full_name !== fullName) patch.full_name = fullName
    if (username && existing.username !== username) patch.username = username
    if (Object.keys(patch).length) {
      await supabase.from('profiles').update(patch).eq('id', existing.id)
      return { profile: { ...existing, ...patch }, error: null }
    }
    return { profile: existing, error: null }
  }

  const { data: created, error } = await supabase
    .from('profiles')
    .insert({
      telegram_id: telegramId,
      full_name: fullName || null,
      username: username || null,
      role: 'client',
    })
    .select('id, telegram_id, full_name, username, role, slug, business_name')
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
