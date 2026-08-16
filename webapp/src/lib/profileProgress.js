/** Прогресс заполнения профиля мастера для шапки «Ещё». */

function isCustomAsset(url, demoNeedle) {
  const u = String(url || '')
  if (!u) return false
  return !new RegExp(demoNeedle, 'i').test(u)
}

/**
 * @returns {{ done: number, total: number, pct: number, label: string }}
 */
export function profileCompletion({
  theme = null,
  businessCity = '',
  businessAddress = '',
  services = [],
  portfolioCount = 0,
} = {}) {
  const checks = [
    isCustomAsset(theme?.logo_url, 'avatar-demo|demo\\.svg'),
    isCustomAsset(theme?.cover_url, 'cover-demo|demo\\.svg'),
    Boolean(String(businessCity || '').trim() || String(businessAddress || '').trim()),
    (services || []).some((s) => s && s.is_active !== false),
    Number(portfolioCount) > 0,
  ]
  const total = checks.length
  const done = checks.filter(Boolean).length
  const pct = Math.round((done / total) * 100)
  let label = `Профиль ${pct}%`
  if (pct >= 100) label = 'Профиль заполнен'
  else if (pct < 40) label = `Профиль ${pct}% — добавьте фото`
  return { done, total, pct, label }
}
