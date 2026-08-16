import { useEffect, useState } from 'react'
import { fetchWeekStats } from '../lib/growthMetrics'
import { kopecksToRub } from '../lib/analytics'
import { assetUrl } from '../lib/assets'

function StatTile({ label, value, wide = false }) {
  return (
    <div className={`card quiet-stat-tile p-3 ${wide ? 'is-wide' : ''}`}>
      <p className="text-xs text-[var(--brand-muted)]">{label}</p>
      <p className="display text-2xl font-extrabold tabular-nums">{value}</p>
    </div>
  )
}

/**
 * Тихие цифры: 7 дней — записи, состоялись, отмены, no-show, сумма.
 */
export default function QuietStats({ masterId, businessId = null }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!masterId) return
      setLoading(true)
      const week = await fetchWeekStats({ masterId, businessId, days: 7 })
      if (!cancelled) {
        setStats(week)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [masterId, businessId])

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="skeleton h-16" />
        <div className="skeleton h-16" />
        <div className="skeleton h-16" />
      </div>
    )
  }

  const s = stats || {}

  return (
    <div className="fade-up space-y-3">
      <div className="quiet-stats-head">
        <img
          src={assetUrl('stats-spark.png')}
          alt=""
          width={40}
          height={40}
          className="quiet-stats-spark"
        />
        <div className="min-w-0">
          <h3 className="section-title">Цифры</h3>
          <p className="mt-0.5 text-sm text-[var(--brand-muted)]">За последние 7 дней</p>
        </div>
      </div>
      <div className="quiet-stat-grid">
        <StatTile label="Записи" value={s.bookings ?? 0} />
        <StatTile label="Состоялись" value={s.completed ?? 0} />
        <StatTile label="Отмены" value={s.cancelled ?? 0} />
        <StatTile label="Не пришёл" value={s.noShow ?? 0} />
        <StatTile
          label="Сумма (состоявшиеся)"
          value={`${kopecksToRub(s.revenueCents || 0)} ₽`}
          wide
        />
      </div>
      {!s.hasFirstBooking && !(s.bookings || s.cancelled || s.noShow) ? (
        <p className="text-sm text-[var(--brand-muted)]">
          За неделю пока тихо — поделитесь ссылкой на запись.
        </p>
      ) : null}
    </div>
  )
}
