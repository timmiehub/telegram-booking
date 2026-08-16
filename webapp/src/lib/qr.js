/** Генерация PNG QR без внешних npm-зависимостей (через QR API + canvas fallback). */
export function bookingQrPngUrl(deepLink, size = 360) {
  const data = encodeURIComponent(deepLink)
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${data}`
}

export async function downloadBookingQr(deepLink, filename = 'zapis-qr.png') {
  const url = bookingQrPngUrl(deepLink, 512)
  const res = await fetch(url)
  if (!res.ok) throw new Error('Не удалось получить QR')
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

/** Публичная лендинг-страница на GitHub Pages */
export function buildPublicBookPageUrl(businessSlug) {
  const slug = String(businessSlug || '').trim() || 'demo'
  const origin =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname.replace(/\/?index\.html$/, '/')}`
      : 'https://timmiehub.github.io/telegram-booking/'
  const base = origin.endsWith('/') ? origin : `${origin}/`
  return `${base}book.html?b=${encodeURIComponent(slug)}`
}
