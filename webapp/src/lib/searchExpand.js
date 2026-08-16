/**
 * Раскрытие запроса для поиска в Mini App (общий каталог с ботом).
 */
import {
  SYNONYM_GROUPS,
  TYPE_KEYWORDS,
  TYPE_LABELS,
  BUSINESS_CATEGORIES,
  filterCategories,
  categoryLabel,
  normalizeSearchTag,
  normalizeSearchTags,
  isValidBusinessType,
  MAX_SEARCH_TAGS,
} from '@shared/businessCatalog.js'

export {
  TYPE_LABELS,
  BUSINESS_CATEGORIES,
  filterCategories,
  categoryLabel,
  normalizeSearchTag,
  normalizeSearchTags,
  isValidBusinessType,
  MAX_SEARCH_TAGS,
  SYNONYM_GROUPS,
  TYPE_KEYWORDS,
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim()
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

export function expandSearchQuery(query) {
  const q = norm(query)
    .replace(/[%_,.()«»"']/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  if (!q) return { terms: [], types: [] }

  const terms = new Set([q])
  for (const w of q.split(/\s+/).filter((x) => x.length >= 2)) {
    terms.add(w)
  }

  for (const group of matchedGroups(q)) {
    for (const syn of group.terms) terms.add(syn)
    if (group.matchByType) {
      for (const t of group.businessTypes || []) {
        for (const kw of TYPE_KEYWORDS[t] || []) terms.add(kw)
      }
    }
  }

  const types = new Set()
  for (const group of matchedGroups(q)) {
    if (!group.matchByType) continue
    for (const t of group.businessTypes || []) types.add(t)
  }

  return {
    terms: [...terms].filter((t) => t.length >= 2).slice(0, 24),
    types: [...types],
  }
}
