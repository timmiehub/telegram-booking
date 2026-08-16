/**
 * FSM записи клиента в чате: заведение → услуга → день → слоты → book:
 * Кнопки компактные; slug только из whitelist.
 */
import { Markup } from 'telegraf'
import {
  dayOffsetToQuery,
  findSlotsForMessage,
  formatSlotButton,
  hasExplicitDay,
  listServicesForSlug,
  resolveMaster,
} from './aiBook.js'
import { placeButtonLabels, popularityHint } from './clientMasters.js'
import { formatDateRu } from './timeFormat.js'

const TTL_MS = 15 * 60_000
const TG_BTN = 64

/** @type {Map<string, object>} */
const sessions = new Map()

function key(telegramId) {
  return String(telegramId)
}

export function getClientBookingSession(telegramId) {
  const s = sessions.get(key(telegramId))
  if (!s) return null
  if (Date.now() - (s.startedAt || 0) > TTL_MS) {
    sessions.delete(key(telegramId))
    return null
  }
  return s
}

export function setClientBookingSession(telegramId, patch) {
  const prev = getClientBookingSession(telegramId) || { startedAt: Date.now() }
  const next = { ...prev, ...patch, startedAt: prev.startedAt || Date.now() }
  sessions.set(key(telegramId), next)
  return next
}

export function clearClientBookingSession(telegramId) {
  sessions.delete(key(telegramId))
}

function formatServicePrice(service) {
  const cents = Number(service?.price_cents)
  if (!Number.isFinite(cents) || cents <= 0) return null
  const rub = Math.round(cents / 100)
  return `${rub.toLocaleString('ru-RU')} ₽`
}

/** Кнопка услуги: название · цена (не длительность). */
function formatServiceButton(service) {
  const title = String(service?.title || 'Услуга').trim()
  const price = formatServicePrice(service)
  if (!price) {
    return title.length <= TG_BTN ? title : `${title.slice(0, TG_BTN - 1)}…`
  }
  const label = `${title} · ${price}`
  if (label.length <= TG_BTN) return label
  const room = TG_BTN - price.length - 4 // «… · »
  return `${title.slice(0, Math.max(8, room))}… · ${price}`
}

export function formatDayButtonLabel(offset) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + Number(offset || 0))
  if (offset === 0) return 'Сегодня'
  if (offset === 1) return 'Завтра'
  return formatDateRu(d, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** Клавиатура выбора заведений: 1 в ряд (длинное имя — 2 кнопки подряд), до 4 мест + Отмена */
export function buildPlacePickerKeyboard(places, { withAppSearch = true, webAppUrl = null } = {}) {
  const rows = []
  for (const p of (places || []).slice(0, 4)) {
    const labels = placeButtonLabels(p)
    const cb = `pick:${p.slug}`
    for (const label of labels) {
      rows.push([Markup.button.callback(label, cb)])
    }
  }
  const footer = [Markup.button.callback('Отмена', 'pick:cancel')]
  if (withAppSearch && webAppUrl) {
    footer.push(Markup.button.webApp('В приложении', webAppUrl))
  }
  rows.push(footer)
  return Markup.inlineKeyboard(rows)
}

/** Услуги: 1 в ряд, индекс в сессии (callback короткий) */
export function buildServicePickerKeyboard(slug, services) {
  const list = (services || []).slice(0, 8)
  const rows = list.map((s, i) => [
    Markup.button.callback(formatServiceButton(s), `svc:${slug}:${i}`),
  ])
  rows.push([
    Markup.button.callback('← Назад', 'pick:back'),
    Markup.button.callback('Отмена', 'pick:cancel'),
  ])
  return Markup.inlineKeyboard(rows)
}

/** Дни: 2 в ряд, ближайшие 7 */
export function buildDayPickerKeyboard({ days = 7 } = {}) {
  const buttons = []
  for (let i = 0; i < days; i += 1) {
    buttons.push(Markup.button.callback(formatDayButtonLabel(i), `day:${i}`))
  }
  const rows = []
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2))
  }
  rows.push([
    Markup.button.callback('← Услуги', 'svc:back'),
    Markup.button.callback('Отмена', 'pick:cancel'),
  ])
  return Markup.inlineKeyboard(rows)
}

export function dayPickerText(businessName, serviceTitle) {
  const name = businessName || 'мастера'
  const svc = serviceTitle ? ` · ${serviceTitle}` : ''
  return `«${name}»${svc}. Выберите день:`
}

/** Слоты: 2 в ряд, max 6 */
export function buildSlotsKeyboard(slug, slots) {
  const list = (slots || []).slice(0, 6)
  const rows = []
  for (let i = 0; i < list.length; i += 2) {
    const a = list[i]
    const b = list[i + 1]
    const row = [
      Markup.button.callback(
        formatSlotButton(a.start),
        `book:${slug}:${a.start.toISOString()}`,
      ),
    ]
    if (b) {
      row.push(
        Markup.button.callback(
          formatSlotButton(b.start),
          `book:${slug}:${b.start.toISOString()}`,
        ),
      )
    }
    rows.push(row)
  }
  rows.push([
    Markup.button.callback('← День', 'day:back'),
    Markup.button.callback('Отмена', 'pick:cancel'),
  ])
  return Markup.inlineKeyboard(rows)
}

export async function loadSlotsForSlug(
  slug,
  timeQuery = '',
  { serviceId = null, dayOffset = null } = {},
) {
  const master = await resolveMaster(slug, { serviceId })
  if (!master?.masterId) {
    return { ok: false, error: 'Мастер не найден', slots: [], master: null }
  }
  const q =
    dayOffset != null
      ? dayOffsetToQuery(dayOffset)
      : timeQuery || ''
  return findSlotsForMessage(q, slug, { serviceId, dayOffset })
}

export async function loadServicesForSlug(slug) {
  return listServicesForSlug(slug)
}

export { hasExplicitDay, dayOffsetToQuery }

export function placesPickerText(places, query, { via = null, city = null } = {}) {
  if (!places?.length) {
    const q = String(query || '').trim()
    const cityBit = city ? ` в «${city}»` : ''
    if (!q) {
      return 'В истории визитов пока никого. Напишите услугу («ногти», «барбер», «массаж») или откройте приложение — подберу.'
    }
    if (via === 'service' || via === 'places' || via === 'none') {
      return `По «${q}»${cityBit} в каталоге пока пусто. Попробуйте другое слово — «ногти», «стрижка», «массаж» — или название салона.`
    }
    return `В ваших визитах «${q}» не нашёл. Откройте приложение или напишите другую услугу.`
  }
  const top = places[0]
  const pop = popularityHint(top)
  const list = places
    .map((p, i) => {
      const pro = p.isPro ? 'Pro · ' : ''
      const svc = p.serviceTitle ? ` · ${p.serviceTitle}` : ''
      const cityBit = p.city ? ` · ${p.city}` : ''
      return `${i + 1}. ${pro}${p.name}${svc}${cityBit}`
    })
    .join('\n')
  if (places.length === 1) {
    const pro = top.isPro ? 'Pro · ' : ''
    const svc = top.serviceTitle ? ` · ${top.serviceTitle}` : ''
    const popLine = pop ? `\n${pop}` : ''
    return `Записать к «${pro}${top.name}»${svc}? Выберите ниже.${popLine}`
  }
  const proNote = places.some((p) => p.isPro)
    ? '\nPro-мастера выше в списке — преимущество Pro.'
    : ''
  const hint = pop ? `\nСверху популярные и Pro.` : proNote
  const cityBit = city ? ` · ${city}` : ''
  return query
    ? `Нашёл по «${query}»${cityBit}:\n\n${list}\n\nК кому записать?${hint}`
    : `К кому записать?\n\n${list}${hint}`
}

export function servicesPickerText(businessName, services) {
  const name = businessName || 'мастера'
  if (!services?.length) {
    return `У «${name}» сейчас нет активных услуг. Откройте приложение или выберите другое место.`
  }
  return `Услуга у «${name}»:`
}
