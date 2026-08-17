import { useEffect, useState } from 'react'
import {
  isVkEnvironment,
  getTelegramIdFromVk,
  linkVkAccount,
  createVkLinkCode,
  openTelegramForVkLink,
  resolveOrCreateVkProfile,
} from '../lib/vk'
import { haptic } from '../hooks/useTelegramChrome'

export default function VkLink() {
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('Проверяем VK...')
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    if (!isVkEnvironment()) {
      setStatus('error')
      setMessage('Откройте приложение через VK Mini App')
      return
    }

    const tgId = getTelegramIdFromVk()
    if (tgId) {
      setStatus('linking')
      setMessage('Связываем VK и Telegram...')
      async function run() {
        const result = await linkVkAccount(tgId)
        if (result.ok) {
          haptic('success')
          setStatus('success')
          setMessage('VK подключён. Можно закрыть и вернуться в Telegram.')
        } else {
          haptic('error')
          setStatus('error')
          setMessage(result.error || 'Не удалось подключить VK')
        }
      }
      run()
      return
    }

    async function resolve() {
      const result = await resolveOrCreateVkProfile()
      if (!result.ok) {
        haptic('error')
        setStatus('error')
        setMessage(result.error || 'Не удалось войти через VK')
        return
      }
      haptic('success')
      setProfile(result.profile)
      setStatus('welcome')
      setMessage(`Добро пожаловать${result.profile?.full_name ? `, ${result.profile.full_name}` : ''}!`)
    }
    resolve()
  }, [])

  const handleConnectTelegram = async () => {
    setStatus('loading')
    setMessage('Создаём одноразовую ссылку...')
    const result = await createVkLinkCode()
    if (!result.ok) {
      haptic('error')
      setStatus('welcome')
      setMessage(result.error || 'Ошибка создания ссылки')
      return
    }
    haptic('light')
    setMessage('Открываем Telegram...')
    openTelegramForVkLink(result.code)
    setStatus('welcome')
  }

  return (
    <section className="stagger p-4 text-center flex min-h-screen flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold">
        {status === 'welcome' ? 'ВК вход' : 'VK'}
      </h2>
      <p
        className={`text-sm ${
          status === 'success'
            ? 'text-green-400'
            : status === 'error'
              ? 'text-warning'
              : 'text-[var(--brand-muted)]'
        }`}
      >
        {message}
      </p>
      {status === 'welcome' ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-xs text-[var(--brand-muted)]">
            {profile?.id ? `Профиль: ${profile.id.slice(0, 8)}` : ''}
          </p>
          <button
            type="button"
            className="btn btn-primary mt-2 min-w-[220px]"
            onClick={handleConnectTelegram}
          >
            Подключить Telegram
          </button>
          <p className="text-[10px] text-[var(--brand-muted)] max-w-[240px]">
            Чтобы записываться через Telegram, нажмите кнопку выше и запустите бота.
          </p>
        </div>
      ) : null}
    </section>
  )
}
