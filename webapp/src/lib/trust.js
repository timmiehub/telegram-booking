/** Trust-строка для карточки мастера / шапки записи. */

function pluralRecords(n) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} запись`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${n} записи`
  }
  return `${n} записей`
}

/**
 * @param {{ createdAt?: string|null, visitCount?: number|null }} opts
 * @returns {string} пустая строка, если нечего показать
 */
export function formatTrustLine({ createdAt = null, visitCount = null } = {}) {
  const n = Number(visitCount) || 0
  if (n >= 5) return pluralRecords(n)
  if (createdAt) {
    const d = new Date(createdAt)
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear()
      if (y >= 2020 && y <= 2100) return `на платформе с ${y}`
    }
  }
  if (n >= 1) return pluralRecords(n)
  return ''
}
