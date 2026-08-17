import { useEffect, useState } from 'react'
import AppShell, { SkeletonMasterCard } from '../components/AppShell'
import CityPicker from '../components/CityPicker'
import EmptyState from '../components/EmptyState'
import ReschedulePanel from '../components/ReschedulePanel'
import CancelBookingSheet from '../components/CancelBookingSheet'
import { TextField } from '../components/Fields'
import {
  cancelClientBooking,
  hideClientBooking,
  fetchClientMasters,
  fetchClientUpcomingAll,
  fetchClientPastBookings,
  fetchLastRepeatableBooking,
  bookingModifyPolicy,
} from '../lib/bookings'
import { searchBusinessesInCity, fetchProShowcaseInCity } from '../lib/business'
import {
  getSavedClientCity,
  normalizeCity,
  setSavedClientCity,
} from '../lib/cities'
import { formatDayLabel, formatSlotLabel } from '../lib/slots'
import { statusLabel, kopecksToRub } from '../lib/analytics'
import { assetUrl } from '../lib/assets'
import Icon from '../components/Icon'
import ProBadge from '../components/ProBadge'
import { haptic, useTelegramChrome } from '../hooks/useTelegramChrome'
import { WebApp } from '../lib/telegram'
import { openVkMiniApp } from '../lib/vk'
import { formatTrustLine } from '../lib/trust'
import { buildLateModifyMessage, openMasterChat } from '../lib/contacts'

import { categoryLabel } from '../lib/searchExpand'

function bookingLabel(b) {
  const svc = b.services?.title || 'Услуга'
  const day = formatDayLabel(new Date(b.starts_at))
  const time = formatSlotLabel(new Date(b.starts_at))
  return `${svc} · ${day} ${time}`
}

function UpcomingCard({ booking, pendingId, chatBusy, onReschedule, onCancelTap, onWriteMaster }) {
  const canAct =
    booking.status === 'pending' || booking.status === 'confirmed'
  const policy = bookingModifyPolicy(booking)
  return (
    <article className="card px-4 py-3.5">
      <div className="flex items-start gap-3">
        {booking.businesses?.avatar_url ? (
          <img
            src={assetUrl(booking.businesses.avatar_url)}
            alt=""
            className="h-11 w-11 shrink-0 rounded-full object-cover"
            width={44}
            height={44}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">
            {formatDayLabel(new Date(booking.starts_at))} ·{' '}
            {formatSlotLabel(new Date(booking.starts_at))}
          </p>
          <p className="mt-1 text-sm text-[var(--brand-muted)]">
            {booking.services?.title || 'Услуга'}
            {booking.businesses?.name ? ` · ${booking.businesses.name}` : ''}
          </p>
          <p className="mt-1 text-xs text-[var(--brand-muted)]">
            {statusLabel(booking.status)} · {kopecksToRub(booking.price_cents)} ₽
          </p>
        </div>
      </div>
      {canAct && policy.allowed ? (
        <div className="mt-3 flex gap-3 justify-end">
          <button
            type="button"
            className="text-sm font-semibold text-[var(--brand-primary)]"
            disabled={pendingId === booking.id}
            onClick={() => onReschedule(booking)}
          >
            Перенести
          </button>
          <button
            type="button"
            className="text-sm text-[var(--brand-muted)]"
            disabled={pendingId === booking.id}
            onClick={() => onCancelTap(booking)}
          >
            Отменить
          </button>
        </div>
      ) : null}
      {canAct && policy.blockedByTime ? (
        <div className="mt-3 flex flex-col items-end gap-1">
          <button
            type="button"
            className="text-sm font-semibold text-[var(--brand-primary)]"
            disabled={chatBusy}
            onClick={() => onCancelTap(booking)}
          >
            Написать исполнителю
          </button>
          <p className="text-[10px] text-[var(--brand-muted)]">
            Отмена/перенос — за {policy.hours} ч до визита
          </p>
        </div>
      ) : null}
    </article>
  )
}

export default function ClientHome({
  userName,
  profile,
  deeplinkBusiness = null,
  onBookBusiness,
  onSwitchRole,
}) {
  const clientProfileId = profile?.id ?? null
  const tgId = profile?.telegram_id ?? null
  const [upcoming, setUpcoming] = useState([])
  const [past, setPast] = useState([])
  const [pastExpanded, setPastExpanded] = useState(false)
  const [masters, setMasters] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState(null)
  const [rescheduleBooking, setRescheduleBooking] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelError, setCancelError] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [error, setError] = useState('')
  const [repeatLast, setRepeatLast] = useState(null)

  const [city, setCity] = useState(() => getSavedClientCity())
  const [searchOpen, setSearchOpen] = useState(true)
  const [searchDraft, setSearchDraft] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [found, setFound] = useState([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [showcase, setShowcase] = useState([])

  useTelegramChrome({ mainVisible: false, backVisible: false })

  async function load() {
    setLoading(true)
    const [u, p, m, last] = await Promise.all([
      fetchClientUpcomingAll(clientProfileId),
      fetchClientPastBookings(clientProfileId, 15),
      fetchClientMasters(clientProfileId),
      fetchLastRepeatableBooking(clientProfileId),
    ])
    setUpcoming(u)
    setPast(p)
    setMasters(m)
    setRepeatLast(last)
    setLoading(false)
  }

  async function onHidePast(id) {
    setPendingId(id)
    const result = await hideClientBooking(id, clientProfileId)
    setPendingId(null)
    if (!result.ok) {
      setError(result.error || 'Не удалось скрыть')
      return
    }
    haptic('success')
    setPast((prev) => prev.filter((b) => b.id !== id))
  }

  useEffect(() => {
    load()
  }, [tgId])

  useEffect(() => {
    let cancelled = false
    async function loadShowcase() {
      const c = normalizeCity(city)
      if (!c) {
        if (!cancelled) setShowcase([])
        return
      }
      const rows = await fetchProShowcaseInCity({ city: c, limit: 6 })
      if (!cancelled) setShowcase(rows)
    }
    loadShowcase()
    return () => {
      cancelled = true
    }
  }, [city])

  useEffect(() => {
    let cancelled = false
    async function run() {
      const c = normalizeCity(city)
      if (!c || !searchOpen) {
        setFound([])
        return
      }
      if (searchQuery.trim().length < 2) {
        setFound([])
        setSearchBusy(false)
        return
      }
      setSearchBusy(true)
      const rows = await searchBusinessesInCity({
        city: c,
        query: searchQuery,
      })
      if (!cancelled) {
        setFound(rows)
        setSearchBusy(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [city, searchQuery, searchOpen])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchDraft.trim())
    }, 300)
    return () => clearTimeout(t)
  }, [searchDraft])

  function onCityPick(next) {
    const c = normalizeCity(next)
    setCity(c)
    setSavedClientCity(c)
    haptic('light')
  }

  async function onConfirmCancel(id) {
    setCancelError('')
    setError('')
    setPendingId(id)
    const result = await cancelClientBooking(id, clientProfileId)
    setPendingId(null)
    if (!result.ok) {
      setCancelError(result.error || 'Не удалось отменить')
      return
    }
    setCancelTarget(null)
    haptic('success')
    await load()
  }

  async function writeMasterAbout(booking, intent = 'change') {
    if (!booking?.master_id) return
    setChatBusy(true)
    const policy = bookingModifyPolicy(booking)
    const msg = buildLateModifyMessage({
      serviceTitle: booking.services?.title || 'Услуга',
      day: formatDayLabel(new Date(booking.starts_at)),
      time: formatSlotLabel(new Date(booking.starts_at)),
      hours: policy.hours,
      intent,
    })
    await openMasterChat(booking.master_id, { message: msg })
    setChatBusy(false)
    haptic('light')
  }

  const mastersShown = (() => {
    if (!repeatLast) return masters
    return masters.filter((m) => {
      if (repeatLast.businessSlug && m.slug === repeatLast.businessSlug) return false
      if (repeatLast.masterId && m.master_id === repeatLast.masterId) return false
      return true
    })
  })()

  if (loading) {
    return (
      <AppShell>
        <div className="skeleton mb-4 h-10 w-2/3" />
        <SkeletonMasterCard />
        <SkeletonMasterCard />
      </AppShell>
    )
  }

  const searchTooShort = searchQuery.length > 0 && searchQuery.length < 2

  return (
    <AppShell className="client-home fade-up">
      <header className="mb-5">
        <p className="meta-label">Клиент</p>
        <h1 className="display mt-1 text-2xl font-extrabold leading-tight">
          {userName ? `Привет, ${userName.split(' ')[0]}` : 'Ваши записи'}
        </h1>
        {tgId ? (
          <button
            type="button"
            className="text-xs text-[var(--brand-primary)] mt-2"
            onClick={() => {
              haptic('light')
              openVkMiniApp(tgId)
            }}
          >
            Подключить VK
          </button>
        ) : null}
      </header>

      {deeplinkBusiness ? (
        <section className="card mb-4 flex items-center gap-3 px-3 py-3">
          <img
            src={assetUrl(deeplinkBusiness.avatar_url || 'avatar-demo.svg')}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
            width={48}
            height={48}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {deeplinkBusiness.name || 'Заведение'}
            </p>
            <p className="text-xs text-[var(--brand-muted)]">Запись в пару касаний</p>
          </div>
          <button
            type="button"
            className="pressable shrink-0 rounded-[14px] px-3 py-2 text-sm font-semibold"
            style={{
              background: 'var(--brand-primary)',
              color: 'var(--brand-btn-text)',
            }}
            onClick={() => {
              haptic('light')
              onBookBusiness?.(deeplinkBusiness.slug)
            }}
          >
            Записаться
          </button>
        </section>
      ) : null}

      <section className="list-section mb-6 space-y-3">
        <h2 className="list-section-title">Активные записи</h2>
        {!clientProfileId ? (
          <p className="text-sm text-[var(--brand-muted)]">
            Профиль не найден. Откройте из Telegram или VK.
          </p>
        ) : upcoming.length === 0 ? (
          <EmptyState
            imageSrc="empty-day.svg"
            title="Пока пусто"
            text={
              deeplinkBusiness
                ? 'Нажмите «Записаться» выше.'
                : 'Запишитесь к мастеру по ссылке или найдите через поиск.'
            }
          />
        ) : (
          <ul className="space-y-2">
            {upcoming.map((b) => (
              <li key={b.id}>
                <UpcomingCard
                  booking={b}
                  pendingId={pendingId}
                  chatBusy={chatBusy}
                  onReschedule={setRescheduleBooking}
                  onCancelTap={(row) => {
                    setCancelError('')
                    setCancelTarget(row)
                  }}
                  onWriteMaster={(row) => writeMasterAbout(row, 'change')}
                />
              </li>
            ))}
          </ul>
        )}
        {error ? <p className="text-sm text-warning">{error}</p> : null}
        {rescheduleBooking ? (
          <div className="mt-3">
            <ReschedulePanel
              booking={{ ...rescheduleBooking, client_telegram_id: tgId, client_id: clientProfileId }}
              businessId={rescheduleBooking.business_id}
              onDone={() => {
                setRescheduleBooking(null)
                load()
              }}
              onCancel={() => setRescheduleBooking(null)}
            />
          </div>
        ) : null}
      </section>

      {past.length > 0 ? (
        <section className="list-section mb-6 past-visits-block">
          <button
            type="button"
            className="past-visits-header pressable"
            onClick={() => {
              haptic('light')
              setPastExpanded((v) => !v)
            }}
          >
            <span className="past-visits-title">Прошлые визиты</span>
            <span className="past-visits-meta">{past.length}</span>
            <span className={`past-visits-chevron ${pastExpanded ? 'is-open' : ''}`}>
              <Icon name="icon-chevron-right" size={18} />
            </span>
          </button>

          {pastExpanded ? (
            <ul className="space-y-2 past-visits-list">
              {past.map((b) => (
                <li
                  key={b.id}
                  className="rounded-[14px] border border-[color-mix(in_srgb,var(--brand-text)_8%,transparent)] bg-[var(--brand-surface)] px-3 py-2.5 past-visit-row"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {b.services?.title || 'Услуга'}
                        {b.businesses?.name ? ` · ${b.businesses.name}` : ''}
                      </p>
                      <p className="text-xs text-[var(--brand-muted)]">
                        {formatDayLabel(new Date(b.starts_at))} ·{' '}
                        {formatSlotLabel(new Date(b.starts_at))}
                      </p>
                    </div>
                    <div className="past-visit-actions">
                      {b.businesses?.slug ? (
                        <button
                          type="button"
                          className="past-visit-action past-visit-action--primary"
                          onClick={() => {
                            haptic('light')
                            onBookBusiness?.(b.businesses.slug, {
                              serviceId: b.service_id,
                              masterId: b.master_id,
                            })
                          }}
                        >
                          Снова
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="past-visit-action"
                        disabled={pendingId === b.id}
                        onClick={() => onHidePast(b.id)}
                      >
                        {pendingId === b.id ? '…' : 'Скрыть'}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {showcase.length > 0 ? (
        <section className="list-section mb-5">
          <h2 className="list-section-title">Рекомендуем</h2>
          <p className="mb-2 text-xs text-[var(--brand-muted)]">
            Pro-мастера в «{normalizeCity(city) || 'вашем городе'}»
          </p>
          <ul className="pro-showcase-row">
            {showcase.map((b, i) => (
              <li key={b.id} style={{ animationDelay: `${i * 0.05}s` }}>
                <button
                  type="button"
                  className="pressable pro-showcase-card"
                  onClick={() => {
                    haptic('light')
                    if (b.slug) onBookBusiness?.(b.slug)
                  }}
                  disabled={!b.slug}
                >
                  <img
                    src={assetUrl(b.avatar_url || 'avatar-demo.svg')}
                    alt=""
                    className="pro-showcase-avatar"
                    width={56}
                    height={56}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="pro-showcase-name">{b.name}</span>
                  <ProBadge compact />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card client-search-card mb-5 px-4 py-4 space-y-3">
        <button
          type="button"
          className="pressable flex w-full items-center gap-3 text-left"
          onClick={() => {
            haptic('light')
            setSearchOpen((v) => !v)
          }}
        >
          <span className="client-search-icon" aria-hidden>
            <Icon name="icon-search" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Найти мастера</span>
            <span className="mt-0.5 block text-xs text-[var(--brand-muted)]">
              Город, услуга или название
            </span>
          </span>
          <Icon
            name="icon-chevron-right"
            size={18}
            className={`shrink-0 opacity-50 transition-transform ${searchOpen ? 'rotate-90' : ''}`}
          />
        </button>

        {searchOpen ? (
          <div className="space-y-3 border-t border-[color-mix(in_srgb,var(--brand-text)_8%,transparent)] pt-3">
            <CityPicker
              label="Город"
              value={city}
              onChange={onCityPick}
              placeholder="Москва, Казань…"
            />
            <TextField
              label="Услуга или название"
              value={searchDraft}
              onChange={setSearchDraft}
              placeholder="Стрижка, маникюр…"
              maxLength={80}
            />
            {!city ? (
              <p className="text-sm text-[var(--brand-muted)]">Сначала выберите город.</p>
            ) : searchTooShort ? (
              <p className="text-sm text-[var(--brand-muted)]">
                Введите минимум 2 символа для поиска.
              </p>
            ) : searchBusy ? (
              <div className="space-y-2">
                <SkeletonMasterCard />
              </div>
            ) : searchQuery.length >= 2 && found.length === 0 ? (
              <EmptyState
                imageSrc="empty-search.svg"
                title="Никого не нашли"
                text={`В «${city}» нет мастеров по запросу «${searchQuery}».`}
              />
            ) : found.length > 0 ? (
              <ul className="space-y-2">
                {found.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      className="pressable master-card"
                      onClick={() => {
                        haptic('light')
                        if (b.slug) onBookBusiness?.(b.slug)
                      }}
                      disabled={!b.slug}
                    >
                      <img
                        src={assetUrl(b.avatar_url || 'avatar-demo.svg')}
                        alt=""
                        className="master-card-avatar"
                        width={48}
                        height={48}
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="master-card-body">
                        <span className="master-card-title-row">
                          <span className="master-card-title">{b.name}</span>
                          {b.isPro ? <ProBadge compact /> : null}
                        </span>
                        <span className="master-card-meta">
                          {categoryLabel(b.type) || 'Мастер'}
                          {b.city ? ` · ${b.city}` : ''}
                          {b.matched_services?.[0]
                            ? ` · ${b.matched_services[0].title}`
                            : ''}
                        </span>
                      </span>
                      <Icon name="icon-chevron-right" size={18} className="master-card-chevron" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      {repeatLast?.businessSlug ? (
        <section className="card mb-4 px-4 py-3.5 space-y-3">
          <div className="flex items-center gap-3">
            <img
              src={assetUrl(repeatLast.avatarUrl || 'avatar-demo.svg')}
              alt=""
              className="h-12 w-12 rounded-[var(--radius-md)] object-cover"
              width={48}
              height={48}
            />
            <div className="min-w-0 flex-1">
              <p className="meta-label">Как в прошлый раз</p>
              <p className="truncate font-semibold">{repeatLast.businessName}</p>
              <p className="text-xs text-[var(--brand-muted)] truncate">
                {repeatLast.serviceTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={() => {
              haptic('medium')
              onBookBusiness?.(repeatLast.businessSlug, {
                serviceId: repeatLast.serviceId,
                masterId: repeatLast.masterId,
              })
            }}
          >
            Записаться снова
          </button>
        </section>
      ) : null}

      {mastersShown.length > 0 ? (
        <section className="list-section mb-6">
          <h2 className="list-section-title">Мои мастера</h2>
          <ul className="space-y-2">
            {mastersShown.map((m) => (
              <li key={m.business_id || m.master_id}>
                <button
                  type="button"
                  className="pressable master-card"
                  onClick={() => {
                    haptic('light')
                    if (m.slug) {
                      onBookBusiness?.(m.slug, { masterId: m.master_id })
                    }
                  }}
                  disabled={!m.slug}
                >
                    <img
                      src={assetUrl(m.avatar_url || 'avatar-demo.svg')}
                      alt=""
                      className="master-card-avatar"
                      width={48}
                      height={48}
                      loading="lazy"
                      decoding="async"
                    />
                  <span className="master-card-body">
                    <span className="master-card-title">{m.name}</span>
                    <span className="master-card-meta">
                      {[
                        m.city || '',
                        formatTrustLine({
                          createdAt: m.created_at,
                          visitCount: m.visit_count,
                        }) || 'Записаться снова',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <Icon name="icon-chevron-right" size={18} className="master-card-chevron" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <button
        type="button"
        className="w-full text-center text-sm text-[var(--brand-muted)]"
        onClick={onSwitchRole}
      >
        Сменить роль
      </button>

      <CancelBookingSheet
        open={!!cancelTarget}
        busy={pendingId === cancelTarget?.id}
        chatBusy={chatBusy}
        error={cancelError}
        locked={Boolean(cancelTarget && bookingModifyPolicy(cancelTarget).blockedByTime)}
        hours={cancelTarget ? bookingModifyPolicy(cancelTarget).hours : 24}
        bookingLabel={cancelTarget ? bookingLabel(cancelTarget) : ''}
        onClose={() => {
          setCancelTarget(null)
          setCancelError('')
        }}
        onReschedule={() => {
          const b = cancelTarget
          setCancelTarget(null)
          setCancelError('')
          if (b) setRescheduleBooking(b)
        }}
        onConfirmCancel={() => cancelTarget && onConfirmCancel(cancelTarget.id)}
        onWriteMaster={() => cancelTarget && writeMasterAbout(cancelTarget, 'change')}
      />
    </AppShell>
  )
}
