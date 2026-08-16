import { buildClientBookingLink, buildShareLine, BOT_USERNAME } from './inviteLinks'
import { buildPublicBookPageUrl } from './qr'

/** Шаблоны для bio / сторис / закрепа */
export function buildBioLine(businessName, businessSlug) {
  const link = buildClientBookingLink(businessSlug)
  const name = String(businessName || '').trim() || 'мне'
  return `Запись ко мне · ${name}\n${link}`
}

export function buildStoriesCaption(businessName, businessSlug) {
  const link = buildClientBookingLink(businessSlug)
  const name = String(businessName || '').trim() || 'нас'
  return `Свободные окна у «${name}» — жми и выбирай время, без переписки.\n${link}`
}

export function buildPinnedChatText(businessName, businessSlug) {
  return buildShareLine(businessName, businessSlug)
}

export function buildReferralStartLink(telegramId) {
  const id = Number(telegramId)
  if (!Number.isFinite(id) || id <= 0) {
    return `https://t.me/${BOT_USERNAME}?start=master`
  }
  return `https://t.me/${BOT_USERNAME}?start=ref_${id}`
}

/** Пригласить коллегу-мастера в сервис */
export function buildColleagueInviteLine(telegramId = null) {
  const link = buildReferralStartLink(telegramId)
  return `Открыл удобную запись в Telegram — клиент сам выбирает время, напоминания сами. Кабинет бесплатный. Если коллега потом подключит Pro — мне +14 дней Pro за рекомендацию.\nПопробуй: ${link}`
}

export function buildMasterOnboardDeepLink() {
  return `https://t.me/${BOT_USERNAME}?start=master`
}

export function growthCopyPack(businessName, businessSlug, telegramId = null) {
  return {
    bookingLink: buildClientBookingLink(businessSlug),
    landingUrl: buildPublicBookPageUrl(businessSlug),
    bio: buildBioLine(businessName, businessSlug),
    stories: buildStoriesCaption(businessName, businessSlug),
    pinned: buildPinnedChatText(businessName, businessSlug),
    colleague: buildColleagueInviteLine(telegramId),
    referralLink: buildReferralStartLink(telegramId),
  }
}
