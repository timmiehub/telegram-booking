import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { daysSince, fetchClientsAtRisk, attachClientLabels } from '../lib/bookings'
import { craftClientReturnOffer } from '../lib/gemini'
import { openClientChat } from '../lib/contacts'
import { haptic } from '../hooks/useTelegramChrome'
import { WebApp } from '../lib/telegram'

export default function ClientsAtRisk({ masterId, aiReady = false }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [offers, setOffers] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [copyOk, setCopyOk] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!masterId) return
      const data = await fetchClientsAtRisk(masterId, 45)
      const labeled = await attachClientLabels(
        data.map((c) => ({ client_telegram_id: c.client_telegram_id })),
      )
      const labelMap = new Map(
        labeled.map((l) => [String(l.client_telegram_id), l.client_label]),
      )
      if (!cancelled) {
        setRows(
          data.map((c) => ({
            ...c,
            client_label: labelMap.get(String(c.client_telegram_id)) || null,
          })),
        )
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [masterId])

  async function onSuggest(c) {
    const id = c.client_telegram_id
    setBusyId(id)
    haptic('light')
    const text = await craftClientReturnOffer({
      daysAgo: daysSince(c.last_visit_at),
      visits: c.visits,
    })
    setOffers((prev) => ({ ...prev, [id]: text }))
    setBusyId(null)
  }

  async function onCopyOffer(id, text) {
    setCopyOk('')
    try {
      await navigator.clipboard.writeText(text)
      setCopyOk(String(id))
      haptic('success')
      setTimeout(() => setCopyOk(''), 2000)
    } catch {
      // ignore
    }
  }

  async function onWrite(c, text) {
    haptic('light')
    const res = await openClientChat(c.client_telegram_id, { message: text })
    if (!res.ok && res.error && res.error !== 'Нет username') {
      WebApp.showAlert?.(res.error)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="skeleton h-14" />
        <div className="skeleton h-14" />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        imageSrc="empty-clients.svg"
        title="Пока все «тёплые»"
        text="Клиенты с визитом за последние 45 дней — здесь появятся те, кого пора вернуть."
      />
    )
  }

  return (
    <div className="stagger space-y-3">
      <p className="mb-1 text-sm text-[var(--brand-muted)]">
        Не были больше 45 дней — напишите и предложите время.
      </p>
      {rows.map((c) => {
        const offer =
          offers[c.client_telegram_id] ||
          'Давно не виделись — если удобно на этой неделе, напишите, подберём время.'
        return (
          <article key={c.client_telegram_id} className="card fade-up px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {c.client_label || `Клиент ${c.client_telegram_id}`}
                </p>
                <p className="text-xs text-[var(--brand-muted)]">
                  {daysSince(c.last_visit_at)} дн. назад · визитов {c.visits}
                </p>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-[var(--brand-primary)]"
                onClick={() => onWrite(c, offer)}
              >
                Написать
              </button>
            </div>
            <p className="mt-3 text-sm leading-snug">{offer}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="pressable booking-secondary-btn px-3 py-1.5 text-xs"
                onClick={() => onCopyOffer(c.client_telegram_id, offer)}
              >
                {copyOk === String(c.client_telegram_id)
                  ? 'Скопировано'
                  : 'Скопировать текст'}
              </button>
              {aiReady ? (
                <button
                  type="button"
                  className="booking-link text-xs"
                  disabled={busyId === c.client_telegram_id}
                  onClick={() => onSuggest(c)}
                >
                  {busyId === c.client_telegram_id
                    ? 'Думаю…'
                    : 'Другая формулировка'}
                </button>
              ) : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}
