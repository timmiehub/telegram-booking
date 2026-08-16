import { supabase } from './supabase'
import { DEFAULT_THEME } from './theme'
import { createEmptySchedule, fillNextDays } from './availability'
import { paletteForType } from './palettes'
import { parseInviteStartParam } from './inviteLinks'
import { isReservedGrowthStartParam } from './growthAttribution'
import { expandSearchQuery, normalizeSearchTags } from './searchExpand'
import { isProPlan } from './pro'

/**
 * Slug бизнеса:
 * ?business=demo | ?master=demo (alias) | start_param
 * Игнор: invite_XXX / join_XXX / growth (master|vk|ig|chat|story|ref_*)
 */
export function resolveBusinessSlug() {
  const search = window.location.search || ''
  const params = new URLSearchParams(search)

  const fromBusiness = params.get('business')
  if (fromBusiness) return fromBusiness.trim()

  const fromMaster = params.get('master')
  if (fromMaster) return fromMaster.trim()

  const encoded = search.match(/[?&](?:business|master)(%3D|=)([^&]*)/i)
  if (encoded?.[2]) {
    try {
      return decodeURIComponent(encoded[2]).trim() || null
    } catch {
      return encoded[2].trim() || null
    }
  }

  try {
    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param
    if (startParam) {
      const raw = String(startParam).trim()
      if (/^(invite_|join_)/i.test(raw) || isReservedGrowthStartParam(raw)) {
        return null
      }
      const { slug } = parseInviteStartParam(raw)
      return slug || null
    }
  } catch {
    // ignore
  }

  return null
}

/** Код инвайта в команду из query / start_param */
export function resolveTeamInviteCode() {
  const params = new URLSearchParams(window.location.search || '')
  const fromQuery = params.get('invite')
  if (fromQuery) return String(fromQuery).trim().toUpperCase()

  try {
    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param
    if (!startParam) return ''
    const raw = String(startParam).trim()
    const m = raw.match(/^(?:invite_|join_)([A-Za-z0-9]+)$/i)
    if (m) return m[1].toUpperCase()
  } catch {
    // ignore
  }
  return ''
}

export async function fetchBusinessBundle(slug) {
  if (!slug || !supabase) {
    return {
      business: null,
      members: [],
      theme: DEFAULT_THEME,
      source: slug ? 'fallback-no-supabase' : 'fallback-no-slug',
    }
  }

  // Сначала businesses
  let { data: business, error } = await supabase
    .from('businesses')
    .select(
      'id, slug, name, type, owner_profile_id, avatar_url, cover_url, city, address, created_at, search_tags',
    )
    .eq('slug', slug)
    .maybeSingle()

  if (error && /search_tags/i.test(String(error.message || ''))) {
    ;({ data: business, error } = await supabase
      .from('businesses')
      .select(
        'id, slug, name, type, owner_profile_id, avatar_url, cover_url, city, address, created_at',
      )
      .eq('slug', slug)
      .maybeSingle())
    if (business) business = { ...business, search_tags: [] }
  }

  if (error && /address/i.test(String(error.message || ''))) {
    ;({ data: business, error } = await supabase
      .from('businesses')
      .select(
        'id, slug, name, type, owner_profile_id, avatar_url, cover_url, city, created_at',
      )
      .eq('slug', slug)
      .maybeSingle())
    if (business) business = { ...business, address: null }
  }

  // Миграция city ещё не применена — повтор без поля
  if (error && /city/i.test(String(error.message || ''))) {
    ;({ data: business, error } = await supabase
      .from('businesses')
      .select('id, slug, name, type, owner_profile_id, avatar_url, cover_url, created_at')
      .eq('slug', slug)
      .maybeSingle())
    if (business) business = { ...business, city: null }
  }

  if (error && /created_at/i.test(String(error.message || ''))) {
    ;({ data: business, error } = await supabase
      .from('businesses')
      .select('id, slug, name, type, owner_profile_id, avatar_url, cover_url, city')
      .eq('slug', slug)
      .maybeSingle())
  }

  // Fallback: старый master-профиль (миграция ещё не применена)
  if (error || !business) {
    if (error && !String(error.message || '').includes('businesses')) {
      console.warn('businesses query:', error.message)
    }
    const legacy = await fetchLegacyMasterAsBusiness(slug)
    return legacy
  }

  const { data: members } = await supabase
    .from('business_members')
    .select(
      'id, role, title, is_active, profile_id, profiles(id, full_name, avatar_url, telegram_id)',
    )
    .eq('business_id', business.id)
    .eq('is_active', true)

  const { data: themeRow } = await supabase
    .from('themes')
    .select(
      'primary_color, secondary_color, accent_color, background_color, surface_color, text_color, button_text_color, button_style, border_radius_px, font_family, logo_url, cover_url',
    )
    .eq('business_id', business.id)
    .maybeSingle()

  // fallback theme by owner master_id
  let theme = themeRow
  if (!theme && business.owner_profile_id) {
    const { data: legacyTheme } = await supabase
      .from('themes')
      .select(
        'primary_color, secondary_color, accent_color, background_color, surface_color, text_color, button_text_color, button_style, border_radius_px, font_family, logo_url, cover_url',
      )
      .eq('master_id', business.owner_profile_id)
      .maybeSingle()
    theme = legacyTheme
  }

  return {
    business,
    members: members ?? [],
    theme: {
      ...DEFAULT_THEME,
      ...(theme ?? {}),
      business_name: business.name,
      logo_url:
        theme?.logo_url || business.avatar_url || DEFAULT_THEME.logo_url,
      cover_url:
        theme?.cover_url || business.cover_url || DEFAULT_THEME.cover_url,
    },
    source: 'business',
  }
}

async function fetchLegacyMasterAsBusiness(slug) {
  const { data: master, error } = await supabase
    .from('profiles')
    .select('id, slug, business_name, avatar_url, full_name')
    .eq('slug', slug)
    .eq('role', 'master')
    .maybeSingle()

  if (error || !master) {
    return {
      business: null,
      members: [],
      theme: DEFAULT_THEME,
      source: 'not-found',
    }
  }

  const { data: themeRow } = await supabase
    .from('themes')
    .select(
      'primary_color, secondary_color, accent_color, background_color, surface_color, text_color, button_text_color, button_style, border_radius_px, font_family, logo_url, cover_url',
    )
    .eq('master_id', master.id)
    .maybeSingle()

  return {
    business: {
      id: null,
      slug: master.slug,
      name: master.business_name || master.full_name || master.slug,
      type: 'barbershop',
      owner_profile_id: master.id,
      avatar_url: master.avatar_url,
      legacy_master_id: master.id,
    },
    members: [
      {
        id: 'legacy',
        role: 'owner',
        title: 'Мастер',
        is_active: true,
        profile_id: master.id,
        profiles: {
          id: master.id,
          full_name: master.full_name,
          avatar_url: master.avatar_url,
        },
      },
    ],
    theme: {
      ...DEFAULT_THEME,
      ...(themeRow ?? {}),
      business_name: master.business_name || master.full_name || DEFAULT_THEME.business_name,
      logo_url: themeRow?.logo_url ?? master.avatar_url ?? null,
    },
    source: 'legacy-master',
  }
}

export function slugifyName(name) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  }
  return String(name || '')
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || `biz-${Date.now().toString(36)}`
}

export async function createBusiness({
  name,
  type = 'other',
  slug,
  ownerProfileId,
  serviceTitles,
  services,
  city = '',
  workHours = null,
  settingsPatch = null,
}) {
  if (!supabase || !ownerProfileId || !name) {
    return { ok: false, error: 'Не хватает данных' }
  }
  const cleanSlug = slugifyName(slug || name)

  const row = {
    name: name.trim(),
    type,
    slug: cleanSlug,
    owner_profile_id: ownerProfileId,
  }
  if (city) row.city = String(city).trim()
  if (settingsPatch && typeof settingsPatch === 'object' && Object.keys(settingsPatch).length) {
    row.settings = settingsPatch
  }

  let { data: business, error } = await supabase
    .from('businesses')
    .insert(row)
    .select('id, slug, name, type, city')
    .single()

  if (error && /city/i.test(String(error.message || '')) && row.city) {
    delete row.city
    ;({ data: business, error } = await supabase
      .from('businesses')
      .insert(row)
      .select('id, slug, name, type')
      .single())
    if (business) business = { ...business, city: null }
  }

  if (
    error &&
    row.settings &&
    /settings/i.test(String(error.message || ''))
  ) {
    delete row.settings
    ;({ data: business, error } = await supabase
      .from('businesses')
      .insert(row)
      .select('id, slug, name, type, city')
      .single())
  }

  if (error) return { ok: false, error: error.message }

  if (
    settingsPatch &&
    typeof settingsPatch === 'object' &&
    Object.keys(settingsPatch).length &&
    business?.id
  ) {
    await supabase
      .from('businesses')
      .update({ settings: settingsPatch })
      .eq('id', business.id)
  }

  const memberRow = {
    business_id: business.id,
    profile_id: ownerProfileId,
    role: 'owner',
    title: 'Владелец',
    is_active: true,
    work_hours: workHours || fillNextDays(createEmptySchedule(), 14),
  }
  let { error: memberError } = await supabase
    .from('business_members')
    .insert(memberRow)

  if (memberError && /work_hours/i.test(String(memberError.message || ''))) {
    delete memberRow.work_hours
    ;({ error: memberError } = await supabase
      .from('business_members')
      .insert(memberRow))
  }
  if (memberError) return { ok: false, error: memberError.message }

  const palette = paletteForType(type)
  await supabase.from('themes').insert({
    business_id: business.id,
    master_id: ownerProfileId,
    primary_color: palette.primary_color,
    accent_color: palette.accent_color,
    secondary_color: palette.secondary_color,
    background_color: palette.background_color,
    surface_color: palette.surface_color,
    text_color: palette.text_color,
    button_text_color: palette.button_text_color,
  })

  let serviceRows = []
  if (Array.isArray(services) && services.length) {
    serviceRows = services.slice(0, 20).map((s, index) => ({
      business_id: business.id,
      master_id: ownerProfileId,
      title: String(s.title || '').trim() || 'Услуга',
      duration_min: Number(s.duration_min) > 0 ? Number(s.duration_min) : 30,
      price_cents: Math.max(0, Number(s.price_cents) || 0),
      currency: 'RUB',
      is_active: true,
      sort_order: index,
    }))
  } else {
    const titles =
      Array.isArray(serviceTitles) && serviceTitles.length
        ? serviceTitles.slice(0, 8)
        : ['Консультация']
    serviceRows = titles.map((title, index) => ({
      business_id: business.id,
      master_id: ownerProfileId,
      title,
      duration_min: 30,
      price_cents: 0,
      currency: 'RUB',
      is_active: true,
      sort_order: index,
    }))
  }

  await supabase.from('services').insert(serviceRows)

  await supabase
    .from('profiles')
    .update({
      role: 'master',
      slug: cleanSlug,
      business_name: name.trim(),
    })
    .eq('id', ownerProfileId)

  return { ok: true, business }
}

export async function updateBusinessCity(businessId, city) {
  if (!supabase || !businessId) return { ok: false, error: 'Нет id' }
  const { error } = await supabase
    .from('businesses')
    .update({ city: String(city || '').trim() || null })
    .eq('id', businessId)
  if (error) {
    if (/city/i.test(String(error.message || ''))) {
      return {
        ok: false,
        error: 'В базе ещё нет поля city — выполните migration_city.sql',
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function updateBusinessSearchTags(businessId, tags) {
  if (!supabase || !businessId) {
    return { ok: false, error: 'Нет данных' }
  }
  const next = normalizeSearchTags(tags)
  const { error } = await supabase
    .from('businesses')
    .update({ search_tags: next })
    .eq('id', businessId)
  if (error) {
    if (/search_tags/i.test(String(error.message || ''))) {
      return {
        ok: false,
        error: 'Нужна миграция search_tags в базе',
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, tags: next }
}

export async function updateBusinessAddress(businessId, address) {
  if (!supabase || !businessId) return { ok: false, error: 'Нет id' }
  const trimmed = String(address || '').trim().slice(0, 200) || null
  const { error } = await supabase
    .from('businesses')
    .update({ address: trimmed })
    .eq('id', businessId)
  if (error) {
    if (/address/i.test(String(error.message || ''))) {
      return {
        ok: false,
        error: 'В базе ещё нет поля address — выполните migration_business_address.sql',
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/**
 * Поиск заведений в городе по названию / типу / тегам / услуге.
 */
export async function searchBusinessesInCity({
  city,
  query = '',
  limit = 30,
}) {
  if (!supabase || !city) return []

  const q = String(query || '')
    .trim()
    .replace(/[%_,.()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 60)

  if (q.length < 2) return []

  const cityNorm = String(city).trim()
  const { terms, types } = expandSearchQuery(q)

  const orParts = []
  for (const t of terms.slice(0, 8)) {
    if (t.length < 2) continue
    orParts.push(`name.ilike.%${t}%`)
  }
  for (const et of types) {
    orParts.push(`type.eq.${et}`)
  }

  const map = new Map()
  const bizSelect =
    'id, slug, name, type, avatar_url, city, search_tags, settings, created_at'

  function mergeBizRows(rows) {
    for (const b of rows ?? []) {
      if (!b?.id) continue
      if (!map.has(b.id)) {
        map.set(b.id, {
          ...b,
          search_tags: b.search_tags || [],
          matched_services: [],
          isPro: isProPlan(b.settings),
        })
      } else {
        const row = map.get(b.id)
        if (b.settings && !row.settings) {
          row.settings = b.settings
          row.isPro = isProPlan(b.settings)
        }
      }
    }
  }

  function mergeServiceHits(services) {
    for (const s of services ?? []) {
      const b = s.businesses
      if (!b?.id) continue
      if (!map.has(b.id)) {
        map.set(b.id, {
          id: b.id,
          slug: b.slug,
          name: b.name,
          type: b.type,
          avatar_url: b.avatar_url,
          city: b.city,
          search_tags: b.search_tags || [],
          settings: b.settings || null,
          created_at: b.created_at || null,
          isPro: isProPlan(b.settings),
          matched_services: [],
        })
      }
      const row = map.get(b.id)
      if (row.matched_services.length < 3) {
        row.matched_services.push({
          title: s.title,
          price_cents: s.price_cents,
          duration_min: s.duration_min,
        })
      }
    }
  }

  const tagTerms = terms
    .slice(0, 10)
    .map((t) => t.toLowerCase().replace(/ё/g, 'е').trim())
    .filter((t) => t.length >= 2)

  const titleOr = terms
    .slice(0, 8)
    .map((t) => `title.ilike.%${t}%`)
    .join(',')

  const tasks = []

  if (orParts.length) {
    tasks.push(
      (async () => {
        const { data: byName, error } = await supabase
          .from('businesses')
          .select(bizSelect)
          .ilike('city', `%${cityNorm}%`)
          .or(orParts.join(','))
          .order('name')
          .limit(limit)

        if (error && /search_tags/i.test(String(error.message || ''))) {
          const { data: byName2 } = await supabase
            .from('businesses')
            .select('id, slug, name, type, avatar_url, city, settings, created_at')
            .ilike('city', `%${cityNorm}%`)
            .or(orParts.join(','))
            .order('name')
            .limit(limit)
          return { kind: 'biz', rows: (byName2 || []).map((b) => ({ ...b, search_tags: [] })) }
        }
        if (error) {
          console.warn('search businesses:', error.message)
          return { kind: 'biz', rows: [] }
        }
        return { kind: 'biz', rows: byName || [] }
      })(),
    )
  }

  if (tagTerms.length) {
    tasks.push(
      (async () => {
        const { data: byTags, error: tagErr } = await supabase
          .from('businesses')
          .select(bizSelect)
          .overlaps('search_tags', tagTerms)
          .ilike('city', `%${cityNorm}%`)
          .limit(limit)
        if (tagErr) {
          if (!/search_tags/i.test(String(tagErr.message || ''))) {
            console.warn('search tags:', tagErr.message)
          }
          return { kind: 'biz', rows: [] }
        }
        return { kind: 'biz', rows: byTags || [] }
      })(),
    )
  }

  if (titleOr) {
    tasks.push(
      (async () => {
        const { data: services, error: sErr } = await supabase
          .from('services')
          .select(
            'id, title, price_cents, duration_min, business_id, businesses!inner(id, slug, name, type, avatar_url, city, search_tags, settings, created_at)',
          )
          .eq('is_active', true)
          .or(titleOr)
          .ilike('businesses.city', `%${cityNorm}%`)
          .limit(40)
        if (sErr) {
          console.warn('search services:', sErr.message)
          return { kind: 'svc', rows: [] }
        }
        return { kind: 'svc', rows: services || [] }
      })(),
    )
  }

  const results = tasks.length ? await Promise.all(tasks) : []
  for (const r of results) {
    if (r.kind === 'biz') mergeBizRows(r.rows)
    else if (r.kind === 'svc') mergeServiceHits(r.rows)
  }

  return [...map.values()].sort((a, b) => {
    if (Boolean(a.isPro) !== Boolean(b.isPro)) return a.isPro ? -1 : 1
    const an = String(a.name || '').localeCompare(String(b.name || ''), 'ru')
    return an
  })
}

/** Витрина Pro в городе (до limit активных Pro). */
export async function fetchProShowcaseInCity({ city, limit = 6 } = {}) {
  if (!supabase || !city) return []
  const cityNorm = String(city).trim()
  if (!cityNorm) return []

  const { data, error } = await supabase
    .from('businesses')
    .select('id, slug, name, type, avatar_url, city, settings, created_at')
    .ilike('city', `%${cityNorm}%`)
    .order('created_at', { ascending: false })
    .limit(40)

  if (error) {
    console.warn('pro showcase:', error.message)
    return []
  }

  return (data || [])
    .filter((b) => isProPlan(b.settings))
    .slice(0, limit)
    .map((b) => ({ ...b, isPro: true }))
}

/** Быстрая смена accent/primary в themes (business_id + fallback master_id). */
export async function updateBusinessThemeColors(
  businessId,
  { primary_color, accent_color, masterId = null },
) {
  if (!businessId || !supabase) {
    return { ok: false, error: 'Нет данных' }
  }
  const patch = {}
  if (primary_color) patch.primary_color = primary_color
  if (accent_color) patch.accent_color = accent_color
  if (!Object.keys(patch).length) return { ok: true }

  let ownerId = masterId
  if (!ownerId) {
    const { data: biz } = await supabase
      .from('businesses')
      .select('owner_profile_id')
      .eq('id', businessId)
      .maybeSingle()
    ownerId = biz?.owner_profile_id || null
  }

  const { data: byBiz, error: bizErr } = await supabase
    .from('themes')
    .update(patch)
    .eq('business_id', businessId)
    .select('id')

  if (bizErr) return { ok: false, error: bizErr.message }

  let touched = (byBiz || []).length
  if (!touched && ownerId) {
    const { data: byMaster, error: masterErr } = await supabase
      .from('themes')
      .update(patch)
      .eq('master_id', ownerId)
      .select('id')
    if (masterErr) return { ok: false, error: masterErr.message }
    touched = (byMaster || []).length
  }

  if (!touched) {
    const insertRow = {
      business_id: businessId,
      master_id: ownerId,
      ...patch,
    }
    const { error: insErr } = await supabase.from('themes').insert(insertRow)
    if (insErr) return { ok: false, error: insErr.message }
  } else if (ownerId) {
    // Держим legacy-строку в синхроне (как media.js)
    await supabase.from('themes').update(patch).eq('master_id', ownerId)
  }

  return { ok: true }
}

