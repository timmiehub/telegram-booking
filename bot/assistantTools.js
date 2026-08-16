/**
 * Инструменты AI-ассистента: только данные текущего пользователя.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findSlotsForMessage, resolveMaster } from './aiBook.js'
import {
  createExternalBooking,
  parseExternalBookingSmart,
  resolveMasterForTelegram,
  formatExternalWhen,
} from './externalBooking.js'
import {
  fetchClientMasters,
  searchPlaces,
  searchByService,
  guessClientCity,
} from './clientMasters.js'
import { getBotSupabase } from './supabaseBot.js'
import { formatTimeRu, formatDateRu, formatWhenRu } from './timeFormat.js'

const FAQ_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'appFaq.md')

function dayAt(offset = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d
}

function dayBounds(offset = 0) {
  const start = dayAt(offset)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

function fmtTime(iso) {
  return formatTimeRu(iso)
}

function fmtDay(offset = 0) {
  if (offset === 0) return 'сегодня'
  if (offset === 1) return 'завтра'
  return formatDateRu(dayAt(offset), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function statusRu(s) {
  const map = {
    pending: 'ожидает',
    confirmed: 'подтверждена',
    completed: 'завершена',
    no_show: 'не пришёл',
    cancelled_by_client: 'отмена клиентом',
    cancelled_by_master: 'отмена мастером',
  }
  return map[s] || s
}

let faqCache = null
export function loadAppFaq() {
  if (faqCache) return faqCache
  try {
    faqCache = fs.readFileSync(FAQ_PATH, 'utf8')
  } catch {
    faqCache = 'Приложение для записи к мастеру через Telegram Mini App.'
  }
  return faqCache
}

export async function toolGetDayAgenda({ telegramId, dayOffset = 0 }) {
  const master = await resolveMasterForTelegram(telegramId)
  if (!master?.masterId) {
    return { ok: false, error: 'Кабинет мастера не найден. Создайте заведение в приложении.' }
  }

  const supabase = getBotSupabase()
  if (!supabase) return { ok: false, error: 'Нет подключения к базе' }

  const { start, end } = dayBounds(dayOffset)
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'starts_at, ends_at, status, external_source, client_telegram_id, services(title)',
    )
    .eq('master_id', master.masterId)
    .gte('starts_at', start.toISOString())
    .lte('starts_at', end.toISOString())
    .in('status', ['pending', 'confirmed', 'completed'])
    .order('starts_at')

  if (error) return { ok: false, error: error.message }

  const rows = (data || []).map((b) => {
    const title = b.external_source || b.services?.title || 'Услуга'
    const who = b.external_source
      ? `сторонняя · ${title}`
      : b.client_telegram_id
        ? `${title} · клиент TG`
        : title
    return `${fmtTime(b.starts_at)}–${fmtTime(b.ends_at)} ${who} (${statusRu(b.status)})`
  })

  return {
    ok: true,
    dayLabel: fmtDay(dayOffset),
    count: rows.length,
    lines: rows,
    businessName: master.businessName,
  }
}

export async function toolListMyMasters({ telegramId, query = '' }) {
  const places = await fetchClientMasters(telegramId, { query, limit: 8 })
  return {
    ok: true,
    query: query || null,
    count: places.length,
    places: places.map((p) => ({
      slug: p.slug,
      name: p.name,
      city: p.city,
      type: p.type,
      serviceTitle: p.serviceTitle || null,
      serviceId: p.serviceId || null,
      popularity: p.popularity || 0,
      isPro: Boolean(p.isPro),
      source: 'history',
    })),
  }
}

export async function toolSearchPlaces({ telegramId, query = '', city = null } = {}) {
  const q = String(query || '').trim()
  if (q.length < 2) {
    return { ok: false, error: 'Напишите название или тип (от 2 букв)' }
  }
  const preferCity = city || (await guessClientCity(telegramId))
  let places = await searchPlaces({ query: q, city: preferCity, limit: 5 })
  // Город из фразы — жёсткий: без fallback на всю страну
  if (!places.length && preferCity && !city) {
    places = await searchPlaces({ query: q, city: null, limit: 5 })
  }
  return {
    ok: true,
    query: q,
    city: (city || preferCity) || null,
    count: places.length,
    places: places.map((p) => ({
      slug: p.slug,
      name: p.name,
      city: p.city,
      type: p.type,
      serviceTitle: p.serviceTitle || null,
      serviceId: p.serviceId || null,
      popularity: p.popularity || 0,
      isPro: Boolean(p.isPro),
      source: 'search',
    })),
  }
}

export async function toolSearchByService({
  telegramId = null,
  query = '',
  city = null,
} = {}) {
  const q = String(query || '').trim()
  if (q.length < 2) {
    return { ok: false, error: 'Напишите услугу: ногти, барбер, массаж…' }
  }
  const preferCity =
    city || (telegramId ? await guessClientCity(telegramId) : null)
  let places = await searchByService({ query: q, city: preferCity, limit: 6 })
  // Явный город из фразы — без fallback на всю страну и без чужого города из истории
  if (!places.length && preferCity && !city) {
    places = await searchByService({ query: q, city: null, limit: 6 })
  }
  return {
    ok: true,
    query: q,
    city: (city || preferCity) || null,
    count: places.length,
    places: places.map((p) => ({
      slug: p.slug,
      name: p.name,
      city: p.city,
      type: p.type,
      serviceTitle: p.serviceTitle || null,
      serviceId: p.serviceId || null,
      popularity: p.popularity || 0,
      isPro: Boolean(p.isPro),
      source: 'service',
    })),
  }
}

export async function toolGetMasterSlots({ slug, timeQuery = 'завтра', serviceId = null }) {
  const s = String(slug || '').trim()
  if (!s || !/^[a-zA-Z0-9_-]{1,48}$/.test(s)) {
    return { ok: false, error: 'Некорректный slug' }
  }
  const master = await resolveMaster(s, { serviceId })
  if (!master?.masterId) {
    return { ok: false, error: 'Мастер не найден' }
  }
  const found = await findSlotsForMessage(timeQuery || 'завтра', s, { serviceId })
  if (!found.ok) return { ok: false, error: found.error || 'Не нашёл слоты' }
  return {
    ok: true,
    slug: s,
    businessName: found.master?.businessName || master.businessName,
    serviceId: found.master?.service?.id || null,
    serviceTitle: found.master?.service?.title || null,
    timeQuery,
    slots: (found.slots || []).slice(0, 6).map((slot) => ({
      iso: slot.start.toISOString(),
      start: slot.start,
      label: formatWhenRu(slot.start),
    })),
  }
}

export async function toolAddExternalBooking({ telegramId, text }) {
  const master = await resolveMasterForTelegram(telegramId)
  if (!master?.masterId) {
    return { ok: false, error: 'Только для мастеров с кабинетом.' }
  }
  const parsed = await parseExternalBookingSmart(text)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const result = await createExternalBooking({
    masterId: master.masterId,
    businessId: master.businessId,
    service: master.service,
    source: parsed.source,
    startsAt: parsed.startsAt,
    durationMin: parsed.durationMin,
  })
  if (!result.ok) return result

  return {
    ok: true,
    source: parsed.source,
    when: formatExternalWhen(parsed.startsAt),
    durationMin: parsed.durationMin,
  }
}

export async function toolGetMyBookings({ telegramId, limit = 10 }) {
  const supabase = getBotSupabase()
  if (!supabase) return { ok: false, error: 'Нет подключения к базе' }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('bookings')
    .select('starts_at, ends_at, status, services(title), businesses(name)')
    .eq('client_telegram_id', telegramId)
    .gte('starts_at', now)
    .in('status', ['pending', 'confirmed'])
    .order('starts_at')
    .limit(Math.min(limit, 15))

  if (error) return { ok: false, error: error.message }

  const rows = (data || []).map((b) => {
    const title = b.services?.title || 'Услуга'
    const place = b.businesses?.name ? ` · ${b.businesses.name}` : ''
    return `${formatExternalWhen(b.starts_at)} ${title}${place} (${statusRu(b.status)})`
  })

  return { ok: true, count: rows.length, lines: rows }
}

export function toolAppFaq({ topic }) {
  const faq = loadAppFaq()
  const t = String(topic || '').toLowerCase()
  if (!t) return { ok: true, faq }
  const chunks = faq.split(/\n## /).filter(Boolean)
  const hit = chunks.find((c) => c.toLowerCase().includes(t))
  return { ok: true, faq: hit ? `## ${hit}` : faq.slice(0, 1200) }
}

export async function executeAssistantTool(name, args, ctx) {
  const telegramId = ctx.from?.id

  switch (name) {
    case 'get_day_agenda':
      return toolGetDayAgenda({ telegramId, dayOffset: args.dayOffset ?? 0 })
    case 'list_my_masters':
      return toolListMyMasters({ telegramId, query: args.query || '' })
    case 'search_places':
      return toolSearchPlaces({ telegramId, query: args.query || '' })
    case 'search_by_service':
      return toolSearchByService({ query: args.query || '' })
    case 'get_master_slots':
      return toolGetMasterSlots({
        slug: args.slug,
        timeQuery: args.timeQuery || 'завтра',
        serviceId: args.serviceId || null,
      })
    case 'add_external_booking':
      return toolAddExternalBooking({ telegramId, text: args.text })
    case 'get_my_bookings':
      return toolGetMyBookings({ telegramId, limit: args.limit })
    case 'app_faq':
      return toolAppFaq({ topic: args.topic })
    default:
      return { ok: false, error: `Неизвестный инструмент: ${name}` }
  }
}

export const ASSISTANT_TOOL_DECLARATIONS = [
  {
    name: 'get_day_agenda',
    description: 'Расписание мастера на день. Только исполнитель с кабинетом.',
    parameters: {
      type: 'OBJECT',
      properties: {
        dayOffset: {
          type: 'INTEGER',
          description: '0=сегодня, 1=завтра, 2=послезавтра',
        },
      },
    },
  },
  {
    name: 'list_my_masters',
    description:
      'Мастера/заведения из истории визитов клиента. query: «барбер», имя салона.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Фильтр: барбер, салон, имя' },
      },
    },
  },
  {
    name: 'search_places',
    description: 'Публичный поиск заведений по названию/типу. Только для клиента.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Название или тип' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_by_service',
    description:
      'Поиск мастеров по услуге: ногти, маникюр, барбер, консультация по ИИ. Если клиент не знает к кому.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Услуга: ногти, барбер, консультация…',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_master_slots',
    description: 'Свободные слоты у заведения по slug из list/search. Клиент.',
    parameters: {
      type: 'OBJECT',
      properties: {
        slug: { type: 'STRING', description: 'slug из результата list/search' },
        timeQuery: { type: 'STRING', description: 'завтра, сегодня, после 15' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'add_external_booking',
    description: 'Сторонняя запись мастеру (YClients, ЛС). Только исполнитель.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'Источник + когда' },
      },
      required: ['text'],
    },
  },
  {
    name: 'get_my_bookings',
    description: 'Ближайшие записи клиента',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'INTEGER', description: 'До 15' },
      },
    },
  },
  {
    name: 'app_faq',
    description: 'Справка по приложению',
    parameters: {
      type: 'OBJECT',
      properties: {
        topic: { type: 'STRING', description: 'запись, отмена, pro, чат' },
      },
    },
  },
]

export const CLIENT_TOOLS = [
  'list_my_masters',
  'search_places',
  'search_by_service',
  'get_master_slots',
  'get_my_bookings',
  'app_faq',
]

export const MASTER_TOOLS = [
  'get_day_agenda',
  'add_external_booking',
  'app_faq',
]
