import { useEffect, useState } from 'react'
import {
  isVkEnvironment,
  resolveVkProfile,
  createVkProfile,
  createVkLinkCode,
  openTelegramForVkLink,
  getVkUserInfo,
} from '../lib/vk'
import { haptic } from '../hooks/useTelegramChrome'

/**
 * Экран входа через VK.
 * Если профиль найден по vk_id — зовёт onProfile(profile).
 * Если нет — предлагает: "У меня уже есть Telegram" (код) или "Создать новый профиль".
 */
export default function VkLink({ onProfile }) {
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('Проверяем профиль...')
  const [vkName, setVkName] = useState('')

  useEffect(() => {
    if (!isVkEnvironment()) {
      setStatus('error')
      setMessage('Откройте приложение через VK')
      return
    }
    async function run() {
      const userInfo = await getVkUserInfo()
      const fullName = [userInfo?.first_name, userInfo?.last_name].filter(Boolean).join(' ').trim()
      if (fullName) setVkName(fullName)

      const result = await resolveVkProfile()
      if (result.ok && result.profile) {
        haptic('success')
        const profile = result.profile
        if (fullName && !profile.full_name) {
          // Имя пришло из bridge, в базе пусто — обновим локально
          profile.full_name = fullName
        }
        onProfile?.(profile)
        return
      }
      // Профиль не найден — показываем выбор
      setStatus('choose')
      setMessage(fullName ? `Здравствуйте, ${fullName}!` : 'Здравствуйте!')
    }
    run()
  }, [])

  async function handleCreateNew() {
    setStatus('loading')
    setMessage('Создаём профиль...')
    const result = await createVkProfile()
    if (!result.ok) {
      haptic('error')
      setStatus('error')
      setMessage(result.error || 'Не удалось создать профиль')
      return
    }
    haptic('success')
    onProfile?.(result.profile)
  }

  async function handleConnectTelegram() {
    setStatus('loading')
    setMessage('Создаём одноразовую ссылку...')
    const result = await createVkLinkCode()
    if (!result.ok) {
      haptic('error')
      setStatus('choose')
      setMessage(result.error || 'Ошибка создания ссылки')
      return
    }
    haptic('light')
    setMessage('Открываем Telegram...')
    openTelegramForVkLink(result.code)
    setStatus('waiting_telegram')
    setMessage('Откройте Telegram и запустите бота. После привязки вернитесь сюда.')
  }

  return (
    <section className="stagger p-4 text-center flex min-h-screen flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold">
        {status === 'loading' ? '...' : status === 'choose' ? (vkName || 'Здравствуйте!') : 'VK'}
      </h2>
      <p
        className={`text-sm ${
          status === 'error'
            ? 'text-warning'
            : 'text-[var(--brand-muted)]'
        }`}
      >
        {message}
      </p>

      {status === 'choose' ? (
        <div className="flex flex-col items-center gap-3 mt-4 w-full max-w-[300px]">
          <p className="text-sm text-[var(--brand-muted)]">
            У вас уже есть аккаунт в Telegram-боте?
          </p>
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={handleConnectTelegram}
          >
            Да, привязать Telegram
          </button>
          <div className="w-full h-px bg-[var(--brand-divider)] my-2" />
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={handleCreateNew}
          >
            Нет, создать новый профиль
          </button>
        </div>
      ) : null}

      {status === 'waiting_telegram' ? (
        <div className="flex flex-col items-center gap-3 mt-4">
          <p className="text-xs text-[var(--brand-muted)] max-w-[260px]">
            После привязки в Telegram вернитесь в VK и обновите страницу.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.location.reload()}
          >
            Обновить
          </button>
        </div>
      ) : null}
    </section>
  )
}
