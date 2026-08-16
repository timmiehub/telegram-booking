import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import ReschedulePanel from '../components/ReschedulePanel'
import CancelBookingSheet from '../components/CancelBookingSheet'
import {
  fetchClientBookings,
  cancelClientBooking,
  fetchClientPastBookings,
  bookingModifyPolicy,
} from '../lib/bookings'
import { formatDayLabel, formatSlotLabel } from '../lib/slots'
import { statusLabel, kopecksToRub } from '../lib/analytics'
import { buildLateModifyMessage, openMasterChat } from '../lib/contacts'
import { haptic } from '../hooks/useTelegramChrome'
import { WebApp } from '../lib/telegram'

export default function MyBookings({
  masterId,
  businessId = null,
  businessSlug = null,
  onBack,
  onBookAgain,
}) {
  const [rows, setRows] = useState([])
  const [past, setPast] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState(null)
  const [rescheduleId, setRescheduleId] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelError, setCancelError] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [error, setError] = useState('')

  const tgId = WebApp.initDataUnsafe?.user?.id ?? null

  async function load() {
    setLoading(true)
    const [data, history] = await Promise.all([
      fetchClientBookings(masterId, tgId),
      fetchClientPastBookings(tgId, 5),
    ])
    setRows(data)
    setPast(history.filter((b) => b.master_id === masterId))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [masterId, tgId])

  async function onConfirmCancel(id) {
    setCancelError('')
    setError('')
    setPendingId(id)
    const result = await cancelClientBooking(id, tgId)
    setPendingId(null)
    if (!result.ok) {
      setCancelError(result.error || 'Не удалось отменить')
      return
    }
    setCancelTarget(null)
    haptic('success')
    await load()
  }

  async function writeMasterAbout(booking, intent = 'change') {
    if (!booking?.master_id) return
    setChatBusy(true)
    const policy = bookingModifyPolicy(booking)
    const msg = buildLateModifyMessage({
      serviceTitle: booking.services?.title || 'Услуга',
      day: formatDayLabel(new Date(booking.starts_at)),
      time: formatSlotLabel(new Date(booking.starts_at)),
      hours: policy.hours,
      intent,
    })
    await openMasterChat(booking.master_id, { message: msg })
    setChatBusy(false)
    haptic('light')
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="skeleton h-14" />
        <div className="skeleton h-14" />
      </div>
    )
  }

  const rescheduleBooking = rows.find((b) => b.id === rescheduleId)
  const cancelRow = cancelTarget ? rows.find((b) => b.id === cancelTarget) : null
  const cancelPolicy = cancelRow ? bookingModifyPolicy(cancelRow) : null

  return (
    <section className="stagger">
      <button
        type="button"
        className="mb-3 text-sm text-[var(--brand-muted)]"
        onClick={onBack}
      >
        ← Назад
      </button>
      <h2 className="mb-3 text-xl font-semibold">Мои записи</h2>
      {error ? <p className="mb-2 text-sm text-warning">{error}</p> : null}

      {rescheduleBooking ? (
        <ReschedulePanel
          booking={{ ...rescheduleBooking, master_id: masterId, client_telegram_id: tgId }}
          businessId={businessId || rescheduleBooking.business_id}
          onDone={() => {
            setRescheduleId(null)
            load()
          }}
          onCancel={() => setRescheduleId(null)}
        />
      ) : null}

      {!tgId ? (
        <p className="text-sm text-[var(--brand-muted)]">
          Откройте Mini App из Telegram, чтобы увидеть свои записи.
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          imageSrc="empty-day.svg"
          title="Пока пусто"
          text="Запишитесь на услугу — визит появится здесь."
          actionLabel="Записаться"
          onAction={onBack}
        />
      ) : (
        <ul className="tg-list">
          {rows.map((b) => {
            const start = new Date(b.starts_at)
            const canChange = b.status === 'pending' || b.status === 'confirmed'
            const policy = bookingModifyPolicy(b)
            return (
              <li key={b.id} className="tg-row flex-wrap gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {formatDayLabel(start)} · {formatSlotLabel(start)}
                  </p>
                  <p className="text-sm text-[var(--brand-muted)]">
                    {b.services?.title || 'Услуга'} · {statusLabel(b.status)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">{kopecksToRub(b.price_cents)} ₽</p>
                  {canChange && policy.allowed ? (
                    <div className="mt-1 flex flex-col gap-1">
                      <button
                        type="button"
                        className="text-xs text-[var(--brand-primary)]"
                        disabled={pendingId === b.id}
                        onClick={() => setRescheduleId(b.id)}
                      >
                        Перенести
                      </button>
                      <button
                        type="button"
                        className="text-xs text-[var(--brand-muted)]"
                        disabled={pendingId === b.id}
                        onClick={() => {
                          setCancelError('')
                          setCancelTarget(b.id)
                        }}
                      >
                        Отменить
                      </button>
                    </div>
                  ) : null}
                  {canChange && policy.blockedByTime ? (
                    <div className="mt-1 flex flex-col gap-1">
                      <button
                        type="button"
                        className="text-xs text-[var(--brand-primary)]"
                        disabled={chatBusy}
                        onClick={() => {
                          setCancelError('')
                          setCancelTarget(b.id)
                        }}
                      >
                        Написать исполнителю
                      </button>
                      <p className="text-[10px] text-[var(--brand-muted)]">
                        Лимит {policy.hours} ч
                      </p>
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {past.length > 0 && !rescheduleId ? (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold">Были раньше</p>
          <ul className="tg-list">
            {past.map((b) => (
              <li key={b.id} className="tg-row">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{b.services?.title || 'Услуга'}</p>
                  <p className="text-xs text-[var(--brand-muted)]">
                    {formatDayLabel(new Date(b.starts_at))}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    haptic('light')
                    onBookAgain?.({
                      serviceId: b.service_id || b.services?.id,
                      slug: businessSlug || b.businesses?.slug,
                    })
                  }}
                >
                  Снова
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <CancelBookingSheet
        open={!!cancelTarget}
        busy={pendingId === cancelTarget}
        chatBusy={chatBusy}
        error={cancelError}
        locked={Boolean(cancelPolicy?.blockedByTime)}
        hours={cancelPolicy?.hours ?? 24}
        bookingLabel={
          cancelRow
            ? `${cancelRow.services?.title || 'Услуга'} · ${formatDayLabel(new Date(cancelRow.starts_at))} ${formatSlotLabel(new Date(cancelRow.starts_at))}`
            : ''
        }
        onClose={() => {
          setCancelTarget(null)
          setCancelError('')
        }}
        onReschedule={() => {
          const id = cancelTarget
          setCancelTarget(null)
          setCancelError('')
          if (id) setRescheduleId(id)
        }}
        onConfirmCancel={() => cancelTarget && onConfirmCancel(cancelTarget)}
        onWriteMaster={() => cancelRow && writeMasterAbout(cancelRow, 'change')}
      />
    </section>
  )
}
