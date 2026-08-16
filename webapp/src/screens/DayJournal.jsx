import { useEffect, useMemo, useState } from 'react'
import { fetchBusinessDayBookings } from '../lib/bookings'
import { fetchMemberAvailability, getWindowForDate, normalizeSchedule, parseHm } from '../lib/availability'
import { formatSlotLabel } from '../lib/slots'
import { statusLabel } from '../lib/analytics'

const ROW_STEP = 30

function statusClass(status) {
  if (status === 'pending') return 'journal-pending'
  if (status === 'confirmed') return 'journal-confirmed'
  if (status === 'completed') return 'journal-completed'
  if (status === 'no_show') return 'journal-noshow'
  if (String(status).startsWith('cancelled')) return 'journal-cancelled'
  return 'journal-pending'
}

function slotMinFromIso(iso) {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

export default function DayJournal({ businessId, members = [], day = new Date() }) {
  const [bookings, setBookings] = useState([])
  const [windows, setWindows] = useState({})
  const [loading, setLoading] = useState(true)

  const activeMembers = useMemo(
    () => (members || []).filter((m) => m.is_active !== false && m.profile_id),
    [members],
  )

  const masterIds = useMemo(
    () => activeMembers.map((m) => m.profile_id),
    [activeMembers],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!masterIds.length) {
        setLoading(false)
        return
      }
      setLoading(true)
      const [rows, ...schedules] = await Promise.all([
        fetchBusinessDayBookings(businessId, masterIds, day),
        ...masterIds.map((id) => fetchMemberAvailability(id)),
      ])
      if (cancelled) return
      const winMap = {}
      masterIds.forEach((id, i) => {
        winMap[id] = getWindowForDate(normalizeSchedule(schedules[i]?.schedule), day)
      })
      setBookings(rows)
      setWindows(winMap)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [businessId, masterIds.join(','), day.toDateString()])

  const rows = useMemo(() => {
    let minStart = 9 * 60
    let maxEnd = 20 * 60
    for (const w of Object.values(windows)) {
      if (!w) continue
      const s = parseHm(w.start)
      const e = parseHm(w.end)
      if (s != null) minStart = Math.min(minStart, s)
      if (e != null) maxEnd = Math.max(maxEnd, e)
    }
    const gridRows = []
    for (let t = minStart; t < maxEnd; t += ROW_STEP) {
      gridRows.push(t)
    }
    return gridRows
  }, [windows])

  function cellFor(masterId, slotMin) {
    const w = windows[masterId]
    const wStart = w ? parseHm(w.start) : null
    const wEnd = w ? parseHm(w.end) : null
    const inWindow = wStart != null && wEnd != null && slotMin >= wStart && slotMin < wEnd

    const hit = bookings.find((b) => {
      if (b.master_id !== masterId) return false
      const start = slotMinFromIso(b.starts_at)
      const end = slotMinFromIso(b.ends_at)
      return slotMin >= start && slotMin < end
    })

    if (hit && slotMinFromIso(hit.starts_at) === slotMin) {
      return (
        <td key={masterId} className={`day-journal-cell ${statusClass(hit.status)}`}>
          <span className="day-journal-cell-title">
            {hit.external_source || hit.services?.title || 'Услуга'}
          </span>
          <span className="day-journal-cell-meta">
            {statusLabel(hit.status)}
            {hit.external_source ? ' · сторонняя' : ''}
            {hit.client_telegram_id ? ` · ${hit.client_telegram_id}` : ''}
          </span>
        </td>
      )
    }
    if (hit) {
      return <td key={masterId} className={`day-journal-cell ${statusClass(hit.status)} is-continue`} />
    }
    return (
      <td key={masterId} className={`day-journal-cell ${inWindow ? 'is-free' : 'is-off'}`} />
    )
  }

  function labelForMin(min) {
    const h = Math.floor(min / 60)
    const m = min % 60
    const d = new Date(day)
    d.setHours(h, m, 0, 0)
    return formatSlotLabel(d)
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="skeleton h-12" />
        <div className="skeleton h-32" />
      </div>
    )
  }

  if (activeMembers.length <= 1) return null

  return (
    <div className="day-journal fade-up">
      <p className="mb-2 text-sm font-semibold">Журнал на день</p>
      <div className="day-journal-scroll">
        <table className="day-journal-table">
          <thead>
            <tr>
              <th className="day-journal-time-col"> </th>
              {activeMembers.map((m) => (
                <th key={m.profile_id} className="day-journal-head">
                  {m.title || m.profiles?.full_name || 'Мастер'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((slotMin) => (
              <tr key={slotMin}>
                <td className="day-journal-time">{labelForMin(slotMin)}</td>
                {activeMembers.map((m) => cellFor(m.profile_id, slotMin))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
