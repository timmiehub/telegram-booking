import Icon from '../Icon'
import QuietStats from '../../screens/QuietStats'
import { haptic } from '../../hooks/useTelegramChrome'
import { getProPriceLabel } from '../../lib/pro'
import { assetUrl } from '../../lib/assets'

const CARDS = [
  {
    id: 'pro',
    title: 'Pro',
    hint: (isPro) =>
      isPro
        ? 'Поиск, тексты, ЧС, отчёт, шаблоны'
        : `Выше в поиске · ${getProPriceLabel()}`,
    icon: 'icon-star',
  },
  {
    id: 'profile',
    title: 'Профиль и адрес',
    hint: () => 'Название, город, адрес, аватар',
    icon: 'icon-settings',
  },
  {
    id: 'services',
    title: 'Услуги',
    hint: () => 'Список, цены, длительность',
    icon: 'icon-clock',
  },
  {
    id: 'schedule',
    title: 'Расписание',
    hint: () => 'Календарь и правила отмены',
    icon: 'icon-calendar',
  },
  {
    id: 'invite',
    title: 'Пригласить коллегу',
    hint: () => '+14 дней Pro вам, когда коллега подключит Pro',
    icon: 'icon-users',
  },
]

export default function SettingsHub({
  onOpen,
  isPro = false,
  masterId = null,
  businessId = null,
}) {
  return (
    <div className="settings-hub space-y-4">
      {masterId ? (
        <div className="settings-hub-stats">
          <QuietStats masterId={masterId} businessId={businessId} />
        </div>
      ) : null}

      <div className="space-y-2">
        {CARDS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`pressable settings-hub-card ${c.id === 'pro' && !isPro ? 'settings-hub-card--pro' : ''}`}
            onClick={() => {
              haptic('light')
              onOpen?.(c.id)
            }}
          >
            <span
              className={`settings-hub-icon ${c.id === 'pro' ? 'settings-hub-icon--pro' : ''}`}
              aria-hidden
            >
              {c.id === 'pro' ? (
                <img
                  src={assetUrl('pro-mark.svg')}
                  alt=""
                  width={22}
                  height={22}
                  className="settings-hub-pro-mark"
                />
              ) : (
                <Icon name={c.icon} size={22} />
              )}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="flex items-center gap-2">
                <span className="font-semibold">{c.title}</span>
                {c.id === 'pro' && isPro ? (
                  <span className="pro-badge is-compact">активен</span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--brand-muted)]">
                {typeof c.hint === 'function' ? c.hint(isPro) : c.hint}
              </span>
            </span>
            <Icon name="icon-chevron-right" size={18} className="shrink-0 opacity-50" />
          </button>
        ))}
      </div>
    </div>
  )
}
