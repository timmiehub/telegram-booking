import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { calendarMonthGrid, dateKey } from '../lib/availability'
import { fetchBookingDayCounts } from '../lib/bookings'
import { startOfDay, sameDay } from '../lib/slots'
import { haptic } from '../hooks/useTelegramChrome'

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

/**
 * Месячный календарь записей: точки на днях с визитами, тап → выбор дня.
 */
export default function AgendaMonthSheet({
  open,
  masterId,
  selectedDate,
  onSelect,
  onClose,
}) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const selected = useMemo(
    () => startOfDay(selectedDate || today),
    [selectedDate, today],
  )

  const [viewYear, setViewYear] = useState(selected.getFullYear())
  const [viewMonth, setViewMonth] = useState(selected.getMonth())
  const [counts, setCounts] = useState(() => new Map())
  const [loading, setLoading] = useState(false)
  const cacheRef = useRef(new Map())

  useEffect(() => {
    if (!open) return
    setViewYear(selected.getFullYear())
    setViewMonth(selected.getMonth())
  }, [open, selected])

  const { cells, weekdayLabels } = useMemo(
    () => calendarMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  )

  const monthKey = `${viewYear}-${viewMonth}`

  useEffect(() => {
    if (!open || !masterId) return
    let cancelled = false

    async function load() {
      if (cacheRef.current.has(monthKey)) {
        setCounts(cacheRef.current.get(monthKey))
        return
      }
      setLoading(true)
      setCounts(new Map())
      const from = new Date(viewYear, viewMonth, 1)
      const to = new Date(viewYear, viewMonth + 1, 0)
      const map = await fetchBookingDayCounts(masterId, from, to)
      if (cancelled) return
      cacheRef.current.set(monthKey, map)
      setCounts(map)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open, masterId, monthKey, viewYear, viewMonth])

  function shiftMonth(delta) {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
    haptic('light')
  }

  function goToday() {
    haptic('light')
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    onSelect?.(today)
  }

  function pickDay(date) {
    const day = startOfDay(date)
    haptic('medium')
    onSelect?.(day)
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="sheet-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="sheet-panel agenda-month-sheet"
        role="dialog"
        aria-labelledby="agenda-month-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden />

        <div className="agenda-month-toolbar">
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => shiftMonth(-1)}
            aria-label="Предыдущий месяц"
          >
            ‹
          </button>
          <h2 id="agenda-month-title" className="agenda-month-title">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => shiftMonth(1)}
            aria-label="Следующий месяц"
          >
            ›
          </button>
        </div>

        <button
          type="button"
          className="agenda-month-today-link"
          onClick={goToday}
        >
          Сегодня
        </button>

        <div
          className={`agenda-month-grid ${loading ? 'is-loading' : ''}`}
          role="grid"
          aria-label={`${MONTH_NAMES[viewMonth]} ${viewYear}`}
        >
          {weekdayLabels.map((w) => (
            <div key={w} className="agenda-month-weekday" role="columnheader">
              {w}
            </div>
          ))}
          {cells.map((cell, idx) => {
            if (!cell) {
              return (
                <div
                  key={`e-${idx}`}
                  className="agenda-month-cell is-empty"
                  aria-hidden
                />
              )
            }
            const key = dateKey(cell)
            const isToday = sameDay(cell, today)
            const isSelected = sameDay(cell, selected)
            const isPast = cell < today && !isToday
            const hasBookings = (counts.get(key) || 0) > 0
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                aria-selected={isSelected}
                aria-label={`${cell.getDate()} ${MONTH_NAMES[cell.getMonth()]}${
                  hasBookings ? ', есть записи' : ''
                }`}
                className={[
                  'pressable agenda-month-cell',
                  isToday ? 'is-today' : '',
                  isSelected ? 'is-selected' : '',
                  isPast ? 'is-past' : '',
                  hasBookings ? 'has-bookings' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => pickDay(cell)}
              >
                <span className="agenda-month-num">{cell.getDate()}</span>
                {hasBookings ? (
                  <span className="agenda-month-dot" aria-hidden />
                ) : (
                  <span className="agenda-month-dot-spacer" aria-hidden />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
