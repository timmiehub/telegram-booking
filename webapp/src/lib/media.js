import { supabase } from './supabase'

const BUCKET = 'business-media'

function extFromFile(file) {
  const name = String(file?.name || '')
  const m = name.match(/\.([a-z0-9]+)$/i)
  if (m) return m[1].toLowerCase().slice(0, 5)
  if (file?.type === 'image/webp') return 'webp'
  if (file?.type === 'image/png') return 'png'
  return 'jpg'
}

/** Upload image → public URL. Needs bucket business-media (see migration). */
export async function uploadBusinessImage({ businessId, file, kind = 'avatar' }) {
  if (!supabase || !businessId || !file) {
    return { ok: false, error: 'Нет данных для загрузки' }
  }
  const ext = extFromFile(file)
  const path = `${businessId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
  const contentType =
    file.type && String(file.type).startsWith('image/')
      ? file.type
      : ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg'
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType,
  })
  if (error) return { ok: false, error: error.message }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const url = data?.publicUrl
  if (!url) return { ok: false, error: 'Не получили URL' }
  return { ok: true, url }
}

export async function updateBusinessMedia({
  businessId,
  masterId,
  avatarUrl,
  coverUrl,
}) {
  if (!supabase || !businessId) return { ok: false, error: 'Нет business id' }

  const patch = {}
  if (avatarUrl) patch.avatar_url = avatarUrl
  if (coverUrl) patch.cover_url = coverUrl
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('businesses').update(patch).eq('id', businessId)
    if (error) return { ok: false, error: error.message }
  }

  const themePatch = {}
  if (avatarUrl) themePatch.logo_url = avatarUrl
  if (coverUrl) themePatch.cover_url = coverUrl
  if (Object.keys(themePatch).length) {
    await supabase.from('themes').update(themePatch).eq('business_id', businessId)
    if (masterId) {
      await supabase.from('themes').update(themePatch).eq('master_id', masterId)
    }
  }
  return { ok: true }
}

export async function updateBusinessType(businessId, type) {
  if (!supabase || !businessId || !type) {
    return { ok: false, error: 'Нет данных' }
  }
  const { error } = await supabase
    .from('businesses')
    .update({ type })
    .eq('id', businessId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

const NAME_BLOCKLIST = ['хуй', 'пизд', 'еба', 'бля', 'сука', 'муда', 'ганд']

export function validateBusinessName(name) {
  const n = String(name || '').trim()
  if (n.length < 3) return { ok: false, error: 'Минимум 3 символа' }
  if (!/[a-zA-Zа-яА-ЯёЁ0-9]/.test(n)) {
    return { ok: false, error: 'Добавьте буквы или цифры' }
  }
  const lower = n.toLowerCase()
  for (const word of NAME_BLOCKLIST) {
    if (lower.includes(word)) return { ok: false, error: 'Недопустимое название' }
  }
  return { ok: true, name: n }
}

export async function updateBusinessName(businessId, name) {
  const check = validateBusinessName(name)
  if (!check.ok) return check
  if (!supabase || !businessId) {
    return { ok: false, error: 'Нет данных' }
  }
  const { error } = await supabase
    .from('businesses')
    .update({ name: check.name })
    .eq('id', businessId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}


export async function fetchPortfolio(businessId) {
  if (!supabase || !businessId) return []
  const { data, error } = await supabase
    .from('business_portfolio')
    .select('id, image_url, sort_order, created_at')
    .eq('business_id', businessId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(24)
  if (error) {
    console.warn('portfolio:', error.message)
    return []
  }
  return data ?? []
}

export async function addPortfolioImage({ businessId, imageUrl }) {
  if (!supabase || !businessId || !imageUrl) {
    return { ok: false, error: 'Нет данных' }
  }
  const { data, error } = await supabase
    .from('business_portfolio')
    .insert({ business_id: businessId, image_url: imageUrl, sort_order: 0 })
    .select('id, image_url')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, row: data }
}

export async function removePortfolioImage(id) {
  if (!supabase || !id) return { ok: false, error: 'Нет id' }
  const { error } = await supabase.from('business_portfolio').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
