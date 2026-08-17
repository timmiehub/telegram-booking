import { useEffect, useState } from 'react'
import {
  isVkEnvironment,
  getTelegramIdFromVk,
  linkVkAccount,
  createVkLinkCode,
  openTelegramForVkLink,
} from '../lib/vk'
import { haptic } from '../hooks/useTelegramChrome'

export default function VkLink() {
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('Проверяем VK...')

  useEffect(() => {
    if (!isVkEnvironment()) {
      setStatus('error')
      setMessage('Откройте приложение через VK Mini App')
      return
    }

    const tgId = getTelegramIdFromVk()
    if (!tgId) {
      setStatus('connect')
      setMessage('Это Mini App. Запустите бота и нажмите кнопку приложения.')
      return
    }

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
  }, [])

  const handleConnectTelegram = async () => {
    setStatus('loading')
    setMessage('Создаём одноразовую ссылку...')
    const result = await createVkLinkCode()
    if (!result.ok) {
      haptic('error')
      setStatus('error')
      setMessage(result.error || 'Ошибка создания ссылки')
      return
    }
    haptic('light')
    setStatus('success')
    setMessage('Открываем Telegram...')
    openTelegramForVkLink(result.code)
  }

  return (
    <section className="stagger p-4 text-center flex min-h-screen flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold">{status === 'connect' ? 'Подключение Telegram' : 'VK'}</h2>
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
      {status === 'connect' ? (
        <button
          type="button"
          className="btn btn-primary mt-6 min-w-[220px]"
          onClick={handleConnectTelegram}
        >
          Подключить Telegram
        </button>
      ) : null}
    </section>
  )
}
