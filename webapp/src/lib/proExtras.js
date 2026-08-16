/** Шаблоны ответов и адреса кабинета (Pro). */

export const MAX_REPLY_TEMPLATES = 8
export const MAX_LOCATIONS = 3

export function normalizeReplyTemplates(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, MAX_REPLY_TEMPLATES)
    .map((t, i) => ({
      id: String(t?.id || `t${i + 1}`).slice(0, 24),
      keys: Array.isArray(t?.keys)
        ? t.keys.map((k) => String(k || '').trim().toLowerCase()).filter(Boolean).slice(0, 8)
        : String(t?.keys || '')
            .split(',')
            .map((k) => k.trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 8),
      text: String(t?.text || '').trim().slice(0, 800),
    }))
    .filter((t) => t.keys.length && t.text)
}

export function matchReplyTemplate(templates, message) {
  const text = String(message || '').trim().toLowerCase()
  if (!text) return null
  for (const t of templates || []) {
    for (const key of t.keys || []) {
      if (key && text.includes(key)) return t
    }
  }
  return null
}

export function normalizeLocations(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, MAX_LOCATIONS)
    .map((loc, i) => ({
      id: String(loc?.id || `loc${i + 1}`).slice(0, 24),
      title: String(loc?.title || '').trim().slice(0, 60) || `Точка ${i + 1}`,
      address: String(loc?.address || '').trim().slice(0, 200),
      city: String(loc?.city || '').trim().slice(0, 80),
      primary: Boolean(loc?.primary),
    }))
    .filter((loc) => loc.address || loc.city)
}

export function primaryLocation(locations) {
  const list = normalizeLocations(locations)
  return list.find((l) => l.primary) || list[0] || null
}
