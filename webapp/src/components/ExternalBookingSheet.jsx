import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../hooks/useTelegramChrome'
import { WebApp } from '../lib/telegram'
import { createExternalBooking, EXTERNAL_BOT_DEEPLINK } from '../lib/bookings'
import { formatSlotLabel } from '../lib/slots'

function defaultDateValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function defaultTimeValue() {
  const d = new Date()
  d.setMinutes(d.getMinutes() + 60 - (d.getMinutes() % 15))
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ExternalBookingSheet({
  open,
  masterId,
  businessId = null,
  onClose,
  onSaved,
}) {
  const [source, setSource] = useState('')
  const [dateValue, setDateValue] = useState(defaultDateValue)
  const [timeValue, setTimeValue] = useState(defaultTimeValue)
  const [durationMin, setDurationMin] = useState(60)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setSource('')
    setDateValue(defaultDateValue())
    setTimeValue(defaultTimeValue())
    setDurationMin(60)
    setError('')
    setBusy(false)
  }, [open])

  const previewWhen = useMemo(() => {
    if (!dateValue || !timeValue) return ''
    const [y, m, d] = dateValue.split('-').map(Number)
    const [hh, mm] = timeValue.split(':').map(Number)
    const dt = new Date(y, m - 1, d, hh, mm, 0, 0)
    if (Number.isNaN(dt.getTime())) return ''
    return formatSlotLabel(dt)
  }, [dateValue, timeValue])

  function openBotSeries() {
    haptic('light')
    try {
      if (WebApp.openTelegramLink) {
        WebApp.openTelegramLink(EXTERNAL_BOT_DEEPLINK)
      } else {
        window.open(EXTERNAL_BOT_DEEPLINK, '_blank', 'noopener,noreferrer')
      }
    } catch {
      window.open(EXTERNAL_BOT_DEEPLINK, '_blank', 'noopener,noreferrer')
    }
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!masterId) return
    setError('')
    setBusy(true)

    const [y, m, d] = dateValue.split('-').map(Number)
    const [hh, mm] = timeValue.split(':').map(Number)
    const startsAt = new Date(y, m - 1, d, hh, mm, 0, 0)

    const result = await createExternalBooking({
      masterId,
      businessId,
      source,
      startsAt,
      durationMin,
    })

    setBusy(false)
    if (!result.ok) {
      setError(result.error || 'Не удалось добавить')
      return
    }

    haptic('success')
    onSaved?.(result.booking)
    onClose?.()
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="sheet-backdrop" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="sheet-panel"
        role="dialog"
        aria-label="Сторонняя запись"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden />
        <h2 className="text-lg font-semibold">Запись из другого сервиса</h2>
        <p className="mt-1 text-sm text-[var(--brand-muted)]">
          YClients, Google Calendar, звонок — слот сразу займётся в расписании.
        </p>

        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="text-[var(--brand-muted)]">Откуда / клиент</span>
            <input
              className="input mt-1 w-full"
              placeholder="YClients, Артём, звонок…"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              maxLength={60}
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-[var(--brand-muted)]">Дата</span>
              <input
                type="date"
                className="input mt-1 w-full"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--brand-muted)]">Время</span>
              <input
                type="time"
                className="input mt-1 w-full"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                required
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-[var(--brand-muted)]">Длительность</span>
            <select
              className="input mt-1 w-full"
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
            >
              <option value={30}>30 мин</option>
              <option value={60}>60 мин</option>
              <option value={90}>90 мин</option>
            </select>
          </label>

          {previewWhen ? (
            <p className="text-sm text-[var(--brand-muted)]">
              Будет: <span className="text-[var(--brand-text)]">{previewWhen}</span>
            </p>
          ) : null}

          {error ? <p className="text-sm text-warning">{error}</p> : null}

          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? 'Добавляю…' : 'Добавить запись'}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-secondary w-full mt-2"
          disabled={busy}
          onClick={openBotSeries}
        >
          Несколько дат сразу — в боте
        </button>

        <button type="button" className="btn btn-secondary w-full mt-2" disabled={busy} onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>,
    document.body,
  )
}
