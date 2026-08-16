/**
 * Роутер AI-ассистента: роли, запись клиента, UI-кнопки из tools.
 */
import { Markup } from 'telegraf'
import { runAssistant } from './gemini.js'
import {
  looksLikeExternalBookingDraft,
  parseExternalBookingSmart,
  createExternalBooking,
  resolveMasterForTelegram,
  formatExternalWhen,
} from './externalBooking.js'
import {
  toolGetDayAgenda,
  toolListMyMasters,
  toolSearchPlaces,
  toolSearchByService,
} from './assistantTools.js'
import {
  extractServiceKeywords,
  hasKnownServiceTerm,
  parseClientSearchIntent,
} from './clientMasters.js'
import { resolveEffectiveRole } from './chatRole.js'
import { COPY } from './roleCopy.js'
import { matchFaqAutoReply } from './faqAutoReply.js'
import { isBusinessPro, isProPlan } from './proPlan.js'
import { matchReplyTemplate, normalizeReplyTemplates } from './replyTemplates.js'
import { getBotSupabase } from './supabaseBot.js'
import {
  getClientBookingSession,
  setClientBookingSession,
  clearClientBookingSession,
  buildPlacePickerKeyboard,
  buildServicePickerKeyboard,
  buildDayPickerKeyboard,
  buildSlotsKeyboard,
  dayPickerText,
  hasExplicitDay,
  loadSlotsForSlug,
  loadServicesForSlug,
  placesPickerText,
  servicesPickerText,
} from './clientBookingFlow.js'

const MASTER_AGENDA_CUE =
  /(кто\s+(у\s+меня\s+)?(сегодня|завтра)|расписание\s+(на\s+)?(сегодня|завтра)|что\s+(у\s+меня\s+)?(сегодня|завтра)|сколько\s+(запис|визит)|(?:^|\b)(а\s+)?(на\s+)?(сегодня|завтра)\??$|(^|\b)завтра\??$)/i

const CLIENT_BOOK_CUE =
  /(запиш|запис(ать|и)|хочу\s+к|к\s+барбер|к\s+мастер|свободн|есть\s+(завтра|сегодня)|окн[ао]|барбер|ногт|маникюр|стрижк|консультац|массаж|парикмах|найди|найти|поиск|ищу|нужен|нужна|салон|брови|ресниц|тату|эпиляц|косметолог)/i

/** Явная запись / известная услуга / поиск — быстрый путь без Gemini. */
function looksLikeClientBookingIntent(text) {
  const t = String(text || '').trim()
  if (!t || t.length > 280) return false
  if (CLIENT_BOOK_CUE.test(t)) return true
  if (hasKnownServiceTerm(t)) return true
  if (parseClientSearchIntent(t).query) return true
  return false
}

function chatMenuKeyboard(withParams, webAppReady) {
  const rows = []
  if (webAppReady) {
    rows.push([
      Markup.button.webApp(
        'Приложение',
        withParams({ view: 'home' }, { bare: true }),
      ),
      Markup.button.callback('Меню', 'menu:refresh'),
    ])
  } else {
    rows.push([Markup.button.callback('Меню', 'menu:refresh')])
  }
  return Markup.inlineKeyboard(rows)
}

const FOLLOWUP_TIME_CUE =
  /^(а\s+)?(на\s+)?(сегодня|завтра|послезавтра)\??$|после\s*\d|утром|вечером|\d{1,2}\s*[:.]\s*\d{2}/i

const FILLER =
  /\b(можешь|можно|пожалуйста|подскажи|хочу|меня|кому[- ]?то|кого[- ]?то|какого[- ]?то|не\s+знаю|запиши|записать|записаться|есть|свободн\w*|окн\w*|завтра|сегодня|послезавтра)\b/gi

function agendaDayOffset(text) {
  const t = String(text || '').toLowerCase()
  if (/послезавтра/.test(t)) return 2
  if (/завтра/.test(t)) return 1
  return 0
}

/**
 * Из фразы записи — короткая услуга/имя, не весь вопрос.
 */
function extractBookQuery(text) {
  const raw = String(text || '').trim()
  const fromKw = extractServiceKeywords(raw)
  if (fromKw) return fromKw.slice(0, 40)

  let t = raw
    .replace(/запиши\s+меня\s+(к|на)?/gi, ' ')
    .replace(/записать\s+(к|на)?/gi, ' ')
    .replace(/хочу\s+(записаться\s+)?(к|на)?/gi, ' ')
    .replace(FILLER, ' ')
    .replace(/[?!.…,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Длинный остаток без ключевого слова — не искать по всей фразе
  if (t.length > 36 || t.split(/\s+/).length > 4) {
    return ''
  }
  return t.slice(0, 40)
}

function mapPlacesForSession(places) {
  return (places || []).map((p) => ({
    slug: p.slug,
    name: p.name,
    serviceTitle: p.serviceTitle || null,
    serviceId: p.serviceId || null,
    popularity: p.popularity || 0,
    isPro: Boolean(p.isPro),
    city: p.city || null,
  }))
}

async function findPlacesForClient(telegramId, query, { city = null } = {}) {
  const q = String(query || '').trim()
  // Каталог важнее истории, если есть явный запрос
  if (q) {
    const bySvc = await toolSearchByService({ telegramId, query: q, city })
    if (bySvc.places?.length) return { ...bySvc, via: 'service' }

    const byPlace = await toolSearchPlaces({ telegramId, query: q, city })
    if (byPlace.places?.length) return { ...byPlace, via: 'places' }

    // Явный город — не подмешиваем историю/другой город
    if (city) {
      return { ok: true, query: q, city, places: [], via: 'none' }
    }
  }

  let places = await toolListMyMasters({ telegramId, query: q })
  if (places.places?.length) return { ...places, via: 'history' }

  return { ok: true, query: q, city, places: [], via: 'none' }
}

async function masterHasPro(telegramId) {
  const master = await resolveMasterForTelegram(telegramId)
  if (!master?.businessId) return false
  const sb = getBotSupabase()
  if (!sb) return false
  const { data } = await sb
    .from('businesses')
    .select('settings')
    .eq('id', master.businessId)
    .maybeSingle()
  return isBusinessPro(data?.settings)
}

async function replyPlaces(safeReply, ctx, places, query, withParams, webAppReady, { city = null } = {}) {
  const appUrl = webAppReady
    ? withParams({ view: 'home' }, { bare: true })
    : null
  setClientBookingSession(ctx.from.id, {
    lastQuery: query || '',
    places: mapPlacesForSession(places),
  })
  await safeReply(
    ctx,
    placesPickerText(places, query, { city }),
    buildPlacePickerKeyboard(places, {
      withAppSearch: Boolean(appUrl),
      webAppUrl: appUrl,
    }),
  )
}

async function replyServicesOrSlots(
  safeReply,
  ctx,
  slug,
  businessName,
  timeQuery,
  { serviceId = null } = {},
) {
  let services = await loadServicesForSlug(slug)
  if (serviceId && services.length > 1) {
    const hitIdx = services.findIndex(
      (s) => s.id === serviceId || String(s.id).startsWith(String(serviceId)),
    )
    if (hitIdx > 0) {
      const [hit] = services.splice(hitIdx, 1)
      services = [hit, ...services]
    }
  }

  setClientBookingSession(ctx.from.id, {
    slug,
    businessName: businessName || slug,
    timeQuery: timeQuery || null,
    serviceId: serviceId || null,
    services: services.map((s) => ({
      id: s.id,
      title: s.title,
      duration_min: s.duration_min,
      price_cents: s.price_cents,
      currency: s.currency,
    })),
  })

  if (services.length > 1) {
    await safeReply(
      ctx,
      servicesPickerText(businessName || slug, services),
      buildServicePickerKeyboard(slug, services),
    )
    return
  }

  const sid = services[0]?.id || serviceId || null
  const serviceTitle = services[0]?.title || null
  setClientBookingSession(ctx.from.id, {
    serviceId: sid,
    serviceTitle,
  })

  if (!hasExplicitDay(timeQuery)) {
    await safeReply(
      ctx,
      dayPickerText(businessName || slug, serviceTitle),
      buildDayPickerKeyboard(),
    )
    return
  }

  const found = await loadSlotsForSlug(slug, timeQuery || '', {
    serviceId: sid,
  })
  setClientBookingSession(ctx.from.id, {
    slug,
    businessName: businessName || found.master?.businessName || slug,
    timeQuery: timeQuery || null,
    serviceId: found.master?.service?.id || sid,
    serviceTitle: found.master?.service?.title || serviceTitle,
  })
  if (!found.ok || !found.slots?.length) {
    await safeReply(
      ctx,
      COPY.noSlots,
      Markup.inlineKeyboard([
        [Markup.button.callback('← Другой день', 'day:back')],
        [Markup.button.callback('Отмена', 'pick:cancel')],
      ]),
    )
    return
  }
  const svc = found.master?.service?.title
  const name = found.master?.businessName || businessName
  const head = svc
    ? `«${name}» · ${svc}. Нажмите время:`
    : `Свободно у «${name}». Нажмите время:`
  await safeReply(ctx, head, buildSlotsKeyboard(slug, found.slots))
}

async function replySlots(safeReply, ctx, slug, businessName, timeQuery, opts = {}) {
  await replyServicesOrSlots(safeReply, ctx, slug, businessName, timeQuery, opts)
}

function masterNoCabinetKeyboard(withParams, webAppReady) {
  const rows = []
  if (webAppReady) {
    rows.push([
      Markup.button.webApp(
        'Открыть кабинет',
        withParams({ view: 'onboard' }, { bare: true }),
      ),
      Markup.button.callback('Я клиент', 'role:client'),
    ])
  } else {
    rows.push([Markup.button.callback('Я клиент', 'role:client')])
  }
  return Markup.inlineKeyboard(rows)
}

async function offerPlacesFromQuery(
  safeReply,
  ctx,
  telegramId,
  query,
  timeHint,
  withParams,
  webAppReady,
  { prefix = '', city = null } = {},
) {
  const places = await findPlacesForClient(telegramId, query, { city })
  if (places.places?.length === 1) {
    const p = places.places[0]
    setClientBookingSession(ctx.from.id, {
      lastQuery: query || '',
      places: mapPlacesForSession(places.places),
      serviceId: p.serviceId || null,
      serviceTitle: p.serviceTitle || null,
    })
    if (prefix) await safeReply(ctx, prefix)
    await replySlots(safeReply, ctx, p.slug, p.name, timeHint, {
      serviceId: p.serviceId || null,
    })
    return { offered: true, via: places.via }
  }
  if (places.places?.length) {
    if (prefix) {
      setClientBookingSession(ctx.from.id, {
        lastQuery: query || '',
        places: mapPlacesForSession(places.places),
      })
      const appUrl = webAppReady
        ? withParams({ view: 'home' }, { bare: true })
        : null
      await safeReply(
        ctx,
        `${prefix}\n${placesPickerText(places.places, query, { via: places.via, city })}`,
        buildPlacePickerKeyboard(places.places, {
          withAppSearch: Boolean(appUrl),
          webAppUrl: appUrl,
        }),
      )
      return { offered: true, via: places.via }
    }
    await replyPlaces(
      safeReply,
      ctx,
      places.places,
      query,
      withParams,
      webAppReady,
      { city },
    )
    return { offered: true, via: places.via }
  }
  return { offered: false, via: places.via || 'none', query: places.query || query, city }
}

async function runClientBookingIntent(
  safeReply,
  ctx,
  telegramId,
  trimmed,
  withParams,
  webAppReady,
) {
  const timeHint =
    hasExplicitDay(trimmed) ||
    /утром|вечером|после\s*\d|до\s*\d|\d{1,2}\s*[:.]/.test(trimmed)
      ? trimmed
      : ''
  const intent = parseClientSearchIntent(trimmed)
  const query =
    intent.query ||
    extractBookQuery(trimmed) ||
    extractServiceKeywords(trimmed) ||
    ''
  if (!query) {
    await safeReply(
      ctx,
      COPY.clientHintBook,
      chatMenuKeyboard(withParams, webAppReady),
    )
    return true
  }
  const result = await offerPlacesFromQuery(
    safeReply,
    ctx,
    telegramId,
    query,
    timeHint,
    withParams,
    webAppReady,
    { city: intent.city },
  )
  if (result.offered) return true

  const cityHint = intent.city ? ` в «${intent.city}»` : ''
  await safeReply(
    ctx,
    placesPickerText([], query, {
      via: result.via || 'none',
      city: intent.city,
    }) ||
      `По «${query}»${cityHint} никого не нашёл. Попробуйте другое слово или откройте приложение.`,
    webAppReady
      ? Markup.inlineKeyboard([
          [
            Markup.button.webApp(
              'В приложении',
              withParams({ view: 'home' }, { bare: true }),
            ),
          ],
        ])
      : undefined,
  )
  return true
}

export async function handleAssistantMessage(
  ctx,
  text,
  { hasCabinet, safeReply, webAppReady, withParams },
) {
  const telegramId = ctx.from?.id
  const trimmed = String(text || '').trim()
  if (!trimmed || trimmed.startsWith('/')) return false

  const role = resolveEffectiveRole(telegramId, { hasCabinet })
  const isMaster = role === 'master'
  const isClient = role === 'client'
  const bookingIntent = looksLikeClientBookingIntent(trimmed)

  // Pro-шаблоны мастера — до FAQ и Gemini
  if (isMaster && hasCabinet) {
    const masterEarly = await resolveMasterForTelegram(telegramId)
    if (masterEarly?.businessId) {
      const sb = getBotSupabase()
      if (sb) {
        const { data: biz } = await sb
          .from('businesses')
          .select('settings')
          .eq('id', masterEarly.businessId)
          .maybeSingle()
        if (isProPlan(biz?.settings)) {
          const templates = normalizeReplyTemplates(biz.settings?.reply_templates)
          const hit = matchReplyTemplate(templates, trimmed)
          if (hit?.text) {
            await safeReply(ctx, hit.text)
            return true
          }
        }
      }
    }
  }

  // Частые вопросы продукта — до booking и до Gemini (экономия токенов)
  const faqHit = matchFaqAutoReply(trimmed)
  if (faqHit) {
    await safeReply(
      ctx,
      faqHit.reply,
      chatMenuKeyboard(withParams, webAppReady),
    )
    return true
  }

  // --- Мастер без кабинета ---
  if (isMaster && !hasCabinet) {
    // Даже без кабинета — поиск записи как клиенту (чатбот)
    if (bookingIntent) {
      return runClientBookingIntent(
        safeReply,
        ctx,
        telegramId,
        trimmed,
        withParams,
        webAppReady,
      )
    }
    await safeReply(
      ctx,
      COPY.masterNoCabinet,
      masterNoCabinetKeyboard(withParams, webAppReady),
    )
    return true
  }

  // --- Режим исполнителя ---
  if (isMaster) {
    if (MASTER_AGENDA_CUE.test(trimmed)) {
      const dayOffset = agendaDayOffset(trimmed)
      const agenda = await toolGetDayAgenda({ telegramId, dayOffset })
      if (agenda.ok) {
        const reply =
          agenda.count === 0
            ? `${agenda.dayLabel}: записей нет 📭`
            : `${agenda.dayLabel} · ${agenda.count}:\n${agenda.lines.join('\n')}`
        await safeReply(ctx, reply)
        return true
      }
    }

    if (looksLikeExternalBookingDraft(trimmed)) {
      const master = await resolveMasterForTelegram(telegramId)
      if (master?.masterId) {
        const parsed = await parseExternalBookingSmart(trimmed)
        if (parsed.ok) {
          const result = await createExternalBooking({
            masterId: master.masterId,
            businessId: master.businessId,
            service: master.service,
            source: parsed.source,
            startsAt: parsed.startsAt,
            durationMin: parsed.durationMin,
          })
          if (result.ok) {
            const when = formatExternalWhen(parsed.startsAt)
            await safeReply(
              ctx,
              `Добавлено ✅\n${parsed.source} · ${when} (${parsed.durationMin} мин)`,
            )
            return true
          }
          await safeReply(ctx, result.error || 'Не вышло добавить')
          return true
        }
      }
    }

    // «барбер» / запись — как клиентский чат, не через master-Gemini
    if (bookingIntent) {
      return runClientBookingIntent(
        safeReply,
        ctx,
        telegramId,
        trimmed,
        withParams,
        webAppReady,
      )
    }

    // ИИ только для Pro-мастеров
    const pro = await masterHasPro(telegramId)
    if (!pro) {
      await safeReply(
        ctx,
        COPY.masterAiProOnly,
        chatMenuKeyboard(withParams, webAppReady),
      )
      return true
    }

    const result = await runAssistant({
      userText: trimmed,
      telegramId,
      isMaster: true,
      chatRole: 'master',
      webappUrl: process.env.WEBAPP_URL || '',
    })
    await safeReply(
      ctx,
      result.reply ||
        'Не понял. Напишите «кто сегодня», «барбер» для записи или смените роль.',
    )
    return true
  }

  // --- Режим клиента ---
  if (isClient) {
    const session = getClientBookingSession(telegramId)

    // Follow-up времени при выбранном мастере
    if (session?.slug && FOLLOWUP_TIME_CUE.test(trimmed)) {
      await replySlots(
        safeReply,
        ctx,
        session.slug,
        session.businessName,
        trimmed,
        { serviceId: session.serviceId || null },
      )
      return true
    }

    // Поиск / запись — только ключевые слова, без Gemini
    if (bookingIntent || parseClientSearchIntent(trimmed).query) {
      return runClientBookingIntent(
        safeReply,
        ctx,
        telegramId,
        trimmed,
        withParams,
        webAppReady,
      )
    }

    // Всегда отвечаем: подсказка, без ИИ
    await safeReply(
      ctx,
      COPY.clientNoAiHint,
      chatMenuKeyboard(withParams, webAppReady),
    )
    return true
  }

  return false
}

export {
  clearClientBookingSession,
  masterNoCabinetKeyboard,
  looksLikeClientBookingIntent,
}
