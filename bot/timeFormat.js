/** Единый часовой пояс продукта (слоты и пуши). */
export const APP_TZ = 'Europe/Moscow'

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function formatWhenRu(iso, opts = {}) {
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ru-RU', {
    timeZone: APP_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  })
}

export function formatTimeRu(iso) {
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('ru-RU', {
    timeZone: APP_TZ,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateRu(iso, opts = {}) {
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ru-RU', {
    timeZone: APP_TZ,
    ...opts,
  })
}

/** Календарные части даты в APP_TZ (month 0–11, weekday вс=0). */
export function partsInAppTz(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  })
  const map = {}
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  return {
    year: Number(map.year),
    month: Number(map.month) - 1,
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WD[map.weekday] ?? 0,
  }
}

/**
 * Локальное время в APP_TZ → UTC Date.
 * monthIndex: 0–11
 */
export function appZonedDateTime(year, monthIndex, day, hour = 0, minute = 0, second = 0) {
  let ts = Date.UTC(year, monthIndex, day, hour, minute, second)
  for (let i = 0; i < 3; i++) {
    const p = partsInAppTz(new Date(ts))
    const asUtc = Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second)
    const desired = Date.UTC(year, monthIndex, day, hour, minute, second)
    ts += desired - asUtc
  }
  return new Date(ts)
}

export function startOfDayApp(date = new Date()) {
  const p = partsInAppTz(date)
  return appZonedDateTime(p.year, p.month, p.day, 0, 0, 0)
}

export function endOfDayApp(date = new Date()) {
  const p = partsInAppTz(date)
  return appZonedDateTime(p.year, p.month, p.day, 23, 59, 59)
}

export function addDaysApp(date, days) {
  const p = partsInAppTz(date)
  return appZonedDateTime(p.year, p.month, p.day + days, 0, 0, 0)
}

export function weekdayApp(date = new Date()) {
  return partsInAppTz(date).weekday
}
