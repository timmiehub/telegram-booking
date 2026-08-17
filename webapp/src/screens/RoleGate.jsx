import { useState } from 'react'
import AppShell from '../components/AppShell'
import FeatureHighlights from '../components/FeatureHighlights'
import Icon from '../components/Icon'
import { assetUrl } from '../lib/assets'
import { haptic } from '../hooks/useTelegramChrome'
import { createVkLinkCode, openTelegramForVkLink } from '../lib/vk'

export default function RoleGate({
  userName,
  profile = null,
  onPickClient,
  onPickMaster,
}) {
  const [storiesOpen, setStoriesOpen] = useState(false)
  const [linkStatus, setLinkStatus] = useState('')

  const isVk = Boolean(profile?.vk_id)
  const isVkOnly = Boolean(profile?.vk_id && !profile?.telegram_id)

  async function handleConnectTelegram() {
    setLinkStatus('Создаём ссылку...')
    const result = await createVkLinkCode()
    if (!result.ok) {
      haptic('error')
      setLinkStatus('Не удалось создать ссылку')
      return
    }
    haptic('light')
    openTelegramForVkLink(result.code)
    setLinkStatus('Откройте Telegram и запустите бота. После запуска обновите страницу.')
  }

  return (
    <AppShell className={`role-gate fade-up${storiesOpen ? ' role-gate--stories-open' : ''}`}>
      <div className="role-gate-inner">
        <FeatureHighlights onOpenChange={setStoriesOpen} />

        <img
          src={assetUrl('hero-brand.svg')}
          alt=""
          className="role-gate-hero fade-up"
          width={200}
          height={200}
        />
        <p className="meta-label">Онлайн-запись</p>
        <h1 className="display mt-2 text-[30px] leading-[1.05]">
          Кто вы?
        </h1>
        <p className="mt-2 max-w-[18rem] text-sm leading-snug text-[var(--brand-muted)]">
          {userName ? `${userName}, выберите` : 'Выберите'} роль — клиент или мастер.
          Сверху — коротко, что умеем и что даёт Pro.
        </p>

        {isVk ? (
          <div className="mt-4 flex flex-col gap-2 w-full max-w-[300px]">
            <div className="card px-3 py-3 text-center">
              {isVkOnly ? (
                <>
                  <p className="text-xs text-[var(--brand-muted)]">
                    Это профиль ВК. Чтобы подтянуть кабинет/записи из Telegram:
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary w-full mt-2"
                    onClick={handleConnectTelegram}
                  >
                    Подключить Telegram
                  </button>
                </>
              ) : (
                <p className="text-xs text-[var(--brand-muted)]">
                  Telegram подключён. Для кабинета мастера нажмите «Я мастер» ниже.
                </p>
              )}
              {linkStatus ? (
                <p className="text-xs text-[var(--brand-muted)] text-center mt-2">
                  {linkStatus}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-3 stagger">
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

          {isVkOnly ? (
            <div className="flex flex-col gap-2 mt-2">
              <p className="text-xs text-[var(--brand-muted)] text-center">
                Это профиль ВК. Чтобы подтянуть кабинет/записи из Telegram:
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConnectTelegram}
              >
                Подключить Telegram
              </button>
              {linkStatus ? (
                <p className="text-xs text-[var(--brand-muted)] text-center">
                  {linkStatus}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="mt-6 text-center text-xs text-[var(--brand-muted)]">
          Роль можно сменить внизу любого экрана.
        </p>
      </div>
    </AppShell>
  )
}
