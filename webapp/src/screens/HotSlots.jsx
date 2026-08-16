import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState'
import {
  buildClientBookingLink,
  buildShareLine,
  buildShareText,
} from '../lib/inviteLinks'
import { buildColleagueInviteLine, buildReferralStartLink } from '../lib/shareCopy'
import {
  buildDaySlots,
  dayOffset,
  formatDayLabel,
  formatSlotLabel,
} from '../lib/slots'
import { downloadBookingQr } from '../lib/qr'
import { haptic } from '../hooks/useTelegramChrome'
import { WebApp } from '../lib/telegram'
import { getProPriceLabelShort } from '../lib/pro'

export default function HotSlots({
  masterId,
  services = [],
  masterSlug,
  businessName,
  businessId = null,
  isPro = false,
  onOpenSchedule,
  onOpenPro,
}) {
  const activeServices = useMemo(
    () => services.filter((s) => s.is_active !== false),
    [services],
  )
  const [serviceId, setServiceId] = useState(activeServices[0]?.id || null)
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState('')

  const selectedService =
    activeServices.find((s) => s.id === serviceId) || activeServices[0] || null
  const duration = selectedService?.duration_min || 60
  const link = buildClientBookingLink(masterSlug)
  const shareText = buildShareText(businessName)
  const shareLine = buildShareLine(businessName, masterSlug)
  const myTgId = WebApp.initDataUnsafe?.user?.id || null
  const referralLink = buildReferralStartLink(myTgId)
  const colleagueLine = buildColleagueInviteLine(myTgId)

  useEffect(() => {
    if (!serviceId && activeServices[0]?.id) {
      setServiceId(activeServices[0].id)
    }
  }, [activeServices, serviceId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!masterId) return
      setLoading(true)
      const day0 = await buildDaySlots(masterId, dayOffset(0), duration)
      const day1 = await buildDaySlots(masterId, dayOffset(1), duration)
      const merged = [
        ...day0.slice(0, 6).map((s) => ({ ...s, day: dayOffset(0) })),
        ...day1.slice(0, 6).map((s) => ({ ...s, day: dayOffset(1) })),
      ]
      if (!cancelled) {
        setSlots(merged)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [masterId, duration])

  async function copyLink() {
    haptic('light')
    setToast('')
    try {
      await navigator.clipboard.writeText(link)
      setToast('Ссылка скопирована')
      haptic('success')
    } catch {
      WebApp.showAlert?.(link)
    }
  }

  async function shareLink() {
    haptic('light')
    setToast('')
    try {
      if (navigator.share) {
        await navigator.share({ title: shareText, text: shareText, url: link })
        return
      }
    } catch {
      // fallback
    }
    try {
      if (WebApp.openTelegramLink) {
        const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`
        WebApp.openTelegramLink(url)
        return
      }
    } catch {
      // fallback
    }
    try {
      await navigator.clipboard.writeText(shareLine)
      setToast('Текст со ссылкой скопирован')
      haptic('success')
    } catch {
      WebApp.showAlert?.(shareLine)
    }
  }

  async function onQr() {
    setBusy('qr')
    try {
      await downloadBookingQr(link, `zapis-${masterSlug || 'qr'}.png`)
      setToast('QR сохранён')
      haptic('success')
    } catch (err) {
      setToast(err?.message || 'Не удалось скачать QR')
    } finally {
      setBusy('')
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="skeleton h-12" />
        <div className="skeleton h-24" />
      </div>
    )
  }

  return (
    <div className="fade-up space-y-4">
      <p className="text-sm leading-snug text-[var(--brand-muted)]">
        Отправьте ссылку — клиент сам выберет время.
      </p>

      {activeServices.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {activeServices.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`pressable chip px-3 py-1.5 text-xs font-semibold ${
                s.id === selectedService?.id ? 'is-selected' : ''
              }`}
              onClick={() => {
                setServiceId(s.id)
                haptic('light')
              }}
            >
              {s.title}
            </button>
          ))}
        </div>
      ) : null}

      {!slots.length ? (
        <EmptyState
          imageSrc="empty-slots.svg"
          title="Свободных окон рядом нет"
          text="Откройте расписание или пришлите ссылку клиенту."
          actionLabel="Расписание"
          onAction={onOpenSchedule}
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--brand-muted)]">
            Ближайшие окна
          </p>
          <ul className="grid grid-cols-2 gap-2">
            {slots.map((s) => (
              <li
                key={s.start.toISOString()}
                className="card px-3 py-3 text-sm font-semibold"
              >
                <span className="block text-xs font-medium text-[var(--brand-muted)]">
                  {formatDayLabel(s.day)}
                </span>
                {formatSlotLabel(s.start)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {toast ? (
        <p className="text-sm text-[var(--brand-primary)]">{toast}</p>
      ) : null}

      <div className="link-actions">
        <button type="button" className="btn btn-primary w-full" onClick={copyLink}>
          Скопировать ссылку
        </button>
        <button type="button" className="btn btn-secondary w-full" onClick={shareLink}>
          Поделиться
        </button>
        <button
          type="button"
          className="btn btn-secondary w-full"
          disabled={busy === 'qr'}
          onClick={onQr}
        >
          {busy === 'qr' ? '…' : 'Скачать QR'}
        </button>
      </div>

      <div className="card px-4 py-3 space-y-2">
        <p className="text-sm font-semibold">Пригласить коллегу</p>
        <p className="text-xs text-[var(--brand-muted)] leading-snug">
          +14 дней Pro вам, когда коллега подключит Pro. Кабинет для него бесплатный.
        </p>
        <button
          type="button"
          className="btn btn-secondary w-full"
          onClick={async () => {
            haptic('light')
            try {
              await navigator.clipboard.writeText(colleagueLine)
              setToast('Текст для коллеги скопирован')
              haptic('success')
            } catch {
              WebApp.showAlert?.(colleagueLine)
            }
          }}
        >
          Скопировать приглашение
        </button>
        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={async () => {
            haptic('light')
            try {
              await navigator.clipboard.writeText(referralLink)
              setToast('Реф-ссылка скопирована')
              haptic('success')
            } catch {
              WebApp.showAlert?.(referralLink)
            }
          }}
        >
          Только ссылка
        </button>
      </div>

      <div className="link-growth">
        <p className="link-growth-label">Рост</p>
        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={() => {
            haptic('light')
            onOpenPro?.()
          }}
        >
          {isPro ? 'Ассистент и инструменты' : getProPriceLabelShort()}
        </button>
      </div>
    </div>
  )
}
