/** Ссылка на Yandex Maps по адресу и городу */
export function buildYandexMapsUrl(address, city = '') {
  const parts = [String(address || '').trim(), String(city || '').trim()].filter(Boolean)
  if (!parts.length) return null
  const q = encodeURIComponent(parts.join(', '))
  return `https://yandex.ru/maps/?text=${q}`
}

export function openMapsLink(address, city = '') {
  const url = buildYandexMapsUrl(address, city)
  if (!url) return false
  try {
    const WebApp = window.Telegram?.WebApp
    if (WebApp?.openLink) {
      WebApp.openLink(url)
      return true
    }
    window.open(url, '_blank', 'noopener,noreferrer')
    return true
  } catch {
    return false
  }
}
