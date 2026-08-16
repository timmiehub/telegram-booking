import { useMemo, useState } from 'react'
import TimeWheel from './TimeWheel'
import {
  CALENDAR_PRESETS,
  calendarMonthGrid,
  dateKey,
  getDayEntry,
  isWorkingDay,
  normalizeSchedule,
  setDayHours,
  setDefaultBuffer,
  setDefaultHours,
  setWholeHours,
  toggleCalendarDay,
} from '../lib/availability'
import { haptic } from '../hooks/useTelegramChrome'

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30]

export default function WorkCalendar({ schedule, onChange, compact = false }) {
  const normalized = useMemo(() => normalizeSchedule(schedule), [schedule])
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [editKey, setEditKey] = useState(null)

  const { cells, weekdayLabels } = useMemo(
    () => calendarMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  )

  const workingCount = Object.keys(normalized.dates).filter(
    (k) => normalized.dates[k]?.start,
  ).length

  const editEntry = editKey ? normalized.dates[editKey] : null

  function shiftMonth(delta) {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
    haptic('light')
  }

  function onDayClick(date) {
    const day = new Date(date)
    day.setHours(0, 0, 0, 0)
    if (day < today) return
    const key = dateKey(day)
    haptic('light')

    if (editKey === key) {
      onChange?.(toggleCalendarDay(normalized, day))
      setEditKey(null)
      return
    }

    if (isWorkingDay(normalized, day)) {
      setEditKey(key)
      return
    }

    onChange?.(toggleCalendarDay(normalized, day))
    setEditKey(key)
  }

  return (
    <div className={`work-calendar ${compact ? 'is-compact' : ''}`}>
      {!compact ? (
        <p className="text-sm text-[var(--brand-muted)]">
          Нажмите день, чтобы отметить рабочий. Повторный тап — часы на этот день или выключить.
        </p>
      ) : null}

      <div className="calendar-preset-row">
        {Object.entries(CALENDAR_PRESETS).map(([key, p]) => (
          <button
            key={key}
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              haptic('light')
              setEditKey(null)
              onChange?.(p.fn(normalized))
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="calendar-toolbar">
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">
          ‹
        </button>
        <span className="calendar-month-label">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
          ›
        </button>
      </div>

      <div className="calendar-grid" role="grid">
        {weekdayLabels.map((label) => (
          <span key={label} className="calendar-weekday">
            {label}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) {
            return <span key={`e-${i}`} className="calendar-cell is-empty" />
          }
          const key = dateKey(date)
          const working = isWorkingDay(normalized, date)
          const day = new Date(date)
          day.setHours(0, 0, 0, 0)
          const isPast = day < today
          const isToday = key === dateKey(today)
          const isEdit = editKey === key
          return (
            <button
              key={key}
              type="button"
              disabled={isPast}
              className={`calendar-cell pressable ${working ? 'is-working' : ''} ${isToday ? 'is-today' : ''} ${isPast ? 'is-past' : ''} ${isEdit ? 'is-edit' : ''}`}
              onClick={() => onDayClick(date)}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>

      <p className="calendar-summary text-sm text-[var(--brand-muted)]">
        Выбрано дней: {workingCount}
      </p>

      <div className="calendar-section calendar-section--time">
        <div className="calendar-section-head">
          <span className="calendar-section-title">
            {editKey ? `Часы · ${editKey}` : 'Часы по умолчанию'}
          </span>
          {editKey ? (
            <button
              type="button"
              className="calendar-section-reset"
              onClick={() => onDayClick(new Date(editKey))}
            >
              Сбросить
            </button>
          ) : null}
        </div>

        <div className="calendar-hours-pair">
          <div className="calendar-hours-column">
            <span className="calendar-hours-label">Начало</span>
            <TimeWheel
              value={(editEntry || normalized.default).start}
              onChange={(v) => {
                if (editKey) {
                  const entry = getDayEntry(normalized, new Date(editKey)) || normalized.default
                  onChange?.(
                    setDayHours(
                      normalized,
                      new Date(editKey),
                      v,
                      entry.end || normalized.default.end,
                    ),
                  )
                } else {
                  onChange?.(setDefaultHours(normalized, v, normalized.default.end))
                }
              }}
            />
          </div>
          <div className="calendar-hours-column">
            <span className="calendar-hours-label">Конец</span>
            <TimeWheel
              value={(editEntry || normalized.default).end}
              onChange={(v) => {
                if (editKey) {
                  const entry = getDayEntry(normalized, new Date(editKey)) || normalized.default
                  onChange?.(
                    setDayHours(
                      normalized,
                      new Date(editKey),
                      entry.start || normalized.default.start,
                      v,
                    ),
                  )
                } else {
                  onChange?.(setDefaultHours(normalized, normalized.default.start, v))
                }
              }}
            />
          </div>
        </div>

        {editKey ? (
          <p className="calendar-hint">
            Редактируете часы для {editKey}. Нажмите «Сбросить», чтобы вернуть значение по умолчанию.
          </p>
        ) : (
          <p className="calendar-hint">
            Выберите день в календаре, чтобы задать индивидуальное время.
          </p>
        )}
      </div>

      <div className="calendar-section calendar-section--slots">
        <span className="calendar-section-title">Точность записи</span>

        <label className="field-block">
          <span className="meta-label">Перерыв после услуги</span>
          <select
            className="field"
            value={normalized.default.buffer_min ?? 10}
            onChange={(e) => onChange?.(setDefaultBuffer(normalized, e.target.value))}
          >
            {BUFFER_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'Без перерыва' : `${m} мин`}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={`slot-align-card pressable ${normalized.default.whole_hours ? 'is-on' : ''}`}
          role="switch"
          aria-checked={Boolean(normalized.default.whole_hours)}
          onClick={() => {
            haptic('light')
            onChange?.(setWholeHours(normalized, !normalized.default.whole_hours))
          }}
        >
          <div className="slot-align-copy">
            <span className="slot-align-title">Только целые часы</span>
            <span className="slot-align-hint">
              Клиенты записываются на 16:00, 17:00… без получаса — удобно, если сессия + перерыв = час
            </span>
            <span className="slot-align-examples" aria-hidden="true">
              {(normalized.default.whole_hours
                ? ['16:00', '17:00', '18:00']
                : ['16:00', '16:30', '17:00']
              ).map((t) => (
                <span key={t} className="slot-align-chip">
                  {t}
                </span>
              ))}
            </span>
          </div>
          <span className="slot-align-switch" aria-hidden="true">
            <span className="slot-align-knob" />
          </span>
        </button>
      </div>
    </div>
  )
}
