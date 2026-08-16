/** Launch Pro (1 месяц до 01.09.2026) + тексты подарка. */

/** Кабинет, созданный до этой даты включительно (МСК), получает 1 месяц Pro. */
export const LAUNCH_PRO_CUTOFF_MS = Date.parse('2026-09-01T23:59:59.999+03:00')
export const LAUNCH_PRO_DAYS = 30

export const FEEDBACK_TG = 'timb2b_b2c'
export const FEEDBACK_TG_URL = `https://t.me/${FEEDBACK_TG}`

export const PRO_GIFT_COPY = {
  title: 'Pro на 1 месяц — вам',
  body:
    'Спасибо за доверие. Pro уже включён на месяц.\n\nЕсли хотите помочь улучшить приложение и получить ещё +3 месяца Pro — напишите @timb2b_b2c. Спасибо за обратную связь.',
  eyebrow: 'Подарок за ранний старт',
  pill: 'Pro · 1 месяц',
  cta: 'Отлично',
  tgCta: `Написать @${FEEDBACK_TG}`,
}

export function launchProGift() {
  return {
    reason: 'launch',
    ...PRO_GIFT_COPY,
  }
}

export function giftStorageKey(telegramId) {
  return `pro_gift_seen_${telegramId || 'anon'}_v2`
}

export function hasSeenProGift(telegramId) {
  try {
    return localStorage.getItem(giftStorageKey(telegramId)) === '1'
  } catch {
    return false
  }
}

export function markProGiftSeen(telegramId) {
  try {
    localStorage.setItem(giftStorageKey(telegramId), '1')
  } catch {
    // ignore
  }
}
