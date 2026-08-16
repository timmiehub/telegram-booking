import { useState } from 'react'
import AppShell from '../components/AppShell'
import { TextField } from '../components/Fields'
import { joinBusinessByInvite } from '../lib/team'
import { haptic, useTelegramChrome } from '../hooks/useTelegramChrome'

export default function JoinTeam({
  profileId,
  initialCode = '',
  btnClass = 'btn btn-primary',
  onDone,
  onCancel,
}) {
  const [code, setCode] = useState(String(initialCode || '').toUpperCase())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useTelegramChrome({
    mainVisible: false,
    backVisible: true,
    onBack: onCancel,
  })

  async function onJoin() {
    if (!profileId) {
      setError('Откройте приложение из Telegram')
      return
    }
    setBusy(true)
    setError('')
    const res = await joinBusinessByInvite({
      code,
      profileId,
      title: 'Мастер',
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error || 'Не удалось вступить')
      return
    }
    haptic('success')
    onDone?.(res.business)
  }

  return (
    <AppShell>
      <div className="fade-up space-y-4">
        <div>
          <p className="meta-label">Команда</p>
          <h1 className="display mt-1 text-2xl font-extrabold">Вступить в кабинет</h1>
          <p className="mt-2 text-sm text-[var(--brand-muted)]">
            Введите код от владельца — станете мастером в его заведении.
          </p>
        </div>

        <TextField
          label="Код приглашения"
          value={code}
          onChange={(v) => setCode(String(v || '').toUpperCase())}
          placeholder="ABC123"
          maxLength={12}
        />

        {error ? <p className="text-sm text-warning">{error}</p> : null}

        <button
          type="button"
          className={`${btnClass} w-full`}
          disabled={busy || code.trim().length < 4}
          onClick={onJoin}
        >
          {busy ? '…' : 'Вступить'}
        </button>

        <button
          type="button"
          className="w-full text-center text-sm text-[var(--brand-muted)]"
          onClick={onCancel}
        >
          Отмена
        </button>
      </div>
    </AppShell>
  )
}
