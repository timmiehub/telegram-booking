/**
 * Короткие «дорогие» тексты для пушей и напоминаний.
 * Время всегда в Europe/Moscow — VPS часто в UTC.
 */
import { formatDateRu, formatTimeRu, formatWhenRu } from './timeFormat.js'

export function formatWhen(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = formatDateRu(d, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const time = formatTimeRu(d)
  return `${day} · ${time}`
}

export function formatTimeOnly(iso) {
  return formatTimeRu(iso)
}

function lineClient(tag) {
  return tag ? `\nКлиент: ${tag}` : ''
}

export function copyNewBooking({ title, startsAt, clientTag }) {
  return `Новая запись\n${title || 'Услуга'}\n${formatWhen(startsAt)}${lineClient(clientTag)}`
}

export function copyClientReminder24h({ title, startsAt }) {
  const time = formatTimeOnly(startsAt)
  return `Завтра в ${time} — ${title || 'визит'}.\nЕсли планы изменились, напишите мастеру.`
}

export function copyClientReminder2h({ title, startsAt }) {
  const time = formatTimeOnly(startsAt)
  return `Через пару часов, в ${time} — ${title || 'визит'}.\nЖдём вас.`
}

export function copyClientAfterVisit({ title }) {
  return `Спасибо, что были на «${title || 'визит'}».\nБудем рады видеть снова — запись в этом же чате.`
}

export function copyMasterHourBefore({ title, startsAt, clientTag }) {
  const time = formatTimeOnly(startsAt)
  return `Через час, ${time}\n${title || 'Визит'}${lineClient(clientTag)}`
}

/** Только мастеру, всегда с тегом клиента если есть */
export function copyCancelledByClient({ title, startsAt, clientTag }) {
  return `Клиент отменил\n${title || 'Услуга'}\n${formatWhen(startsAt)}${lineClient(clientTag)}`
}

/** Только клиенту */
export function copyCancelledByMaster({ title, startsAt }) {
  return `Мастер отменил запись\n${title || 'Услуга'}\n${formatWhen(startsAt)}`
}

export function copyConfirmedByMaster({ title, startsAt }) {
  return `Мастер подтвердил запись ✅\n${title || 'Услуга'}\n${formatWhen(startsAt)}\nЖдём вас.`
}

export function copyRescheduledClient({ title, startsAt }) {
  return `Запись перенесена\n${title || 'Услуга'}\nНа ${formatWhen(startsAt)}\nЖдём вас.`
}

export function copyRescheduledMaster({ title, startsAt, clientTag }) {
  return `Клиент перенёс запись\n${title || 'Услуга'}\nНа ${formatWhen(startsAt)}${lineClient(clientTag)}`
}

export { formatWhenRu }
