/**
 * Словарь поиска: услуги, типы, словоформы, города из фразы.
 * Категории и синонимы — shared/businessCatalog.js
 */

import { matchKnownCityInText, cityStem } from './citiesRu.js'
import {
  TYPE_KEYWORDS,
  SYNONYM_GROUPS,
  TYPE_LABELS,
  BUSINESS_CATEGORIES,
} from '../shared/businessCatalog.js'

export {
  TYPE_KEYWORDS,
  SYNONYM_GROUPS,
  TYPE_LABELS,
  BUSINESS_CATEGORIES,
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim()
}

export function expandQuery(query) {
  const q = norm(query)
    .replace(/[%_,.()«»"']/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  if (!q) return []

  const terms = new Set([q])
  for (const w of q.split(/\s+/).filter((x) => x.length >= 3)) {
    terms.add(w)
  }

  for (const group of SYNONYM_GROUPS) {
    const hit =
      group.terms.some((s) => q.includes(s) || (s.length >= 4 && s.includes(q))) ||
      (group.patterns || []).some((re) => re.test(q)) ||
      q.split(/\s+/).some((w) =>
        group.terms.some(
          (s) =>
            s.length >= 4 &&
            (w.startsWith(s) || s.startsWith(w) || w.includes(s)),
        ),
      )
    if (!hit) continue
    for (const syn of group.terms) terms.add(syn)
  }

  for (const group of matchedGroups(q)) {
    for (const t of group.businessTypes || []) {
      for (const kw of TYPE_KEYWORDS[t] || []) terms.add(kw)
    }
  }

  return [...terms].slice(0, 24)
}

function matchedGroups(query) {
  const q = norm(query)
  const out = []
  for (const group of SYNONYM_GROUPS) {
    const hit =
      group.terms.some((s) => q.includes(s) || (s.length >= 4 && s.includes(q))) ||
      (group.patterns || []).some((re) => re.test(q)) ||
      q.split(/[^а-яa-z0-9]+/i).some((w) => {
        if (!w || w.length < 3) return false
        return group.terms.some(
          (s) =>
            s.length >= 4 && (w.startsWith(s) || s.startsWith(w) || w.includes(s)),
        )
      })
    if (hit) out.push(group)
  }
  return out
}

export function matchedBusinessTypes(query) {
  const types = new Set()
  for (const group of matchedGroups(query)) {
    if (!group.matchByType) continue
    for (const t of group.businessTypes || []) types.add(t)
  }
  return [...types]
}

/** Типы для мягкого добора (только если matchByType). */
export function matchedTypesForPadding(query) {
  return matchedBusinessTypes(query)
}

export function hasKnownServiceTerm(text) {
  const raw = norm(text)
  if (!raw) return ''
  for (const group of SYNONYM_GROUPS) {
    if ((group.patterns || []).some((re) => re.test(raw))) return group.canon
    for (const syn of group.terms) {
      if (syn.length < 3) continue
      if (raw.includes(syn)) return group.canon
    }
    for (const word of raw.split(/[^а-яa-z0-9]+/i).filter(Boolean)) {
      for (const syn of group.terms) {
        if (syn.length < 4) continue
        if (word.startsWith(syn) || (word.length >= 4 && syn.startsWith(word))) {
          return group.canon
        }
      }
    }
  }
  return ''
}

export function extractServiceKeywords(text) {
  const raw = norm(text)
  if (!raw) return ''

  const known = hasKnownServiceTerm(raw)
  if (known) return known

  const m =
    raw.match(/(?:на|к)\s+([а-яa-z]{3,24})/i) ||
    raw.match(/^([а-яa-z]{3,24})$/i)
  if (m?.[1]) {
    const token = m[1].slice(0, 40)
    return hasKnownServiceTerm(token) || token
  }
  return ''
}

/** Город из фразы: «в городе Шахты», «в Иркутске», «г. Москва», «массаж Волгоград». */
export function extractCityFromText(text) {
  const raw = String(text || '').trim()
  if (!raw) return null

  const stop = new Set([
    'город',
    'городе',
    'салон',
    'салоне',
    'мастер',
    'мастеру',
    'барбер',
    'запись',
    'приложение',
    'чат',
    'бот',
    'поиск',
    'найти',
    'найди',
    'хочу',
    'сегодня',
    'завтра',
    'массажный',
    'массажная',
    'массажное',
  ])

  const mExplicit =
    raw.match(/(?:в|во)\s+городе\s+([А-Яа-яЁёA-Za-z\-]{2,40})/i) ||
    raw.match(/(?:в|во)\s+г\.?\s*([А-Яа-яЁёA-Za-z\-]{2,40})/i) ||
    raw.match(/город[еуа]?\s+([А-Яа-яЁёA-Za-z\-]{2,40})/i)

  let city = mExplicit?.[1]?.trim() || null

  if (!city) {
    const m2 = raw.match(/(?:^|[\s,])в\s+([А-Яа-яЁёA-Za-z\-]{4,40})(?:\s|$|,|\.|!|\?)/i)
    if (m2?.[1]) city = m2[1].trim()
  }

  if (!city) {
    city = matchKnownCityInText(raw)
  } else {
    const known = matchKnownCityInText(city) || matchKnownCityInText(`в ${city}`)
    if (known) city = known
  }

  if (!city) return null
  const n = String(city)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim()
  if (n.length < 2 || stop.has(n)) return null
  if (hasKnownServiceTerm(n)) return null
  return city.slice(0, 40)
}

/**
 * Разбор клиентской фразы поиска.
 * «найди массажный салон в городе шахты» → { query: 'массаж', city: 'шахты' }
 */
export function parseClientSearchIntent(text) {
  const raw = String(text || '').trim()
  const city = extractCityFromText(raw)
  let work = raw
  if (city) {
    const stem = cityStem(city) || city
    work = work
      .replace(new RegExp(`(?:в|во)\\s+городе\\s+${escapeReg(city)}`, 'i'), ' ')
      .replace(new RegExp(`(?:в|во)\\s+г\\.?\\s*${escapeReg(city)}`, 'i'), ' ')
      .replace(new RegExp(`\\bв\\s+${escapeReg(city)}\\b`, 'i'), ' ')
      .replace(new RegExp(`(?:^|\\s)${escapeReg(stem)}[а-яё]{0,4}(?=\\s|$|,|\\.|!)`, 'gi'), ' ')
  }
  work = work
    .replace(/\b(найди|найти|поиск|покажи|есть|ищу|нужен|нужна|нужно)\b/gi, ' ')
    .replace(/\b(салон|студия|мастерская|центр)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const query =
    extractServiceKeywords(work) ||
    extractServiceKeywords(raw) ||
    hasKnownServiceTerm(raw) ||
    ''

  return {
    query: String(query || '').slice(0, 40),
    city: city || null,
    raw,
  }
}

function escapeReg(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Невидимые ключевые слова для карточки заведения (тип + имя + теги). */
export function invisibleKeywordsForPlace(place) {
  const type = place?.type || 'other'
  const fromType = TYPE_KEYWORDS[type] || []
  const nameBits = norm(place?.name || '')
    .split(/\s+/)
    .filter((w) => w.length >= 3)
  const tags = (place?.search_tags || []).map(norm).filter((t) => t.length >= 2)
  return [...new Set([...fromType, ...nameBits, ...tags])]
}

export function placeMatchesKeywords(place, query) {
  if (!query) return true
  const terms = expandQuery(query)
  if (!terms.length) return true
  const hay = norm(
    [
      place.name,
      place.type,
      place.city,
      place.serviceTitle,
      ...(place.search_tags || []),
      ...(invisibleKeywordsForPlace(place) || []),
    ]
      .filter(Boolean)
      .join(' '),
  )
  return terms.some((t) => t.length >= 2 && hay.includes(norm(t)))
}
