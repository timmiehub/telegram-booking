// Platform Gemini proxy — один ключ на всех мастеров
const MODEL = 'gemini-3.5-flash'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function extractText(json) {
  const parts = json?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .filter((t) => t.trim())
    .join('\n')
    .trim()
}

function looksBroken(text) {
  const t = String(text || '').trim()
  if (t.length < 8) return true
  if (/^[,.\-–—\s\d:]+$/.test(t)) return true
  if (t.startsWith(',') || t.startsWith(':')) return true
  if (/"\s*and\s+slots/i.test(t)) return true
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!geminiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not set' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  let prompt = ''
  let wantJson = false
  let images: { mimeType: string; base64: string }[] = []
  try {
    const body = await req.json()
    prompt = String(body?.prompt || '').trim()
    wantJson = Boolean(body?.json)
    if (Array.isArray(body?.images)) {
      images = body.images
        .slice(0, 5)
        .map((img: { mimeType?: string; base64?: string }) => ({
          mimeType: String(img?.mimeType || 'image/jpeg'),
          base64: String(img?.base64 || '').trim(),
        }))
        .filter((img) => img.base64.length > 20)
    }
  } catch {
    return new Response(JSON.stringify({ error: 'bad json' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (!prompt || prompt.length > 8000) {
    return new Response(JSON.stringify({ error: 'prompt required' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`
    const generationConfig = {
      temperature: wantJson ? 0.35 : 0.7,
      maxOutputTokens: 2048,
      ...(wantJson ? { responseMimeType: 'application/json' } : {}),
    }

    const parts: { text?: string; inline_data?: { mime_type: string; data: string } }[] =
      [{ text: prompt }]
    for (const img of images) {
      parts.push({
        inline_data: { mime_type: img.mimeType, data: img.base64 },
      })
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig,
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      return new Response(JSON.stringify({ error: 'gemini', detail: errText }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    const json = await res.json()
    const text = extractText(json)
    if (!text || looksBroken(text)) {
      return new Response(
        JSON.stringify({
          error: 'empty_or_broken',
          raw: json?.candidates?.[0] || null,
        }),
        {
          status: 502,
          headers: { ...cors, 'Content-Type': 'application/json' },
        },
      )
    }
    return new Response(JSON.stringify({ text }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
