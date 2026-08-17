import { useEffect, useMemo, useState } from 'react'
import {
  buildDaySlots,
  bookingDayRange,
  BOOKING_DAY_HORIZON,
  formatDayLabel,
  formatSlotLabel,
  rescheduleBooking,
} from '../lib/slots'
import { bookingAllowsReschedule, bookingModifyPolicy } from '../lib/bookings'
import { fetchBusinessSettings } from '../lib/settings'
import { buildLateModifyMessage, buildRescheduleMessage, openMasterChat } from '../lib/contacts'
import { haptic } from '../hooks/useTelegramChrome'

function dayChipParts(day, index) {
  const num = day.getDate()
  const weekday = day.toLocaleDateString('ru-RU', { weekday: 'short' })
  let hint = weekday
  if (index === 0) hint = 'сегодня'
  else if (index === 1) hint = 'завтра'
  return { num, hint }
}

export default function ReschedulePanel({
  booking,
  businessId,
  masterId: masterIdProp,
  onDone,
  onCancel,
}) {
  const [settings, setSettings] = useState({ reschedule_min_hours: 24 })
  const [dayIndex, setDayIndex] = useState(0)
  const [slots, setSlots] = useState([])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)
  const [chatBusy, setChatBusy] = useState(false)

  const masterId = masterIdProp || booking.master_id
  const service = booking.services || {}
  const duration = service.duration_min || 60
  const buffer = service.buffer_min || 0
  const days = useMemo(() => bookingDayRange(BOOKING_DAY_HORIZON), [])

  const policy = bookingModifyPolicy({
    ...booking,
    businesses: {
      ...(booking.businesses || {}),
      settings: booking.businesses?.settings || settings,
    },
  })
  const allowed = policy.allowed
  const limitHours = policy.hours

  useEffect(() => {
    if (!businessId) return
    fetchBusinessSettings(businessId).then(({ settings: s }) => setSettings(s))
  }, [businessId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!masterId) return
      const list = await buildDaySlots(masterId, days[dayIndex], duration, null, buffer)
      if (!cancelled) {
        setSlots(list)
        setSelectedSlot(list[0] || null)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [masterId, dayIndex, duration, buffer, days])

  async function onSubmit() {
    if (!selectedSlot || !allowed) return
    setBusy(true)
    setError('')
    const res = await rescheduleBooking({
      bookingId: booking.id,
      startsAt: selectedSlot.start,
      endsAt: selectedSlot.end,
      clientTelegramId: booking.client_telegram_id,
      clientProfileId: booking.client_id,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error || 'Не удалось перенести')
      return
    }
    haptic('success')
    setSuccess({
      day: formatDayLabel(selectedSlot.start),
      time: formatSlotLabel(selectedSlot.start),
      serviceTitle: service.title || 'Услуга',
    })
    onDone?.(res.booking)
  }

  async function onWriteMaster() {
    if (!masterId) return
    setChatBusy(true)
    const msg = success
      ? buildRescheduleMessage(success)
      : buildLateModifyMessage({
          serviceTitle: service.title || 'Услуга',
          day: formatDayLabel(new Date(booking.starts_at)),
          time: formatSlotLabel(new Date(booking.starts_at)),
          hours: limitHours,
          intent: 'reschedule',
        })
    await openMasterChat(masterId, { message: msg })
    setChatBusy(false)
    haptic('light')
  }

  if (!allowed) {
    return (
      <div className="card px-4 py-4 space-y-3">
        <p className="text-sm font-semibold">Уже поздно переносить в приложении</p>
        <p className="text-sm text-[var(--brand-muted)]">
          Перенос — не позже чем за {limitHours} ч до визита. Напишите исполнителю и
          обговорите новое время лично.
        </p>
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={chatBusy}
          onClick={onWriteMaster}
        >
          {chatBusy ? 'Открываю…' : 'Написать исполнителю'}
        </button>
        <button type="button" className="btn btn-secondary w-full" onClick={onCancel}>
          Назад
        </button>
      </div>
    )
  }

  if (success) {
    return (
      <div className="card px-4 py-4 space-y-3">
        <p className="text-sm font-semibold text-[var(--brand-primary)]">Время перенесено</p>
        <p className="text-sm">
          {success.serviceTitle} · {success.day} {success.time}
        </p>
        <p className="text-xs text-[var(--brand-muted)]">
          Напишите мастеру, если нужно согласовать детали.
        </p>
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={chatBusy}
          onClick={onWriteMaster}
        >
          Написать мастеру
        </button>
        <button type="button" className="btn btn-secondary w-full" onClick={onCancel}>
          Назад
        </button>
      </div>
    )
  }

  return (
    <div className="card px-4 py-4 space-y-3">
      <p className="text-sm font-semibold">Перенести запись</p>
      <p className="text-xs text-[var(--brand-muted)]">
        {service.title || 'Услуга'} · сейчас {formatDayLabel(new Date(booking.starts_at))}{' '}
        {formatSlotLabel(new Date(booking.starts_at))}
      </p>

      <div className="day-strip">
        {days.map((day, index) => {
          const selected = index === dayIndex
          const { num, hint } = dayChipParts(day, index)
          return (
            <button
              key={day.toISOString()}
              type="button"
              className={`pressable day-chip ${selected ? 'is-selected' : ''}`}
              onClick={() => {
                setDayIndex(index)
                haptic('light')
              }}
            >
              <span className="day-num">{num}</span>
              <span className="day-hint">{hint}</span>
            </button>
          )
        })}
      </div>

      {slots.length === 0 ? (
        <p className="text-sm text-[var(--brand-muted)]">Нет свободных окон</p>
      ) : (
        <div className="slot-grid">
          {slots.map((slot) => (
            <button
              key={slot.start.toISOString()}
              type="button"
              className={`pressable slot-chip ${selectedSlot?.start?.getTime() === slot.start.getTime() ? 'is-selected' : ''}`}
              onClick={() => {
                setSelectedSlot(slot)
                haptic('light')
              }}
            >
              {slot.label}
            </button>
          ))}
        </div>
      )}

      {error ? <p className="text-sm text-warning">{error}</p> : null}

      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={!selectedSlot || busy}
        onClick={onSubmit}
      >
        {busy ? 'Переношу…' : 'Подтвердить перенос'}
      </button>
      <button type="button" className="btn btn-secondary w-full" onClick={onCancel}>
        Назад
      </button>
    </div>
  )
}
