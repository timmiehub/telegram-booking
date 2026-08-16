/**
 * Путь к статике с учётом base (GitHub Pages: /telegram-booking/).
 * Абсолютные http(s)/data/blob и уже-prefixed пути не трогаем.
 */
export function assetUrl(path) {
  if (!path) return ''
  const raw = String(path).trim()
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw

  const base = import.meta.env.BASE_URL || '/'
  const prefix = base.endsWith('/') ? base : `${base}/`

  if (raw.startsWith(prefix)) return raw
  if (base !== '/' && raw.startsWith(base)) return raw

  const clean = raw.replace(/^\/+/, '')
  return `${prefix}${clean}`
}
