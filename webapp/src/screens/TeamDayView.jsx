import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { fetchBusinessDayBookings } from '../lib/bookings'
import { dayOffset, formatDayLabel, formatSlotLabel } from '../lib/slots'
import { statusLabel } from '../lib/analytics'
import { haptic } from '../hooks/useTelegramChrome'

function dayChipLabel(offset) {
  if (offset === 0) return 'Сегодня'
  if (offset === 1) return 'Завтра'
  const d = dayOffset(offset)
  return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })
}

/**
 * Список визитов всех мастеров на дату (legacy; UI не подключён).
 */
export default function TeamDayView({ businessId, members = [] }) {
  const [dayIdx, setDayIdx] = useState(0)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const day = useMemo(() => dayOffset(dayIdx), [dayIdx])
  const activeMembers = useMemo(
    () => (members || []).filter((m) => m.is_active !== false && m.profile_id),
    [members],
  )
  const masterIds = useMemo(
    () => activeMembers.map((m) => m.profile_id),
    [activeMembers],
  )
  const nameById = useMemo(() => {
    const map = new Map()
    for (const m of activeMembers) {
      map.set(
        m.profile_id,
        m.title || m.profiles?.full_name || 'Мастер',
      )
    }
    return map
  }, [activeMembers])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!masterIds.length) {
        setRows([])
        setLoading(false)
        return
      }
      setLoading(true)
      const data = await fetchBusinessDayBookings(businessId, masterIds, day)
      if (!cancelled) {
        setRows(data)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [businessId, masterIds.join(','), dayIdx])

  return (
    <div className="fade-up space-y-3">
      <div>
        <h3 className="section-title">День команды</h3>
        <p className="mt-1 text-sm text-[var(--brand-muted)]">{formatDayLabel(day)}</p>
      </div>

      <div className="day-strip" role="tablist">
        {Array.from({ length: 7 }, (_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={dayIdx === i}
            className={`pressable day-chip day-chip--label ${dayIdx === i ? 'is-selected' : ''}`}
            onClick={() => {
              haptic('light')
              setDayIdx(i)
            }}
          >
            {dayChipLabel(i)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="skeleton h-14" />
          <div className="skeleton h-14" />
        </div>
      ) : !rows.length ? (
        <EmptyState
          imageSrc="empty-day.svg"
          title="В этот день свободно"
          text="У команды пока нет записей на выбранный день."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((b) => (
            <li key={b.id} className="card px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-semibold leading-none">
                    {formatSlotLabel(new Date(b.starts_at))}
                  </p>
                  <p className="mt-1.5 truncate text-sm font-semibold">
                    {b.services?.title || 'Услуга'}
                  </p>
                  <p className="text-xs text-[var(--brand-muted)]">
                    {nameById.get(b.master_id) || 'Мастер'}
                    {b.client_telegram_id ? ` · клиент ${b.client_telegram_id}` : ''}
                  </p>
                  <span className="status-chip mt-2 pending">{statusLabel(b.status)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
