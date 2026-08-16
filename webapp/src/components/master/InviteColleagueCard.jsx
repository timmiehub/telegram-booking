import { buildColleagueInviteLine, buildReferralStartLink } from '../../lib/shareCopy'
import { haptic } from '../../hooks/useTelegramChrome'
import { WebApp } from '../../lib/telegram'

/** Реферальное приглашение коллеги — вынесено из вкладки «Ссылка» в «Ещё» */
export default function InviteColleagueCard({ onToast }) {
  const myTgId = WebApp.initDataUnsafe?.user?.id || null
  const colleagueLine = buildColleagueInviteLine(myTgId)
  const referralLink = buildReferralStartLink(myTgId)

  async function copy(text, message) {
    haptic('light')
    try {
      await navigator.clipboard.writeText(text)
      onToast?.(message)
      haptic('success')
    } catch {
      WebApp.showAlert?.(text)
    }
  }

  return (
    <div className="card px-4 py-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">Пригласите коллегу-мастера</p>
        <p className="mt-1 text-xs leading-snug text-[var(--brand-muted)]">
          +14 дней Pro вам, когда коллега подключит Pro. Кабинет для него бесплатный.
        </p>
      </div>
      <button
        type="button"
        className="btn btn-primary w-full"
        onClick={() => copy(colleagueLine, 'Текст для коллеги скопирован')}
      >
        Скопировать приглашение
      </button>
      <button
        type="button"
        className="btn btn-secondary w-full"
        onClick={() => copy(referralLink, 'Реф-ссылка скопирована')}
      >
        Только ссылка
      </button>
    </div>
  )
}
