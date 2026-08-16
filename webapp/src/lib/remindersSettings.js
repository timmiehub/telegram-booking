/**
 * Тексты напоминаний: плейсхолдеры {time} {title} {place}
 */

export function fillReminderTemplate(template, { time = '', title = '', place = '' } = {}) {
  return String(template || '')
    .replaceAll('{time}', time)
    .replaceAll('{title}', title)
    .replaceAll('{place}', place)
    .trim()
}

export function defaultReminders() {
  return {
    client_24h: null,
    client_2h: null,
    after_visit: null,
    after_visit_on: false,
  }
}

export function normalizeReminders(raw) {
  const base = defaultReminders()
  if (!raw || typeof raw !== 'object') return base
  if (typeof raw.client_24h === 'string') base.client_24h = raw.client_24h.slice(0, 500) || null
  if (typeof raw.client_2h === 'string') base.client_2h = raw.client_2h.slice(0, 500) || null
  if (typeof raw.after_visit === 'string') base.after_visit = raw.after_visit.slice(0, 500) || null
  if (typeof raw.after_visit_on === 'boolean') base.after_visit_on = raw.after_visit_on
  return base
}
