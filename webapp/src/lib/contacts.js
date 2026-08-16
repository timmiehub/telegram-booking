import { supabase } from './supabase'
import { WebApp } from './telegram'

/**
 * Открыть чат с мастером в Telegram (по username).
 * Fallback: бот с pre-filled текстом.
 */
export async function openMasterChat(masterId, { message = '' } = {}) {
  if (!masterId || !supabase) return { ok: false, error: 'Нет данных' }

  const { data, error } = await supabase
    .from('profiles')
    .select('username, full_name')
    .eq('id', masterId)
    .maybeSingle()

  if (error) {
    return { ok: false, error: error.message }
  }

  const username = String(data?.username || '').replace(/^@/, '').trim()
  if (username) {
    const base = `https://t.me/${username}`
    const url = message ? `${base}?text=${encodeURIComponent(message)}` : base
    try {
      if (WebApp.openTelegramLink) {
        WebApp.openTelegramLink(url)
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  const bot = 'booking_inapp_bot'
  const text = message || 'Здравствуйте! Хочу согласовать запись.'
  const url = `https://t.me/${bot}?start=chat`
  try {
    if (WebApp.openTelegramLink) {
      WebApp.openTelegramLink(url)
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
    return { ok: true, fallback: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export function buildLateModifyMessage({
  serviceTitle,
  day,
  time,
  hours,
  intent = 'change',
} = {}) {
  const parts = [
    intent === 'cancel'
      ? 'Здравствуйте! Хочу отменить запись.'
      : intent === 'reschedule'
        ? 'Здравствуйте! Хочу перенести запись.'
        : 'Здравствуйте! Хочу обсудить отмену или перенос записи.',
  ]
  if (serviceTitle) parts.push(`Услуга: ${serviceTitle}.`)
  if (day && time) parts.push(`Сейчас записан на: ${day} ${time}.`)
  if (hours != null) {
    parts.push(`В приложении уже нельзя менять (лимит ${hours} ч).`)
  }
  parts.push('Подскажите, пожалуйста, как лучше поступить.')
  return parts.join(' ')
}

export function buildRescheduleMessage({ serviceTitle, day, time }) {
  const parts = ['Здравствуйте! Перенёс запись.']
  if (serviceTitle) parts.push(`Услуга: ${serviceTitle}.`)
  if (day && time) parts.push(`Новое время: ${day} ${time}.`)
  parts.push('Подтвердите, пожалуйста.')
  return parts.join(' ')
}

function openTelegramUrl(url) {
  if (WebApp.openTelegramLink) {
    WebApp.openTelegramLink(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/**
 * Открыть чат с клиентом по telegram_id (через @username из profiles).
 */
export async function openClientChat(clientTelegramId, { message = '' } = {}) {
  if (!clientTelegramId || !supabase) {
    return { ok: false, error: 'Нет данных клиента' }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('username, full_name')
    .eq('telegram_id', clientTelegramId)
    .maybeSingle()

  if (error) {
    return { ok: false, error: error.message }
  }

  const username = String(data?.username || '').replace(/^@/, '').trim()
  if (username) {
    const base = `https://t.me/${username}`
    const url = message ? `${base}?text=${encodeURIComponent(message)}` : base
    try {
      openTelegramUrl(url)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  if (message) {
    try {
      await navigator.clipboard.writeText(message)
    } catch {
      // ignore
    }
    WebApp.showAlert?.(
      'У клиента нет @username в Telegram. Текст скопирован — найдите клиента в «Недавние» и вставьте сообщение.',
    )
    return { ok: true, fallback: 'clipboard' }
  }

  WebApp.showAlert?.(
    'У клиента нет @username. Найдите его в списке «Недавние» в Telegram или попросите написать вам первым.',
  )
  return { ok: false, error: 'Нет username' }
}
