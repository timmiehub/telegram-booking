import { useState } from 'react'
import AppShell from '../components/AppShell'
import FeatureHighlights from '../components/FeatureHighlights'
import Icon from '../components/Icon'
import { assetUrl } from '../lib/assets'
import { haptic } from '../hooks/useTelegramChrome'

/**
 * Первый экран: highlights сверху, затем выбор роли.
 */
export default function RoleGate({ userName, onPickClient, onPickMaster }) {
  const [storiesOpen, setStoriesOpen] = useState(false)

  return (
    <AppShell className={`role-gate fade-up${storiesOpen ? ' role-gate--stories-open' : ''}`}>
      <div className="role-gate-inner">
        <FeatureHighlights onOpenChange={setStoriesOpen} />

        <img
          src={assetUrl('hero-gate-v3.png')}
          alt=""
          className="role-gate-hero fade-up"
          width={220}
          height={220}
        />
        <p className="meta-label">Онлайн-запись</p>
        <h1 className="display mt-2 text-[26px] font-extrabold leading-tight">
          Кто вы?
        </h1>
        <p className="mt-2 max-w-[18rem] text-sm leading-snug text-[var(--brand-muted)]">
          {userName ? `${userName}, выберите` : 'Выберите'} роль — клиент или мастер.
          Сверху — коротко, что умеем и что даёт Pro.
        </p>

        <div className="mt-6 flex flex-col gap-3 stagger">
          <button
            type="button"
            className="pressable role-gate-btn role-gate-btn-primary"
            onClick={() => {
              haptic('medium')
              onPickClient?.()
            }}
          >
            <span className="role-gate-btn-row">
              <span className="role-gate-btn-icon">
                <Icon name="icon-client" size={22} />
              </span>
              <span className="role-gate-btn-text">
                <span className="role-gate-btn-title">Я клиент</span>
                <span className="role-gate-btn-hint">Мои записи и запись к мастеру</span>
              </span>
              <Icon name="icon-chevron-right" size={18} className="opacity-70" />
            </span>
          </button>
          <button
            type="button"
            className="pressable role-gate-btn"
            onClick={() => {
              haptic('medium')
              onPickMaster?.()
            }}
          >
            <span className="role-gate-btn-row">
              <span className="role-gate-btn-icon">
                <Icon name="icon-master" size={22} />
              </span>
              <span className="role-gate-btn-text">
                <span className="role-gate-btn-title">Я мастер</span>
                <span className="role-gate-btn-hint">Кабинет, ссылка, день</span>
              </span>
              <Icon name="icon-chevron-right" size={18} className="opacity-70" />
            </span>
          </button>
        </div>
        <p className="mt-6 text-center text-xs text-[var(--brand-muted)]">
          Роль можно сменить внизу любого экрана.
        </p>
      </div>
    </AppShell>
  )
}
