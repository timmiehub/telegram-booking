/**
 * Мастера / заведения: история визитов, поиск по названию и по услуге.
 * Сортировка: Pro сверху, затем популярность.
 */
import { getBotSupabase } from './supabaseBot.js'
import { isBusinessPro } from './proPlan.js'
import { cityStem } from './citiesRu.js'
import {
  expandQuery,
  matchedTypesForPadding,
  hasKnownServiceTerm,
  extractServiceKeywords,
  extractCityFromText,
  parseClientSearchIntent,
  placeMatchesKeywords,
} from './searchKeywords.js'

export {
  hasKnownServiceTerm,
  extractServiceKeywords,
  extractCityFromText,
  parseClientSearchIntent,
  expandQuery,
}

async function popularityMap(supabase, businessIds) {
  const map = new Map()
  const ids = [...new Set((businessIds || []).filter(Boolean))]
  if (!supabase || !ids.length) return map

  const since = new Date()
  since.setDate(since.getDate() - 90)

  const { data, error } = await supabase
    .from('bookings')
    .select('business_id')
    .in('business_id', ids)
    .eq('status', 'completed')
    .gte('starts_at', since.toISOString())
    .limit(2000)

  if (error) {
    console.warn('popularity:', error.message)
    return map
  }
  for (const row of data || []) {
    const id = row.business_id
    if (!id) continue
    map.set(id, (map.get(id) || 0) + 1)
  }
  return map
}

function withRank(places, popMap) {
  return (places || [])
    .map((p) => ({
      ...p,
      isPro: Boolean(p.isPro),
      popularity: popMap.get(p.business_id) || 0,
    }))
    .sort((a, b) => {
      if (a.isPro !== b.isPro) return a.isPro ? -1 : 1
      return (b.popularity || 0) - (a.popularity || 0)
    })
}

function mapBusinessRow(b, extra = {}) {
  return {
    business_id: b.id,
    master_id: extra.master_id || null,
    slug: b.slug,
    name: b.name || 'Заведение',
    type: b.type || null,
    avatar_url: b.avatar_url || null,
    city: b.city || null,
    search_tags: b.search_tags || [],
    last_visit_at: null,
    serviceTitle: extra.serviceTitle || null,
    serviceId: extra.serviceId || null,
    isPro: isBusinessPro(b.settings),
    source: extra.source || 'search',
  }
}

/** История визитов клиента → уникальные заведения */
export async function fetchClientMasters(telegramId, { query = '', limit = 8 } = {}) {
  const supabase = getBotSupabase()
  if (!supabase || !telegramId) return []

  const { data, error } = await supabase
    .from('bookings')
    .select(
      'master_id, business_id, starts_at, businesses(id, slug, name, type, avatar_url, city, settings, search_tags)',
    )
    .eq('client_telegram_id', telegramId)
    .not('master_id', 'is', null)
    .order('starts_at', { ascending: false })
    .limit(100)

  if (error) {
    console.warn('client masters:', error.message)
    return []
  }

  const seen = new Map()
  for (const row of data ?? []) {
    const biz = row.businesses
    const key = biz?.id || row.business_id || row.master_id
    if (!key || seen.has(String(key))) continue
    const place = {
      business_id: biz?.id || row.business_id || null,
      master_id: row.master_id,
      slug: biz?.slug || null,
      name: biz?.name || 'Мастер',
      type: biz?.type || null,
      avatar_url: biz?.avatar_url || null,
      city: biz?.city || null,
      search_tags: biz?.search_tags || [],
      last_visit_at: row.starts_at,
      serviceTitle: null,
      isPro: isBusinessPro(biz?.settings),
      source: 'history',
    }
    if (!place.slug) continue
    if (query && !placeMatchesKeywords(place, query)) continue
    seen.set(String(key), place)
  }

  const list = [...seen.values()]
  const pop = await popularityMap(
    supabase,
    list.map((p) => p.business_id),
  )
  return withRank(list, pop).slice(0, limit)
}

/**
 * Публичный поиск заведений по названию/типу.
 * city — жёсткий фильтр; при пустоте caller может повторить без city.
 */
export async function searchPlaces({ query = '', city = null, limit = 5 } = {}) {
  const supabase = getBotSupabase()
  if (!supabase) return []

  const q = String(query || '')
    .trim()
    .replace(/[%_,.()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 60)
  if (q.length < 2) return []

  const terms = expandQuery(q)
  const enumTypes = matchedTypesForPadding(q)

  const orParts = []
  for (const t of terms.slice(0, 10)) {
    if (t.length < 2) continue
    orParts.push(`name.ilike.%${t}%`)
  }
  for (const et of enumTypes) {
    orParts.push(`type.eq.${et}`)
  }

  const tagTerms = terms
    .slice(0, 12)
    .map((t) =>
      String(t)
        .toLowerCase()
        .replace(/ё/g, 'е')
        .trim(),
    )
    .filter((t) => t.length >= 2)

  if (!orParts.length && !tagTerms.length) return []

  let places = []

  if (orParts.length) {
    let bizQuery = supabase
      .from('businesses')
      .select('id, slug, name, type, avatar_url, city, settings, search_tags')
      .or(orParts.join(','))
      .order('name')
      .limit(Math.max(limit * 4, 16))

    const stem = cityStem(city)
    if (stem) bizQuery = bizQuery.ilike('city', `%${stem}%`)

    const { data, error } = await bizQuery
    if (error) {
      console.warn('search places:', error.message)
    } else {
      places = data || []
    }
  }

  if (tagTerms.length) {
    let tagQuery = supabase
      .from('businesses')
      .select('id, slug, name, type, avatar_url, city, settings, search_tags')
      .overlaps('search_tags', tagTerms)
      .limit(Math.max(limit * 4, 16))
    const stem = cityStem(city)
    if (stem) tagQuery = tagQuery.ilike('city', `%${stem}%`)
    const { data: byTags, error: tagErr } = await tagQuery
    if (tagErr) {
      if (!/search_tags/i.test(String(tagErr.message || ''))) {
        console.warn('search places tags:', tagErr.message)
      }
    } else {
      const seen = new Set(places.map((p) => p.id))
      for (const b of byTags || []) {
        if (seen.has(b.id)) continue
        places.push(b)
        seen.add(b.id)
      }
    }
  }

  let ranked = places
    .filter((b) => b.slug)
    .map((b) => mapBusinessRow(b, { source: 'search' }))
    .filter((p) => placeMatchesKeywords(p, q))

  const pop = await popularityMap(
    supabase,
    ranked.map((p) => p.business_id),
  )
  return withRank(ranked, pop).slice(0, limit)
}

/**
 * Поиск по названию услуги + (опционально) по типу, если matchByType.
 * Город фильтруется строго; без добивки чужих салонов.
 */
export async function searchByService({ query = '', city = null, limit = 6 } = {}) {
  const supabase = getBotSupabase()
  if (!supabase) return []

  const q = String(query || '')
    .trim()
    .replace(/[%_,.()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 60)
  if (q.length < 2) return []

  const terms = expandQuery(q)
  const titleOr = terms
    .slice(0, 12)
    .filter((t) => t.length >= 2)
    .map((t) => `title.ilike.%${t}%`)
    .join(',')

  const seen = new Map()

  if (titleOr) {
    let svcQuery = supabase
      .from('services')
      .select(
        'id, title, master_id, business_id, is_active, businesses(id, slug, name, type, avatar_url, city, settings, search_tags)',
      )
      .eq('is_active', true)
      .or(titleOr)
      .limit(50)

    const { data: services, error } = await svcQuery
    if (error) {
      console.warn('search by service:', error.message)
    }

    const stem = cityStem(city)
    for (const row of services || []) {
      const biz = row.businesses
      const slug = biz?.slug
      if (!slug) continue
      if (stem) {
        const bizCity = String(biz?.city || '')
          .toLowerCase()
          .replace(/ё/g, 'е')
        if (!bizCity.includes(stem)) continue
      }
      const key = biz?.id || row.business_id || row.master_id
      if (!key || seen.has(String(key))) continue
      seen.set(
        String(key),
        mapBusinessRow(biz, {
          master_id: row.master_id,
          serviceTitle: row.title || null,
          serviceId: row.id || null,
          source: 'service',
        }),
      )
    }
  }

  // Добор по типу — только для групп с matchByType (барбершоп / репетитор)
  const enumTypes = matchedTypesForPadding(q)
  if (seen.size < limit && enumTypes.length) {
    let typeQuery = supabase
      .from('businesses')
      .select('id, slug, name, type, avatar_url, city, settings, search_tags')
      .in('type', enumTypes)
      .limit(30)

    const stem = cityStem(city)
    if (stem) typeQuery = typeQuery.ilike('city', `%${stem}%`)

    const { data: byType, error: typeErr } = await typeQuery
    if (typeErr) {
      console.warn('search by type:', typeErr.message)
    }
    for (const b of byType || []) {
      if (!b.slug || seen.has(String(b.id))) continue
      seen.set(String(b.id), mapBusinessRow(b, { source: 'type' }))
    }
  }

  // Добор по имени заведения (без чужих типов)
  if (seen.size < limit) {
    const byName = await searchPlaces({
      query: q,
      city,
      limit: limit,
    })
    for (const p of byName) {
      if (seen.has(String(p.business_id))) continue
      seen.set(String(p.business_id), p)
    }
  }

  const list = [...seen.values()]
  const pop = await popularityMap(
    supabase,
    list.map((p) => p.business_id),
  )
  return withRank(list, pop).slice(0, limit)
}

export async function guessClientCity(telegramId) {
  const masters = await fetchClientMasters(telegramId, { limit: 1 })
  return masters[0]?.city || null
}

export async function isSlugAllowedForClient(telegramId, slug, { query = '' } = {}) {
  const s = String(slug || '').trim()
  if (!s) return false

  const fromHistory = await fetchClientMasters(telegramId, { query: '', limit: 20 })
  if (fromHistory.some((m) => m.slug === s)) return true

  const city = await guessClientCity(telegramId)
  const supabase = getBotSupabase()
  if (supabase) {
    const { data } = await supabase
      .from('businesses')
      .select('slug')
      .eq('slug', s)
      .maybeSingle()
    if (data?.slug === s) {
      if (!query) return true
      const found = await searchPlaces({ query, city, limit: 10 })
      if (found.some((m) => m.slug === s)) return true
      const found2 = await searchPlaces({ query, city: null, limit: 10 })
      if (found2.some((m) => m.slug === s)) return true
      const bySvc = await searchByService({ query, city: null, limit: 10 })
      if (bySvc.some((m) => m.slug === s)) return true
    }
  }

  return false
}

/**
 * Кнопка заведения: полное имя; Pro — пометка «Pro · …».
 * Длинные имена → 2 кнопки (см. placeButtonLabels).
 */
export const TG_BTN_MAX = 64

function splitNameForButtons(name, max = TG_BTN_MAX) {
  const raw = String(name || 'Мастер').trim()
  if (raw.length <= max) return [raw]

  let cut = -1
  const preferFrom = Math.max(8, max - 12)
  for (let i = Math.min(max, raw.length) - 1; i >= preferFrom; i -= 1) {
    if (raw[i] === ' ' || raw[i] === '-' || raw[i] === '—') {
      cut = i
      break
    }
  }
  if (cut < 0) cut = max

  let line1 = raw.slice(0, cut).trim()
  let line2 = raw.slice(cut).replace(/^[\s\-—]+/, '').trim()
  if (!line1) line1 = raw.slice(0, max)
  if (!line2) return [raw.slice(0, max - 1) + '…']

  if (line1.length > max) line1 = line1.slice(0, max - 1) + '…'
  if (line2.length > max) line2 = line2.slice(0, max - 1) + '…'
  return [line1, line2]
}

export function placeButtonLabels(place) {
  const name = String(place?.name || 'Мастер').trim()
  const proPrefix = place?.isPro ? 'Pro · ' : ''
  const full = `${proPrefix}${name}`
  return splitNameForButtons(full)
}

export function shortPlaceLabel(place) {
  return placeButtonLabels(place)[0]
}

export function popularityHint(place) {
  const bits = []
  if (place?.isPro) bits.push('Pro')
  const n = Number(place?.popularity) || 0
  if (n === 1) bits.push('популярно · 1 визит')
  else if (n > 1) bits.push(`популярно · ${n} визитов`)
  return bits.join(' · ')
}
