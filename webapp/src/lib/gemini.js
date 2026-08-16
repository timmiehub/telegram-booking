/**
 * Gemini через Supabase Edge Function (один ключ на всех мастеров).
 * Для действий: кого пригласить / подсказки. Не для «красивых постов».
 */

const STORAGE_KEY = 'gemini_api_key'

function supabaseConfig() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL || '',
    anon: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  }
}

export function getGeminiKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function setGeminiKey(key) {
  const clean = String(key || '').trim()
  try {
    if (clean) localStorage.setItem(STORAGE_KEY, clean)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  return Boolean(clean)
}

export function isGeminiConfigured() {
  const { url, anon } = supabaseConfig()
  return Boolean((url && anon) || getGeminiKey())
}

function extractGeminiText(json) {
  const parts = json?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .filter((t) => t.trim())
    .join('\n')
    .trim()
}

function looksBroken(text, minLen = 24) {
  const t = String(text || '').trim()
  if (t.length < minLen) return true
  if (/^[,.\-–—\s\d:]+$/.test(t)) return true
  if (t.startsWith(',') || t.startsWith(':')) return true
  if (/"\s*and\s+slots/i.test(t)) return true
  return false
}

export function parseJsonBlob(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    // ignore
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      // ignore
    }
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      return null
    }
  }
  return null
}

async function generateViaProxy(prompt, { json = false } = {}) {
  const { url, anon } = supabaseConfig()
  if (!url || !anon) return null
  const endpoint = `${url.replace(/\/$/, '')}/functions/v1/ai`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anon}`,
      apikey: anon,
    },
    body: JSON.stringify({ prompt, json }),
  })
  if (!res.ok) {
    console.warn('ai proxy', res.status, await res.text())
    return null
  }
  const payload = await res.json()
  return String(payload?.text || '').trim() || null
}

async function generateViaLocalKey(prompt, { json = false } = {}) {
  const key = getGeminiKey()
  if (!key) return null
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(key)}`
  const generationConfig = {
    temperature: json ? 0.35 : 0.7,
    maxOutputTokens: 2048,
  }
  if (json) {
    generationConfig.responseMimeType = 'application/json'
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    }),
  })
  if (!res.ok) {
    console.warn('gemini local', res.status, await res.text())
    return null
  }
  const jsonBody = await res.json()
  return extractGeminiText(jsonBody) || null
}

async function generateText(prompt, { fallback = '', json = false, minLen = 24 } = {}) {
  let text = null
  try {
    text = await generateViaProxy(prompt, { json })
  } catch (err) {
    console.warn('proxy:', err.message)
  }
  if (!text || looksBroken(text, minLen)) {
    try {
      text = await generateViaLocalKey(prompt, { json })
    } catch (err) {
      console.warn('local gemini:', err.message)
    }
  }
  if (!text || looksBroken(text, minLen)) return fallback
  return text
}

async function generateViaProxyVision(prompt, images, { json = false } = {}) {
  const { url, anon } = supabaseConfig()
  if (!url || !anon) return null
  const endpoint = `${url.replace(/\/$/, '')}/functions/v1/ai`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anon}`,
      apikey: anon,
    },
    body: JSON.stringify({ prompt, json, images }),
  })
  if (!res.ok) {
    console.warn('ai vision proxy', res.status, await res.text())
    return null
  }
  const payload = await res.json()
  const text = String(payload?.text || '').trim()
  if (json && text) {
    return parseJsonBlob(text)
  }
  return text || null
}

async function generateViaLocalKeyVision(prompt, images, { json = false } = {}) {
  const key = getGeminiKey()
  if (!key) return null
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(key)}`
  const parts = [{ text: prompt }]
  for (const img of images.slice(0, 5)) {
    if (img?.base64) {
      parts.push({
        inline_data: {
          mime_type: img.mimeType || 'image/jpeg',
          data: img.base64,
        },
      })
    }
  }
  const generationConfig = {
    temperature: json ? 0.2 : 0.5,
    maxOutputTokens: 4096,
  }
  if (json) generationConfig.responseMimeType = 'application/json'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig,
    }),
  })
  if (!res.ok) {
    console.warn('gemini vision local', res.status, await res.text())
    return null
  }
  const jsonBody = await res.json()
  const text = extractGeminiText(jsonBody)
  if (json && text) return parseJsonBlob(text)
  return text || null
}

/** Gemini Vision: текст + до 5 изображений */
export async function generateWithImages(prompt, images, { json = false } = {}) {
  let result = null
  try {
    result = await generateViaProxyVision(prompt, images, { json })
  } catch (err) {
    console.warn('vision proxy:', err.message)
  }
  if (result == null) {
    try {
      result = await generateViaLocalKeyVision(prompt, images, { json })
    } catch (err) {
      console.warn('vision local:', err.message)
    }
  }
  return result
}

/** Fallback-инвайты без AI */
function fallbackSlotInvites({ businessName, candidates }) {
  const name = businessName || 'Заведение'
  return {
    clients: (candidates || []).slice(0, 5).map((c) => {
      const slot = c.best_slot_iso
      const when = slot
        ? new Date(slot).toLocaleString('ru-RU', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'на днях'
      return {
        telegram_id: Number(c.telegram_id) || c.telegram_id,
        slot_iso: slot,
        reason: `Не был ${c.days_ago} дн., раньше около ${c.preferred_hour}:00`,
        message: `Привет! Есть окно ${when} у «${name}». Если удобно — напишите, запишу.`,
      }
    }),
  }
}

/**
 * Gemini только ранжирует/объясняет + короткое личное сообщение.
 * Слоты и клиенты уже отобраны кодом.
 */
export async function craftSlotInvites({ businessName, slots, candidates }) {
  const fallback = fallbackSlotInvites({ businessName, candidates })
  if (!candidates?.length || !slots?.length) return fallback

  const slotList = slots
    .map((s) => `- ${s.iso} (${s.label})`)
    .join('\n')
  const people = candidates
    .map(
      (c) =>
        `- id=${c.telegram_id}; days_ago=${c.days_ago}; visits=${c.visits}; prefer_wd=${c.preferred_weekday}; prefer_h=${c.preferred_hour}; best_slot=${c.best_slot_iso}`,
    )
    .join('\n')

  const prompt = `Ты помощник мастера в Telegram CRM.
Подбери до 5 клиентов на свободные окна. Не выдумывай id и слоты — только из списков ниже.

Заведение: ${businessName || 'Заведение'}

Свободные слоты (ISO):
${slotList}

Кандидаты:
${people}

Верни ТОЛЬКО JSON вида:
{"clients":[{"telegram_id":123,"slot_iso":"...","reason":"одна короткая причина","message":"личное сообщение 1-2 предложения"}]}

Правила:
- telegram_id и slot_iso строго из входных данных
- reason до 80 символов, по-русски
- message до 180 символов, по-человечески, без маркетинга и без «нейро/чай»
- без markdown и пояснений вне JSON`

  const raw = await generateText(prompt, {
    fallback: '',
    json: true,
    minLen: 40,
  })
  if (!raw) return fallback

  const parsed = parseJsonBlob(raw)
  const list = Array.isArray(parsed?.clients) ? parsed.clients : null
  if (!list?.length) return fallback

  const allowedIds = new Set(candidates.map((c) => String(c.telegram_id)))
  const allowedSlots = new Set(slots.map((s) => s.iso))
  const cleaned = []
  for (const row of list) {
    const id = String(row?.telegram_id ?? '')
    let slotIso = String(row?.slot_iso || '').trim()
    if (!allowedIds.has(id)) continue
    if (!allowedSlots.has(slotIso)) {
      const cand = candidates.find((c) => String(c.telegram_id) === id)
      slotIso = cand?.best_slot_iso || slots[0]?.iso
    }
    if (!slotIso) continue
    const reason = String(row?.reason || '').trim().slice(0, 100)
    const message = String(row?.message || '').trim().slice(0, 220)
    if (!message || looksBroken(message, 20)) continue
    cleaned.push({
      telegram_id: Number(id) || id,
      slot_iso: slotIso,
      reason: reason || 'Подходит по истории визитов',
      message,
    })
  }

  if (!cleaned.length) return fallback
  return { clients: cleaned.slice(0, 5) }
}

export async function craftClientReturnOffer({ daysAgo, visits }) {
  const fallback =
    'Давно не виделись — если удобно на этой неделе, напишите, подберём время.'
  return generateText(
    `Напиши одно короткое сообщение клиенту (1–2 предложения, до 160 символов), чтобы мягко предложить снова записаться.
Клиент не был ${daysAgo} дн., визитов раньше: ${visits}.
Без скидок по умолчанию, без пафоса. Только текст.`,
    { fallback, minLen: 20 },
  )
}

export async function craftOnboardHints({ name, type }) {
  const fallback = {
    blurb: `${name} — запись онлайн в пару касаний.`,
    services: ['Стрижка', 'Укладка', 'Консультация'],
  }
  const raw = await generateText(
    `Для заведения «${name}» (тип: ${type}) предложи:
1) одну короткую фразу о заведении (до 90 символов)
2) ровно 3 названия услуг через | 
Формат строго:
BLURB: ...
SERVICES: услуга1|услуга2|услуга3
Без лишнего текста.`,
    { fallback: '', minLen: 20 },
  )
  if (!raw) return fallback
  const blurb = raw.match(/BLURB:\s*(.+)/i)?.[1]?.trim() || fallback.blurb
  const services =
    raw
      .match(/SERVICES:\s*(.+)/i)?.[1]
      ?.split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3) || fallback.services
  return { blurb, services }
}

/**
 * Разбор свободного запроса клиента: «стрижка завтра» → service_query.
 * Город уже выбран в UI — AI только уточняет услугу/тип.
 */
export async function parseClientSearchQuery(rawText) {
  const text = String(rawText || '').trim()
  if (!text) return { service_query: '', hint: '' }

  const fallback = { service_query: text, hint: '' }
  const raw = await generateText(
    `Клиент ищет мастера. Фраза: «${text}»
Верни ТОЛЬКО JSON: {"service_query":"короткий поисковый запрос услуги или типа","hint":"одна короткая подсказка до 60 символов"}
service_query — ключевые слова для поиска (стрижка, маникюр, репетитор…). Без города.
По-русски, без markdown.`,
    { fallback: '', json: true, minLen: 10 },
  )
  if (!raw) return fallback
  try {
    let parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      if (m) parsed = JSON.parse(m[0])
    }
    const service_query = String(parsed?.service_query || text).trim()
    const hint = String(parsed?.hint || '').trim().slice(0, 80)
    return { service_query: service_query || text, hint }
  } catch {
    return fallback
  }
}
