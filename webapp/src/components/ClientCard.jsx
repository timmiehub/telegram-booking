import { useEffect, useState } from 'react'
import { fetchClientStats, upsertClientNote, setClientBlocked } from '../lib/clientNotes'
import { openClientChat } from '../lib/contacts'
import { formatDayLabel } from '../lib/slots'
import { haptic } from '../hooks/useTelegramChrome'
import { WebApp } from '../lib/telegram'

export default function ClientCard({
  masterId,
  clientTelegramId,
  onClose,
  isPro = false,
  onOpenPro,
}) {
  const [stats, setStats] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [writeBusy, setWriteBusy] = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!masterId || !clientTelegramId) return
      const s = await fetchClientStats(masterId, clientTelegramId)
      if (!cancelled) {
        setStats(s)
        setNoteDraft(s.note || '')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [masterId, clientTelegramId])

  async function onSaveNote() {
    setBusy(true)
    setSaved(false)
    const res = await upsertClientNote(masterId, clientTelegramId, { note: noteDraft })
    setBusy(false)
    if (res.ok) {
      haptic('success')
      setSaved(true)
      setStats((prev) => ({ ...prev, note: noteDraft }))
    }
  }

  async function onWrite() {
    setWriteBusy(true)
    haptic('light')
    const res = await openClientChat(clientTelegramId)
    setWriteBusy(false)
    if (!res.ok && res.error && res.error !== 'Нет username') {
      WebApp.showAlert?.(res.error)
    }
  }

  async function onToggleBlock() {
    if (!isPro) {
      onOpenPro?.()
      return
    }
    setBlockBusy(true)
    const next = !stats?.is_blocked
    const res = await setClientBlocked(masterId, clientTelegramId, next)
    setBlockBusy(false)
    if (!res.ok) {
      WebApp.showAlert?.(res.error || 'Не удалось')
      return
    }
    setStats((prev) => ({ ...prev, is_blocked: next }))
    haptic('success')
  }

  if (!clientTelegramId) return null

  return (
    <div className="client-card-overlay" role="dialog" aria-modal="true">
      <div className="client-card">
        <div className="client-card-head">
          <h3 className="text-lg font-semibold">
            {stats?.display_name || `Клиент ${clientTelegramId}`}
          </h3>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="client-card-stats">
          <div>
            <p className="meta-label">Визитов</p>
            <p className="text-xl font-semibold">{stats?.visits ?? '—'}</p>
          </div>
          <div>
            <p className="meta-label">Неявок</p>
            <p className="text-xl font-semibold">{stats?.no_show_count ?? 0}</p>
          </div>
          <div>
            <p className="meta-label">Последний визит</p>
            <p className="text-sm font-medium">
              {stats?.lastVisit ? formatDayLabel(new Date(stats.lastVisit)) : '—'}
            </p>
          </div>
        </div>

        <label className="field-block mt-3">
          <span className="meta-label">Заметка</span>
          <textarea
            className="field ai-draft"
            rows={3}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Предпочтения, аллергии…"
          />
        </label>
        <button
          type="button"
          className="btn btn-secondary w-full mt-2"
          disabled={busy}
          onClick={onSaveNote}
        >
          {busy ? 'Сохраняю…' : saved ? 'Сохранено' : 'Сохранить заметку'}
        </button>

        <button
          type="button"
          className="btn btn-primary w-full mt-3"
          disabled={writeBusy}
          onClick={onWrite}
        >
          {writeBusy ? 'Открываю…' : 'Написать в Telegram'}
        </button>

        <button
          type="button"
          className="btn btn-ghost w-full mt-2"
          disabled={blockBusy}
          onClick={onToggleBlock}
        >
          {blockBusy
            ? '…'
            : !isPro
              ? 'Чёрный список · Pro'
              : stats?.is_blocked
                ? 'Снять из чёрного списка'
                : 'В чёрный список'}
        </button>
      </div>
    </div>
  )
}
