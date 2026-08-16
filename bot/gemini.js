/**
 * Gemini: чат + function calling. UI-кнопки — отдельно (ui payload).
 */
import {
  loadAppFaq,
  executeAssistantTool,
  ASSISTANT_TOOL_DECLARATIONS,
  CLIENT_TOOLS,
  MASTER_TOOLS,
} from './assistantTools.js'
import { COPY } from './roleCopy.js'

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash'

function getApiKey() {
  return process.env.GEMINI_API_KEY || ''
}

function apiUrl(model) {
  const key = getApiKey()
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`
}

function extractText(responseJson) {
  const parts = responseJson?.candidates?.[0]?.content?.parts || []
  return parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim()
}

function extractFunctionCall(responseJson) {
  const parts = responseJson?.candidates?.[0]?.content?.parts || []
  for (const p of parts) {
    if (p.functionCall?.name) return p.functionCall
  }
  return null
}

async function callGemini(body, model = DEFAULT_MODEL) {
  const key = getApiKey()
  if (!key) return { ok: false, error: 'GEMINI_API_KEY не задан' }

  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(apiUrl(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const json = await res.json()
      return { ok: true, json }
    }
    const errText = await res.text().catch(() => '')
    lastErr = `Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`
    // Free-tier 429 — короткая пауза и ещё попытка
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
      continue
    }
    break
  }
  return { ok: false, error: lastErr }
}

function systemPrompt({ isMaster, chatRole }) {
  const faqExcerpt = loadAppFaq().slice(0, 2800)
  const role = chatRole || (isMaster ? 'master' : 'client')
  const roleRu = role === 'master' ? 'ИСПОЛНИТЕЛЬ (мастер)' : 'КЛИЕНТ'
  return `Ты Чат-Менеджер Telegram-бота и Mini App «Моя запись».
Сводишь мастера и клиента: запись, подтверждение, напоминания — в этом чате и в приложении.

Кто ты: тёплый помощник-менеджер продукта (на базе ИИ). Говори просто и по-человечески, без маркетинговой воды и без «нейро»-метафор.

Как отвечать:
- Сначала смысл, потом один мягкий следующий шаг. Коротко (до ~400 символов).
- Доброжелательно и спокойно: снимай тревогу («можно отменить в Мои записи», «напомним в Telegram»), повышай доверие, без давления.
- Рамки — продукт: запись к мастеру, кабинет, расписание, напоминания, приложение, роли.
- Оффтоп — одна короткая фраза и мягко верни к записи.
- Не выдумывай записи, slug, чужие данные, цены и слоты — только из tools.
- Не вызывай search/list на болтовне, приветствиях, «кто ты», реакциях и общих вопросах — ответь текстом (FAQ).
- Tools — только когда реально нужна запись, поиск, слоты, повестка или точный факт из app_faq.

ТЕКУЩАЯ РОЛЬ СОБЕСЕДНИКА: ${roleRu}. Отвечай ТОЛЬКО в этой роли.

${
  role === 'master'
    ? `Исполнитель:
- повестка «кто сегодня/завтра» → get_day_agenda
- сторонняя запись → add_external_booking
- НЕ предлагай клиентскую запись к чужим салонам`
    : `Клиент:
- явный запрос записи / услуга → search_by_service или list_my_masters / search_places
- слоты → get_master_slots (slug только из результатов tools)
- «мои записи» → get_my_bookings
- НЕ показывай чужое расписание мастера`
}

Эмодзи — максимум одно, только по делу. Язык — русский.

FAQ продукта:
${faqExcerpt}`
}

function uiFromTool(toolName, toolResult, args = {}) {
  if (!toolResult?.ok) return null

  if (
    toolName === 'list_my_masters' ||
    toolName === 'search_places' ||
    toolName === 'search_by_service'
  ) {
    return {
      type: 'places',
      query: toolResult.query || args.query || '',
      places: toolResult.places || [],
    }
  }

  if (toolName === 'get_master_slots') {
    return {
      type: 'slots',
      slug: toolResult.slug || args.slug,
      businessName: toolResult.businessName,
      timeQuery: toolResult.timeQuery || args.timeQuery || 'завтра',
      slots: (toolResult.slots || []).map((s) => ({
        start: s.start instanceof Date ? s.start : new Date(s.iso || s.start),
        iso: s.iso || (s.start instanceof Date ? s.start.toISOString() : s.start),
      })),
    }
  }

  return null
}

export async function runAssistant({ userText, telegramId, isMaster, chatRole, webappUrl }) {
  if (!getApiKey()) {
    return {
      ok: false,
      reply: COPY.assistantBusy,
      fallbackSearch: false,
    }
  }

  const ctx = { from: { id: telegramId }, webappUrl }
  const allowed = isMaster ? MASTER_TOOLS : CLIENT_TOOLS
  const tools = {
    functionDeclarations: ASSISTANT_TOOL_DECLARATIONS.filter((t) =>
      allowed.includes(t.name),
    ),
  }

  const firstBody = {
    systemInstruction: {
      parts: [{ text: systemPrompt({ isMaster, chatRole }) }],
    },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    tools: [tools],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
  }

  const first = await callGemini(firstBody)
  if (!first.ok) {
    return {
      ok: false,
      reply: COPY.assistantBusy,
      fallbackSearch: false,
    }
  }

  const fn = extractFunctionCall(first.json)
  if (!fn?.name) {
    const direct = extractText(first.json)
    const hasText = Boolean(direct && String(direct).trim())
    if (!isMaster) {
      return {
        ok: hasText,
        reply: hasText
          ? direct.slice(0, 2000)
          : COPY.assistantBusy,
        fallbackSearch: !hasText,
      }
    }
    if (direct) return { ok: true, reply: direct.slice(0, 2000) }
    return {
      ok: false,
      reply: 'Не понял. Напишите «кто сегодня» или смените роль на клиент.',
      fallbackSearch: false,
    }
  }

  const args = fn.args || {}
  const toolResult = await executeAssistantTool(fn.name, args, ctx)
  const ui = uiFromTool(fn.name, toolResult, args)

  // Для places/slots — короткий текст + ui (кнопки рисует роутер)
  if (ui?.type === 'places') {
    if (!ui.places.length) {
      return {
        ok: true,
        reply: ui.query
          ? `Не нашёл по «${ui.query}». Попробуйте другое слово или откройте приложение.`
          : 'Пока нет подходящих мастеров. Напишите услугу или откройте приложение.',
        ui,
      }
    }
    return {
      ok: true,
      reply:
        ui.places.length === 1
          ? `Нашёл «${ui.places[0].name}». Выберите время:`
          : 'К кому записать?',
      ui,
    }
  }

  if (ui?.type === 'slots') {
    if (!ui.slots.length) {
      return {
        ok: true,
        reply: `Свободных окон у «${ui.businessName || 'мастера'}» нет. Попробуйте другой день.`,
        ui,
      }
    }
    return {
      ok: true,
      reply: `Свободно у «${ui.businessName}». Нажмите время:`,
      ui,
    }
  }

  const secondBody = {
    systemInstruction: {
      parts: [{ text: systemPrompt({ isMaster, chatRole }) }],
    },
    contents: [
      { role: 'user', parts: [{ text: userText }] },
      {
        role: 'model',
        parts: [{ functionCall: { name: fn.name, args } }],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: fn.name,
              response: toolResult,
            },
          },
        ],
      },
    ],
    generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
  }

  const second = await callGemini(secondBody)
  if (!second.ok) {
    return formatToolResultFallback(fn.name, toolResult)
  }

  const reply = extractText(second.json)
  if (reply) return { ok: true, reply: reply.slice(0, 2000) }
  return formatToolResultFallback(fn.name, toolResult)
}

function formatToolResultFallback(toolName, result) {
  if (!result?.ok) {
    return { ok: false, reply: result?.error || 'Не вышло выполнить запрос.' }
  }

  if (toolName === 'get_day_agenda') {
    if (!result.count) {
      return { ok: true, reply: `${result.dayLabel}: записей нет, день свободен.` }
    }
    return {
      ok: true,
      reply: `${result.dayLabel} · ${result.count}:\n${result.lines.join('\n')}`,
    }
  }

  if (toolName === 'add_external_booking') {
    return {
      ok: true,
      reply: `Добавлено ✅\n${result.source} · ${result.when} (${result.durationMin} мин)`,
    }
  }

  if (toolName === 'get_my_bookings') {
    if (!result.count) return { ok: true, reply: 'Ближайших записей нет.' }
    return { ok: true, reply: `Ваши записи:\n${result.lines.join('\n')}` }
  }

  if (toolName === 'app_faq') {
    return { ok: true, reply: String(result.faq || '').slice(0, 1500) }
  }

  return { ok: true, reply: 'Готово.' }
}

export async function polishReminder({ title, label, when }) {
  return `Напоминание: ${title} ${label}, ${when}. Если планы изменились — напишите мастеру.`
}
