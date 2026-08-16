import { useEffect, useMemo, useRef, useState } from 'react'
import EmptyState from '../components/EmptyState'
import ClientCard from '../components/ClientCard'
import ConfirmActionSheet from '../components/ConfirmActionSheet'
import ExternalBookingSheet from '../components/ExternalBookingSheet'
import AgendaMonthSheet from '../components/AgendaMonthSheet'
import Icon from '../components/Icon'
import { fetchDayBookings, attachClientLabels } from '../lib/bookings'
import {
  BOOKING_DAY_HORIZON,
  dayOffset,
  daysBetween,
  formatDayLabel,
  formatSlotLabel,
  sameDay,
  startOfDay,
} from '../lib/slots'
import { statusLabel, updateBookingStatus, kopecksToRub } from '../lib/analytics'
import { haptic } from '../hooks/useTelegramChrome'

function statusClass(status) {
  if (status === 'pending') return 'pending'
  if (status === 'confirmed') return 'confirmed'
  if (status === 'completed') return 'completed'
  if (status === 'no_show') return 'no_show'
  if (String(status).startsWith('cancelled')) return 'cancelled_by_master'
  return 'pending'
}

function dayChipLabel(offset) {
  if (offset === 0) return 'Сегодня'
  if (offset === 1) return 'Завтра'
  if (offset === -1) return 'Вчера'
  const d = dayOffset(offset)
  return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })
}

function outsideChipLabel(date) {
  const today = startOfDay(new Date())
  const offset = daysBetween(today, date)
  if (offset === -1) return 'Вчера'
  if (offset === 0) return 'Сегодня'
  if (offset === 1) return 'Завтра'
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  })
}

function visitLabel(b) {
  const title = b.external_source || b.services?.title || 'Услуга'
  return `${title} · ${formatSlotLabel(new Date(b.starts_at))}`
}

export default function TodayAgenda({
  masterId,
  businessId = null,
  onOpenHotSlots,
  onRefreshStats,
  isPro = false,
  onOpenPro,
}) {
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState(null)
  const [error, setError] = useState('')
  const [clientCardId, setClientCardId] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [externalOpen, setExternalOpen] = useState(false)
  const stripRef = useRef(null)
  const selectedChipRef = useRef(null)

  const today = useMemo(() => startOfDay(new Date()), [])
  const dayIdx = useMemo(
    () => daysBetween(today, selectedDate),
    [today, selectedDate],
  )
  const inHorizon = dayIdx >= 0 && dayIdx < BOOKING_DAY_HORIZON
  const dayChips = useMemo(
    () => Array.from({ length: BOOKING_DAY_HORIZON }, (_, i) => i),
    [],
  )
  const isToday = sameDay(selectedDate, today)

  async function load(forDay = selectedDate) {
    setLoading(true)
    const rows = await fetchDayBookings(masterId, forDay)
    const withClients = await attachClientLabels(rows)
    setItems(withClients)
    setLoading(false)
  }

  useEffect(() => {
    if (!masterId) return
    load(selectedDate)
  }, [masterId, selectedDate])

  useEffect(() => {
    if (!selectedChipRef.current) return
    selectedChipRef.current.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [selectedDate])

  function selectOffset(offset) {
    haptic('light')
    setSelectedDate(dayOffset(offset))
  }

  function selectDate(date) {
    setSelectedDate(startOfDay(date))
    setCalendarOpen(false)
  }

  async function changeStatus(id, status) {
    setError('')
    setPendingId(id)
    const result = await updateBookingStatus(id, status, { masterId })
    setPendingId(null)
    setConfirm(null)
    if (!result.ok) {
      setError(result.error || 'Не удалось обновить')
      return
    }
    haptic('success')
    await load(selectedDate)
    onRefreshStats?.()
  }

  function askConfirm(booking, status) {
    const label = visitLabel(booking)
    if (status === 'no_show') {
      setConfirm({
        id: booking.id,
        status,
        title: 'Клиент не пришёл?',
        text: `${label}\nЗапись отметится как неявка.`,
        confirmLabel: 'Да, не пришёл',
        danger: true,
      })
      return
    }
    if (status === 'cancelled_by_master') {
      setConfirm({
        id: booking.id,
        status,
        title: 'Отменить запись?',
        text: `${label}\nКлиент получит уведомление.`,
        confirmLabel: 'Да, отменить',
        danger: true,
      })
      return
    }
    if (status === 'completed') {
      setConfirm({
        id: booking.id,
        status,
        title: 'Клиент пришёл?',
        text: label,
        confirmLabel: 'Да, пришёл',
        danger: false,
      })
      return
    }
    changeStatus(booking.id, status)
  }

  return (
    <div className="stagger space-y-3">
      <div className="day-strip" role="tablist" aria-label="Дни" ref={stripRef}>
        <button
          type="button"
          className="pressable day-chip day-chip--calendar"
          aria-label="Календарь"
          onClick={() => {
            haptic('light')
            setCalendarOpen(true)
          }}
        >
          <Icon name="icon-calendar" size={20} />
        </button>

        {!inHorizon ? (
          <button
            type="button"
            role="tab"
            aria-selected
            ref={selectedChipRef}
            className="pressable day-chip day-chip--label is-selected"
            onClick={() => haptic('light')}
          >
            {outsideChipLabel(selectedDate)}
          </button>
        ) : null}

        {dayChips.map((i) => {
          const selected = inHorizon && dayIdx === i
          return (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={selected}
              ref={selected ? selectedChipRef : undefined}
              className={`pressable day-chip day-chip--label ${
                selected ? 'is-selected' : ''
              }`}
              onClick={() => selectOffset(i)}
            >
              {dayChipLabel(i)}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className="btn btn-secondary w-full text-sm"
        onClick={() => {
          haptic('light')
          setExternalOpen(true)
        }}
      >
        + Из YClients / другого сервиса
      </button>

      <p className="text-sm text-[var(--brand-muted)]">
        {formatDayLabel(selectedDate)}
        {!loading && items.length
          ? ` · ${items.length} ${items.length === 1 ? 'визит' : items.length < 5 ? 'визита' : 'визитов'}`
          : ''}
      </p>

      {error ? <p className="text-sm text-warning">{error}</p> : null}

      {loading ? (
        <div className="space-y-2">
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          imageSrc="empty-day.svg"
          title={isToday ? 'Сегодня свободно' : 'В этот день свободно'}
          text={
            isToday
              ? 'Отправьте ссылку клиентам — они сами выберут время.'
              : 'Переключите день или поделитесь ссылкой.'
          }
          actionLabel="Поделиться ссылкой"
          onAction={onOpenHotSlots}
        />
      ) : (
        items.map((b) => {
          const isExternal = Boolean(b.external_source)
          const title = isExternal
            ? b.external_source
            : b.services?.title || 'Услуга'
          return (
            <article key={b.id} className="visit-card fade-up px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="visit-time">
                    {formatSlotLabel(new Date(b.starts_at))}
                  </p>
                  <p className="mt-2 truncate text-sm font-semibold text-[var(--brand-text)]">
                    {title}
                  </p>
                  {isExternal ? (
                    <p className="mt-1 text-xs text-[var(--brand-muted)]">
                      Сторонняя запись
                    </p>
                  ) : null}
                  {!isExternal && b.client_telegram_id ? (
                    <button
                      type="button"
                      className="mt-1 text-xs text-[var(--brand-primary)]"
                      onClick={() => {
                        haptic('light')
                        setClientCardId(b.client_telegram_id)
                      }}
                    >
                      {b.client_label || 'Клиент'} →
                    </button>
                  ) : null}
                  <span className={`status-chip mt-2 ${statusClass(b.status)}`}>
                    {statusLabel(b.status)}
                  </span>
                </div>
                {!isExternal ? (
                  <p className="shrink-0 text-lg font-semibold">
                    {kopecksToRub(b.price_cents)} ₽
                  </p>
                ) : null}
              </div>
              {(b.status === 'pending' || b.status === 'confirmed') && (
                <div className="visit-actions">
                  {!isExternal && b.status === 'pending' ? (
                    <button
                      type="button"
                      className="primary"
                      disabled={pendingId === b.id}
                      onClick={() => changeStatus(b.id, 'confirmed')}
                    >
                      Подтвердить
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary"
                      disabled={pendingId === b.id}
                      onClick={() => askConfirm(b, 'completed')}
                    >
                      Пришёл
                    </button>
                  )}
                  {!isExternal ? (
                    <button
                      type="button"
                      disabled={pendingId === b.id}
                      onClick={() => askConfirm(b, 'no_show')}
                    >
                      Не пришёл
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={pendingId === b.id}
                    onClick={() => askConfirm(b, 'cancelled_by_master')}
                  >
                    Отменить
                  </button>
                </div>
              )}
            </article>
          )
        })
      )}

      {clientCardId ? (
        <ClientCard
          masterId={masterId}
          clientTelegramId={clientCardId}
          isPro={isPro}
          onOpenPro={onOpenPro}
          onClose={() => setClientCardId(null)}
        />
      ) : null}

      <ConfirmActionSheet
        open={!!confirm}
        title={confirm?.title}
        text={confirm?.text}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
        busy={pendingId === confirm?.id}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && changeStatus(confirm.id, confirm.status)}
      />

      <AgendaMonthSheet
        open={calendarOpen}
        masterId={masterId}
        selectedDate={selectedDate}
        onClose={() => setCalendarOpen(false)}
        onSelect={selectDate}
      />

      <ExternalBookingSheet
        open={externalOpen}
        masterId={masterId}
        businessId={businessId}
        onClose={() => setExternalOpen(false)}
        onSaved={() => {
          load(selectedDate)
          onRefreshStats?.()
        }}
      />
    </div>
  )
}
