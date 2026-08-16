/**
 * Антибан Telegram: один процесс, лимиты ответов, стоп на 409/429.
 * Не слать пачками, не крутить retry при конфликте polling.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BOT_DIR = path.dirname(fileURLToPath(import.meta.url))
const LOCK_PATH = path.join(BOT_DIR, '.bot.pid')

/** Макс. исходящих сообщений бота одному чату за окно */
const CHAT_LIMIT = 8
const CHAT_WINDOW_MS = 60_000
/** Мин. пауза между ответами одному чату */
const CHAT_GAP_MS = 350
/** Не отвечать на «шум» чаще чем раз в N мс */
const FALLBACK_COOLDOWN_MS = 20_000

const chatBuckets = new Map()
const lastFallback = new Map()

function pruneBucket(bucket, now) {
  while (bucket.length && now - bucket[0] > CHAT_WINDOW_MS) bucket.shift()
}

export function acquireSingleInstanceLock() {
  try {
    if (fs.existsSync(LOCK_PATH)) {
      const prev = Number(String(fs.readFileSync(LOCK_PATH, 'utf8')).trim())
      if (prev && prev !== process.pid) {
        let alive = false
        try {
          process.kill(prev, 0)
          alive = true
        } catch {
          alive = false
        }
        if (alive) {
          console.error(
            `[ANTIBAN] Уже запущен бот pid=${prev}. Второй polling = 409 и риск блокировки.\n` +
              `Остановите старый процесс и запустите снова.`,
          )
          process.exit(1)
        }
      }
    }
    fs.writeFileSync(LOCK_PATH, String(process.pid), 'utf8')
  } catch (err) {
    console.error('[ANTIBAN] Не удалось взять .bot.pid lock:', err.message)
    process.exit(1)
  }

  const clear = () => {
    try {
      if (fs.existsSync(LOCK_PATH)) {
        const cur = Number(String(fs.readFileSync(LOCK_PATH, 'utf8')).trim())
        if (cur === process.pid) fs.unlinkSync(LOCK_PATH)
      }
    } catch {
      /* ignore */
    }
  }
  process.once('exit', clear)
  process.once('SIGINT', clear)
  process.once('SIGTERM', clear)
}

export function isConflictError(err) {
  const msg = String(err?.message || err || '')
  const code = err?.response?.error_code || err?.code
  return code === 409 || /409|Conflict|terminated by other getUpdates/i.test(msg)
}

export function isFloodError(err) {
  const msg = String(err?.message || err || '')
  const code = err?.response?.error_code || err?.code
  return code === 429 || /Too Many Requests|retry after/i.test(msg)
}

export function floodRetryAfterSec(err) {
  const retry =
    err?.response?.parameters?.retry_after ??
    err?.parameters?.retry_after ??
    Number((String(err?.message || '').match(/retry after (\d+)/i) || [])[1])
  return Number.isFinite(retry) && retry > 0 ? retry : 5
}

/** Можно ли ещё слать в этот чат (окно + gap). */
export function canSendToChat(chatId) {
  if (chatId == null) return false
  const key = String(chatId)
  const now = Date.now()
  const bucket = chatBuckets.get(key) || []
  pruneBucket(bucket, now)
  if (bucket.length >= CHAT_LIMIT) return false
  if (bucket.length && now - bucket[bucket.length - 1] < CHAT_GAP_MS) return false
  return true
}

function markSent(chatId) {
  const key = String(chatId)
  const now = Date.now()
  const bucket = chatBuckets.get(key) || []
  pruneBucket(bucket, now)
  bucket.push(now)
  chatBuckets.set(key, bucket)
}

/** Безопасный reply: при лимите/флуде — молчит, не долбит API. */
export async function safeReply(ctx, text, extra) {
  const chatId = ctx.chat?.id ?? ctx.from?.id
  if (!canSendToChat(chatId)) {
    console.warn(`[ANTIBAN] skip reply chat=${chatId} (rate limit)`)
    return null
  }
  try {
    const res = await ctx.reply(text, extra)
    markSent(chatId)
    return res
  } catch (err) {
    if (isFloodError(err)) {
      const wait = floodRetryAfterSec(err)
      console.warn(`[ANTIBAN] 429 flood, пауза ${wait}s (не ретраим пачкой)`)
      return null
    }
    if (isConflictError(err)) {
      console.error('[ANTIBAN] 409 Conflict — останавливаю процесс')
      process.exit(1)
    }
    throw err
  }
}

export async function safeAnswerCbQuery(ctx, text, extra) {
  try {
    return await ctx.answerCbQuery(text, extra)
  } catch (err) {
    // query too old / already answered — не эскалируем
    const msg = String(err?.message || '')
    if (/query is too old|query ID is invalid|already answered/i.test(msg)) {
      return null
    }
    if (isFloodError(err)) return null
    console.warn('answerCbQuery:', msg)
    return null
  }
}

/**
 * Редактировать текущее сообщение (живые кнопки).
 * Если нельзя — один safeReply, без второго дубля.
 */
export async function safeEditMessage(ctx, text, extra) {
  try {
    if (typeof ctx.editMessageText === 'function' && ctx.callbackQuery) {
      const res = await ctx.editMessageText(text, extra)
      return { ok: true, edited: true, res }
    }
  } catch (err) {
    const msg = String(err?.message || '')
    if (/message is not modified/i.test(msg)) {
      return { ok: true, edited: true, res: null }
    }
    if (isFloodError(err)) return { ok: false, edited: false }
    // слишком старое / нет текста — уйдём в reply ниже
    console.warn('editMessageText:', msg.slice(0, 120))
  }
  const res = await safeReply(ctx, text, extra)
  return { ok: Boolean(res), edited: false, res }
}

/** Fallback-ответ на неизвестный текст — не чаще раза в FALLBACK_COOLDOWN_MS. */
export function canSendFallback(chatId) {
  const key = String(chatId)
  const now = Date.now()
  const prev = lastFallback.get(key) || 0
  if (now - prev < FALLBACK_COOLDOWN_MS) return false
  if (!canSendToChat(chatId)) return false
  lastFallback.set(key, now)
  return true
}

/**
 * Middleware: при 429/409 не разгонять ответы.
 * handlerTimeout снижает зависшие handlers.
 */
export function antibanMiddleware() {
  return async (ctx, next) => {
    try {
      await next()
    } catch (err) {
      if (isConflictError(err)) {
        console.error('[ANTIBAN] 409 в middleware — exit')
        process.exit(1)
      }
      if (isFloodError(err)) {
        console.warn('[ANTIBAN] 429 в handler — глотаем, без повторной отправки')
        return
      }
      throw err
    }
  }
}

/** На старте: один раз снять webhook. Повторный dropPending — только через launch. */
export async function preparePolling(bot) {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true })
  } catch (err) {
    if (isConflictError(err)) {
      console.error('[ANTIBAN] Конфликт при deleteWebhook/getUpdates')
      process.exit(1)
    }
    throw err
  }
}

export function wireFatalPollingGuard(bot) {
  const stopHard = (reason, err) => {
    console.error(`[ANTIBAN] ${reason}:`, err?.message || err)
    try {
      bot.stop(reason)
    } catch {
      /* ignore */
    }
    process.exit(1)
  }

  bot.catch((err, ctx) => {
    if (isConflictError(err)) {
      stopHard('409 Conflict (двойной polling)', err)
      return
    }
    if (isFloodError(err)) {
      console.warn(
        `[ANTIBAN] 429 update=${ctx?.updateType} — без ответа пользователю`,
      )
      return
    }
    console.error(`Ошибка update ${ctx?.updateType}:`, err?.message || err)
    // НИКОГДА не ctx.reply из catch — цикл ошибок → бан
  })

  process.on('unhandledRejection', (err) => {
    if (isConflictError(err)) stopHard('unhandled 409', err)
    else if (isFloodError(err)) {
      console.warn('[ANTIBAN] unhandled 429:', err?.message || err)
    } else {
      console.error('unhandledRejection:', err)
    }
  })
}
