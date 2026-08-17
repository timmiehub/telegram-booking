import { useEffect, useState } from 'react'
import { isVkEnvironment, getTelegramIdFromHash, linkVkAccount } from '../lib/vk'
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

    const tgId = getTelegramIdFromHash()
    if (!tgId) {
      setStatus('error')
      setMessage('Не удалось определить Telegram ID. Откройте ссылку из Telegram.')
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

  return (
    <section className="stagger p-4 text-center">
      <h2 className="text-xl font-semibold mb-3">Подключение VK</h2>
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
    </section>
  )
}
