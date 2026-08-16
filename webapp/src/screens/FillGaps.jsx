import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState'
import {
  daysSince,
  fetchClientVisitHistory,
  rankInviteCandidates,
} from '../lib/bookings'
import { craftSlotInvites, isGeminiConfigured } from '../lib/gemini'
import { buildBookingInviteLink } from '../lib/inviteLinks'
import { openClientChat } from '../lib/contacts'
import { formatDayLabel, formatSlotLabel } from '../lib/slots'
import { haptic } from '../hooks/useTelegramChrome'
import { WebApp } from '../lib/telegram'

function slotLabel(iso) {
  const d = new Date(iso)
  return `${formatDayLabel(d)} ${formatSlotLabel(d)}`
}

export default function FillGaps({
  masterId,
  businessName,
  businessSlug = '',
  serviceId = null,
  freeSlots = [],
  aiReady = false,
  onBack,
}) {
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const canAi = aiReady || isGeminiConfigured()
  const slotsKey = useMemo(
    () => freeSlots.map((s) => s.start?.toISOString?.() || '').join('|'),
    [freeSlots],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!masterId) return
      setLoading(true)
      setError('')
      try {
        const history = await fetchClientVisitHistory(masterId)
        const ranked = rankInviteCandidates(history, freeSlots, { limit: 6 })
        if (!ranked.length) {
          if (!cancelled) {
            setInvites([])
            setLoading(false)
          }
          return
        }

        let crafted = null
        if (canAi) {
          crafted = await craftSlotInvites({
            businessName: businessName || 'Заведение',
            slots: freeSlots.slice(0, 8).map((s) => ({
              iso: s.start.toISOString(),
              label: `${formatDayLabel(s.day || s.start)} ${formatSlotLabel(s.start)}`,
            })),
            candidates: ranked.map((c) => ({
              telegram_id: c.client_telegram_id,
              days_ago: daysSince(c.last_visit_at),
              visits: c.visits,
              preferred_weekday: c.preferred_weekday,
              preferred_hour: c.preferred_hour,
              best_slot_iso: c.best_slot_iso,
            })),
          })
        }

        const byId = new Map(
          (crafted?.clients || []).map((row) => [String(row.telegram_id), row]),
        )

        const merged = ranked.map((c) => {
          const ai = byId.get(String(c.client_telegram_id))
          const slotIso = ai?.slot_iso || c.best_slot_iso
          const inviteLink = buildBookingInviteLink({
            businessSlug,
            serviceId,
            slotIso,
          })
          const fallbackMsg = `Привет! Есть окно ${slotLabel(slotIso)} у «${businessName || 'нас'}».\n${inviteLink}`
          return {
            telegram_id: c.client_telegram_id,
            slot_iso: slotIso,
            invite_link: inviteLink,
            reason:
              ai?.reason ||
              `Не был ${daysSince(c.last_visit_at)} дн., раньше ходил около ${c.preferred_hour}:00`,
            message: ai?.message
              ? `${ai.message.replace(inviteLink, '').trim()}\n${inviteLink}`
              : fallbackMsg,
            visits: c.visits,
            days_ago: daysSince(c.last_visit_at),
          }
        })

        if (!cancelled) setInvites(merged.slice(0, 5))
      } catch (err) {
        console.warn('fill gaps:', err)
        if (!cancelled) setError('Не удалось подобрать клиентов')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [masterId, businessName, businessSlug, serviceId, canAi, slotsKey, freeSlots])

  async function copyMessage(text) {
    haptic('light')
    try {
      await navigator.clipboard.writeText(text)
      WebApp.showAlert?.('Текст скопирован — вставьте в чат клиенту')
      haptic('success')
    } catch {
      WebApp.showAlert?.(text)
    }
  }

  async function copyLink(link) {
    haptic('light')
    try {
      await navigator.clipboard.writeText(link)
      WebApp.showAlert?.('Ссылка на запись скопирована')
      haptic('success')
    } catch {
      WebApp.showAlert?.(link)
    }
  }

  async function onWrite(row) {
    haptic('light')
    const res = await openClientChat(row.telegram_id, { message: row.message })
    if (!res.ok && res.error && res.error !== 'Нет username') {
      WebApp.showAlert?.(res.error)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <button type="button" className="booking-link mb-2" onClick={onBack}>
          ← К окнам
        </button>
        <div className="skeleton h-16" />
        <div className="skeleton h-16" />
      </div>
    )
  }

  return (
    <div className="fade-up space-y-3">
      <button type="button" className="booking-link" onClick={onBack}>
        ← К окнам
      </button>
      <p className="text-sm text-[var(--brand-muted)]">
        Кого позвать на свободные слоты. Отправьте ссылку — клиент сразу попадёт на запись.
      </p>

      {error ? <p className="text-sm text-warning">{error}</p> : null}

      {!invites.length ? (
        <EmptyState
          imageSrc="empty-clients.svg"
          title="Некого звать"
          text="Нужны прошлые записи с telegram_id клиента. После первых визитов здесь появятся предложения."
        />
      ) : (
        invites.map((row) => (
          <article
            key={`${row.telegram_id}-${row.slot_iso}`}
            className="card px-4 py-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">Клиент {row.telegram_id}</p>
                <p className="text-xs text-[var(--brand-muted)]">
                  {row.days_ago} дн. назад · {row.visits} визит
                  {row.visits === 1 ? '' : 'а'} · слот {slotLabel(row.slot_iso)}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-[var(--brand-primary)]"
                onClick={() => onWrite(row)}
              >
                Написать
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--brand-muted)]">{row.reason}</p>
            <p className="mt-2 text-sm leading-snug">{row.message}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => copyLink(row.invite_link)}
              >
                Ссылка на слот
              </button>
              <button
                type="button"
                className="booking-link"
                onClick={() => copyMessage(row.message)}
              >
                Скопировать текст
              </button>
            </div>
          </article>
        ))
      )}
    </div>
  )
}
