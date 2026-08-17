import { useCallback, useEffect, useMemo, useState } from 'react'
import AppShell, { Surface } from '../components/AppShell'
import StepProgress from '../components/StepProgress'
import EmptyState from '../components/EmptyState'
import MyBookings from './MyBookings'
import { formatPrice } from '../lib/services'
import {
  buildDaySlots,
  bookingDayRange,
  BOOKING_DAY_HORIZON,
  findFirstDayWithSlots,
  findNextAvailableSlot,
  formatDayLabel,
  formatSlotLabel,
  createBooking,
} from '../lib/slots'
import { useTelegramChrome, haptic } from '../hooks/useTelegramChrome'
import { WebApp } from '../lib/telegram'
import { dateKey } from '../lib/availability'
import { assetUrl } from '../lib/assets'
import { buildShareText, buildClientBookingLink } from '../lib/inviteLinks'
import { fetchPortfolio } from '../lib/media'
import PortfolioLightbox from '../components/PortfolioLightbox'
import { openMapsLink } from '../lib/maps'
import { openMasterChat } from '../lib/contacts'
import { fetchBusinessSettings, mediaFrameStyle } from '../lib/settings'
import { normalizeLocations, primaryLocation } from '../lib/proExtras'
import { formatTrustLine } from '../lib/trust'
import { supabase } from '../lib/supabase'

function dayChipParts(day, index) {
  const num = day.getDate()
  const weekday = day.toLocaleDateString('ru-RU', { weekday: 'short' })
  let hint = weekday
  if (index === 0) hint = 'сегодня'
  else if (index === 1) hint = 'завтра'
  return { num, hint }
}

function resolveInitialStep(initialStep, needStaff) {
  if (initialStep === 'mine') return 'mine'
  if (initialStep === 'staff' || (needStaff && initialStep !== 'done')) return 'staff'
  if (initialStep === 'done') return 'done'
  return 'book'
}

export default function BookingFlow({
  theme,
  masterId,
  businessId = null,
  businessSlug,
  businessCity = '',
  businessAddress = '',
  members = [],
  selectedMasterId,
  setSelectedMasterId,
  userName,
  profile,
  services,
  selectedServiceId,
  setSelectedServiceId,
  btnClass,
  initialStep = 'book',
  onBackToHome,
  prefillServiceId = null,
  prefillSlotIso = null,
}) {
  const needStaff = (members?.length || 0) > 1
  const [step, setStep] = useState(() => resolveInitialStep(initialStep, needStaff))
  const [dayIndex, setDayIndex] = useState(0)
  const [slots, setSlots] = useState([])
  const [nextSlotHint, setNextSlotHint] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [busy, setBusy] = useState(false)
  const [slotsBusy, setSlotsBusy] = useState(false)
  const [error, setError] = useState('')
  const [doneInfo, setDoneInfo] = useState(null)
  const [coverReady, setCoverReady] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [portfolio, setPortfolio] = useState([])
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [mediaFrame, setMediaFrame] = useState(null)
  const [trustLine, setTrustLine] = useState('')
  const [locations, setLocations] = useState([])
  const [selectedLocationId, setSelectedLocationId] = useState(null)

  const selectedService = services.find((s) => s.id === selectedServiceId)
  const serviceBufferMin = selectedService?.buffer_min || 0
  const days = useMemo(() => bookingDayRange(BOOKING_DAY_HORIZON), [])

  useEffect(() => {
    setStep(resolveInitialStep(initialStep, needStaff))
  }, [initialStep, needStaff])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!businessId) {
        setPortfolio([])
        setMediaFrame(null)
        setTrustLine('')
        return
      }
      const [rows, { settings }, countRes, bizRes] = await Promise.all([
        fetchPortfolio(businessId),
        fetchBusinessSettings(businessId),
        supabase
          ? supabase
              .from('bookings')
              .select('id', { count: 'exact', head: true })
              .eq('business_id', businessId)
              .in('status', ['completed', 'confirmed', 'pending'])
          : Promise.resolve({ count: 0 }),
        supabase
          ? supabase
              .from('businesses')
              .select('created_at')
              .eq('id', businessId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      if (!cancelled) {
        setPortfolio(rows.slice(0, 6))
        setMediaFrame(settings.media_frame)
        const locs = normalizeLocations(settings.locations)
        setLocations(locs)
        setSelectedLocationId((prev) => {
          if (prev && locs.some((l) => l.id === prev)) return prev
          return primaryLocation(locs)?.id || locs[0]?.id || null
        })
        setTrustLine(
          formatTrustLine({
            createdAt: bizRes?.data?.created_at,
            visitCount: countRes?.count ?? 0,
          }),
        )
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [businessId])

  const activeMasterId = selectedMasterId || masterId

  const loadSlotsForDay = useCallback(
    async (index, service) => {
      if (!activeMasterId || !service) return []
      return buildDaySlots(
        activeMasterId,
        days[index],
        service.duration_min || 60,
        null,
        service.buffer_min || 0,
      )
    },
    [activeMasterId, days],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (step !== 'book' || !activeMasterId || !selectedService) {
        setSlots([])
        setNextSlotHint(null)
        return
      }
      setSlotsBusy(true)
      const first = await findFirstDayWithSlots(
        activeMasterId,
        selectedService.duration_min || 60,
        BOOKING_DAY_HORIZON,
        selectedService.buffer_min || 0,
      )
      if (cancelled) return
      setDayIndex(first.dayIndex)
      setSlots(first.slots)
      setSelectedSlot(first.slots[0] || null)
      if (!first.slots.length) {
        const next = await findNextAvailableSlot(
          activeMasterId,
          selectedService.duration_min || 60,
          BOOKING_DAY_HORIZON,
          selectedService.buffer_min || 0,
        )
        if (!cancelled) setNextSlotHint(next)
      } else {
        setNextSlotHint(null)
      }
      setSlotsBusy(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [step, activeMasterId, selectedService?.id, selectedService?.duration_min, selectedService?.buffer_min])

  useEffect(() => {
    if (!prefillServiceId || !services.length) return
    const match = services.find((s) => s.id === prefillServiceId || s.id.startsWith(prefillServiceId))
    if (match) setSelectedServiceId(match.id)
  }, [prefillServiceId, services, setSelectedServiceId])

  useEffect(() => {
    if (!prefillSlotIso || step !== 'book') return
    const target = new Date(prefillSlotIso)
    if (Number.isNaN(target.getTime())) return
    const idx = days.findIndex((d) => dateKey(d) === dateKey(target))
    if (idx >= 0) setDayIndex(idx)
  }, [prefillSlotIso, step, days])

  useEffect(() => {
    let cancelled = false
    async function loadDay() {
      if (step !== 'book' || !activeMasterId || !selectedService) return
      setSlotsBusy(true)
      const list = await loadSlotsForDay(dayIndex, selectedService)
      if (cancelled) return
      setSlots(list)
      setSelectedSlot((prev) => {
        if (prev && list.some((s) => s.start.getTime() === prev.start?.getTime())) {
          return prev
        }
        return list[0] || null
      })
      setSlotsBusy(false)
    }
    if (selectedService) loadDay()
    return () => {
      cancelled = true
    }
  }, [dayIndex, step, activeMasterId, selectedService, loadSlotsForDay])

  const resetToBook = useCallback(() => {
    setStep(needStaff ? 'staff' : 'book')
    setDoneInfo(null)
    setSelectedSlot(null)
    setError('')
  }, [needStaff])

  const confirmBooking = useCallback(async () => {
    if (!selectedService || !selectedSlot || !activeMasterId) return
    setBusy(true)
    setError('')
    const loc = locations.find((l) => l.id === selectedLocationId) || null
    const result = await createBooking({
      masterId: activeMasterId,
      businessId,
      serviceId: selectedService.id,
      startsAt: selectedSlot.start,
      endsAt: selectedSlot.end,
      priceCents: selectedService.price_cents,
      currency: selectedService.currency,
      clientProfileId: profile?.id ?? null,
      clientTelegramId: profile?.telegram_id ?? null,
      locationId: loc?.id || null,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error || 'Не удалось создать запись')
      return
    }
    setDoneInfo({
      service: selectedService.title,
      day: formatDayLabel(selectedSlot.start),
      time: formatSlotLabel(selectedSlot.start),
      price: formatPrice(selectedService.price_cents, selectedService.currency),
      iso: selectedSlot.start.toISOString(),
      address: loc?.address || businessAddress || '',
      city: loc?.city || businessCity || '',
    })
    setStep('done')
    haptic('success')
  }, [
    selectedService,
    selectedSlot,
    activeMasterId,
    businessId,
    businessAddress,
    businessCity,
    locations,
    selectedLocationId,
  ])

  const summaryLine =
    selectedService && selectedSlot
      ? `${selectedService.title} · ${formatDayLabel(selectedSlot.start)} ${formatSlotLabel(selectedSlot.start)} · ${formatPrice(selectedService.price_cents, selectedService.currency)}`
      : ''

  const mainCtaLabel =
    busy
      ? 'Сохраняю…'
      : step === 'confirm'
        ? `Подтвердить · ${selectedService ? formatPrice(selectedService.price_cents, selectedService.currency) : ''}`
        : selectedService && selectedSlot
          ? `Далее · ${formatPrice(selectedService.price_cents, selectedService.currency)}`
          : 'Выберите время'

  useTelegramChrome({
    mainText: '',
    mainVisible: false,
    mainEnabled: false,
    onMain: undefined,
    backVisible: step !== 'done',
    onBack: () => {
      if (step === 'confirm') setStep('book')
      else if (step === 'mine') setStep(needStaff ? 'staff' : 'book')
      else if (step === 'book' && needStaff) setStep('staff')
      else if (onBackToHome) onBackToHome()
    },
  })

  const cover = assetUrl(theme.cover_url || 'cover-demo.svg')
  const logo = assetUrl(theme.logo_url || 'avatar-demo.svg')
  const business = theme.business_name || 'Запись'
  const frameStyle = mediaFrameStyle(mediaFrame)

  useEffect(() => {
    let cancelled = false
    setCoverReady(false)
    const img = new Image()
    img.onload = () => {
      if (!cancelled) setCoverReady(true)
    }
    img.onerror = () => {
      if (!cancelled) setCoverReady(false)
    }
    img.src = cover
    return () => {
      cancelled = true
    }
  }, [cover])

  async function shareMaster() {
    const link = buildClientBookingLink(businessSlug)
    const text = buildShareText(theme?.business_name)
    try {
      if (navigator.share) {
        await navigator.share({ title: text, text, url: link })
        haptic('success')
        return
      }
      await navigator.clipboard.writeText(`${text}\n${link}`)
      setShareCopied(true)
      haptic('success')
    } catch {
      try {
        await navigator.clipboard.writeText(`${text}\n${link}`)
        setShareCopied(true)
      } catch {
        WebApp.showAlert?.(`${text}\n${link}`)
      }
    }
  }

  async function jumpToNextSlot() {
    if (!nextSlotHint || !selectedService) return
    setDayIndex(nextSlotHint.dayIndex)
    setSelectedSlot(nextSlotHint.slot)
    haptic('light')
  }

  if (step === 'done' && doneInfo) {
    return (
      <AppShell className="fade-in booking-shell">
        <StepProgress current="done" />
        <div className="success-pulse tg-section success-card px-5 py-8 text-center mt-6 stagger">
          <img
            src={assetUrl('success-check.svg')}
            alt=""
            className="mx-auto h-24 w-24 object-contain success-pulse"
            width={96}
            height={96}
          />
          <h1 className="display mt-4 text-[28px] font-extrabold leading-tight">
            Вы записаны
          </h1>
          <p className="display mt-3 text-[28px] font-extrabold text-[var(--brand-primary)]">
            {doneInfo.time}
          </p>
          <p className="mt-1 text-sm text-[var(--brand-muted)]">{doneInfo.day}</p>
          {userName ? (
            <p className="mt-2 text-sm text-[var(--brand-muted)]">
              {userName}, ждём вас
            </p>
          ) : null}
          <div className="success-meta mt-6 grid grid-cols-2 gap-3 text-left">
            <div className="success-meta-item">
              <p className="meta-label">Услуга</p>
              <p className="meta-value">{doneInfo.service}</p>
            </div>
            <div className="success-meta-item">
              <p className="meta-label">Цена</p>
              <p className="meta-value">{doneInfo.price}</p>
            </div>
            {doneInfo.address ? (
              <div className="success-meta-item col-span-2">
                <p className="meta-label">Адрес</p>
                <p className="meta-value">{doneInfo.address}</p>
                {doneInfo.city ? (
                  <p className="text-xs text-[var(--brand-muted)] mt-0.5">{doneInfo.city}</p>
                ) : null}
              </div>
            ) : null}
          </div>
          {doneInfo.address ? (
            <button
              type="button"
              className="btn btn-secondary w-full mt-4"
              onClick={() => {
                haptic('light')
                openMapsLink(doneInfo.address, doneInfo.city)
              }}
            >
              Открыть в картах
            </button>
          ) : null}
          <p className="mt-4 text-xs text-[var(--brand-muted)]">
            Напомним в Telegram перед визитом. Отменить можно в «Мои записи».
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <button type="button" className="btn btn-secondary w-full" onClick={shareMaster}>
            {shareCopied ? 'Ссылка скопирована' : 'Поделиться мастером'}
          </button>
          <button
            type="button"
            className={btnClass}
            onClick={() => {
              if (onBackToHome) {
                onBackToHome()
                return
              }
              try {
                WebApp.close?.()
              } catch {
                // ignore
              }
            }}
          >
            Готово
          </button>
          <button type="button" className="pressable ghost-btn" onClick={resetToBook}>
            Записаться ещё раз · та же услуга
          </button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell className="booking-shell">
      <header
        className="profile-header-card profile-header-card--centered fade-up"
        style={frameStyle}
      >
        <div className="profile-header-cover-wrap">
          <div
            className={`profile-header-cover ${coverReady ? 'is-ready' : ''}`}
            style={coverReady ? { backgroundImage: `url(${cover})` } : undefined}
          />
        </div>
        <div className="profile-header-body">
          <span className="profile-header-avatar-wrap">
            <img
              src={logo}
              alt=""
              className="profile-header-avatar"
              width={76}
              height={76}
              decoding="async"
              onError={(e) => {
                const fb = assetUrl('avatar-demo.svg')
                if (e.currentTarget.src !== fb) e.currentTarget.src = fb
              }}
            />
          </span>
          <div className="profile-header-text">
            <h1 className="display truncate text-[22px] font-bold leading-tight">
              {business}
            </h1>
            <p className="mt-1.5 text-sm leading-snug text-[var(--brand-muted)]">
              {selectedService
                ? `${selectedService.title} · ${formatPrice(selectedService.price_cents, selectedService.currency)}`
                : 'Выберите услугу и время'}
              {businessCity ? ` · ${businessCity}` : ''}
              {trustLine ? ` · ${trustLine}` : ''}
            </p>
          </div>
        </div>
      </header>

      {step !== 'mine' && step !== 'done' ? (
        <div className="mb-3">
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={() => {
              haptic('light')
              openMasterChat(activeMasterId || masterId, {
                message: 'Здравствуйте! Хочу согласовать детали записи.',
              })
            }}
          >
            Написать мастеру
          </button>
        </div>
      ) : null}

      {portfolio.length && step !== 'mine' && step !== 'done' ? (
        <div className="fade-up -mt-1 mb-3">
          <div className="portfolio-strip">
            {portfolio.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                className="portfolio-strip-item"
                onClick={() => {
                  haptic('light')
                  setLightboxIndex(idx)
                }}
              >
                <img
                  src={assetUrl(p.image_url)}
                  alt=""
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step !== 'mine' && step !== 'staff' ? (
        <div className="booking-steps-wrap">
          <StepProgress
            current={
              step === 'confirm' || step === 'done'
                ? 'done'
                : selectedService
                  ? 'time'
                  : 'service'
            }
          />
        </div>
      ) : null}

      {step === 'mine' ? (
        <section key="mine" className="booking-step">
          <MyBookings
            masterId={activeMasterId}
            businessId={businessId}
            businessSlug={businessSlug}
            onBack={() => setStep(needStaff ? 'staff' : 'book')}
            onBookAgain={({ serviceId }) => {
              if (serviceId) setSelectedServiceId(serviceId)
              setStep('book')
            }}
          />
        </section>
      ) : null}

      {step === 'staff' && (
        <section key="staff" className="booking-step stagger">
          <h2 className="section-title">К кому записаться</h2>
          <ul className="tg-list booking-list">
            {members.map((m) => {
              const selected = m.profile_id === activeMasterId
              const name = m.title || m.profiles?.full_name || 'Мастер'
              return (
                <li key={m.id || m.profile_id}>
                  <button
                    type="button"
                    className={`pressable tg-row service-row ${selected ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSelectedMasterId?.(m.profile_id)
                      haptic('light')
                    }}
                  >
                    <span className="service-row-body font-semibold">{name}</span>
                    {selected ? <span className="service-check">✓</span> : null}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="sticky-booking-cta">
            <button
              type="button"
              className={btnClass}
              disabled={!activeMasterId}
              onClick={() => setStep('book')}
            >
              К записи
            </button>
          </div>
        </section>
      )}

      {step === 'book' && (
        <section key="book" className="booking-step stagger">
          <div className="booking-section-head">
            <h2 className="section-title">Запись</h2>
            <button type="button" className="booking-link" onClick={() => setStep('mine')}>
              Мои записи
            </button>
          </div>

          {!services.length ? (
            <EmptyState
              imageSrc="empty-slots.svg"
              title="Запись пока недоступна"
              text="У мастера нет активных услуг. Напишите напрямую в Telegram."
              actionLabel="Написать"
              onAction={() => {
                openMasterChat(masterId, {
                  message: 'Здравствуйте! Хочу записаться — услуг в приложении пока нет.',
                }).catch(() => {})
              }}
            />
          ) : (
            <>
              {locations.length > 1 ? (
                <div className="space-y-2 mb-3">
                  <p className="text-xs font-medium text-[var(--brand-muted)]">Куда</p>
                  <div className="flex flex-wrap gap-2">
                    {locations.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        className={`pressable chip px-3 py-1.5 text-xs font-semibold ${
                          loc.id === selectedLocationId ? 'is-selected' : ''
                        }`}
                        onClick={() => {
                          setSelectedLocationId(loc.id)
                          haptic('light')
                        }}
                      >
                        {loc.title || loc.address || loc.city}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {services.length > 1 ? (
                <ul className="tg-list booking-list">
                  {services.map((service) => {
                    const selected = service.id === selectedServiceId
                    return (
                      <li key={service.id}>
                        <button
                          type="button"
                          className={`pressable tg-row service-row ${selected ? 'is-selected' : ''}`}
                          onClick={() => {
                            setSelectedServiceId(service.id)
                            haptic('light')
                          }}
                        >
                          <span className="service-row-body text-left">
                            <span className="block text-[15px] font-semibold truncate">
                              {service.title}
                            </span>
                            <span className="mt-0.5 block text-xs text-[var(--brand-muted)]">
                              {service.duration_min} мин
                            </span>
                          </span>
                          <span className="service-price shrink-0">
                            {formatPrice(service.price_cents, service.currency)}
                          </span>
                          {selected ? (
                            <span className="service-check" aria-hidden>
                              ✓
                            </span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : selectedService ? (
                <div className="booking-summary">
                  <div>
                    <p className="meta-label">Услуга</p>
                    <p className="mt-1 font-semibold">{selectedService.title}</p>
                    <p className="text-xs text-[var(--brand-muted)]">
                      {selectedService.duration_min} мин
                    </p>
                  </div>
                  <p className="service-price">
                    {formatPrice(selectedService.price_cents, selectedService.currency)}
                  </p>
                </div>
              ) : null}

              <h3 className="section-title mt-2">Когда удобно?</h3>

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

              {slotsBusy ? (
                <Surface className="px-4 py-6 text-center text-sm text-[var(--brand-muted)]">
                  Загружаю окна…
                </Surface>
              ) : slots.length === 0 ? (
                <Surface className="px-4 py-6 text-center">
                  <p className="text-sm text-[var(--brand-muted)]">
                    На этот день свободных окон нет.
                  </p>
                  {nextSlotHint ? (
                    <button
                      type="button"
                      className="pressable booking-link mt-3"
                      onClick={jumpToNextSlot}
                    >
                      Ближайшее: {nextSlotHint.label}
                    </button>
                  ) : null}
                </Surface>
              ) : (
                <div className="slot-grid">
                  {slots.map((slot) => {
                    const selected =
                      selectedSlot?.start?.getTime() === slot.start.getTime()
                    return (
                      <button
                        key={slot.start.toISOString()}
                        type="button"
                        className={`pressable slot-chip ${selected ? 'is-selected' : ''}`}
                        onClick={() => {
                          setSelectedSlot(slot)
                          haptic('light')
                        }}
                      >
                        {slot.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {error ? <p className="text-sm text-warning">{error}</p> : null}

              {summaryLine ? (
                <div className="booking-sticky-summary card px-4 py-3">
                  <p className="meta-label">Итого</p>
                  <p className="text-sm font-semibold">{summaryLine}</p>
                </div>
              ) : null}

              <div className="sticky-booking-cta">
                <button
                  type="button"
                  className={btnClass}
                  disabled={!selectedSlot || busy || slotsBusy}
                  onClick={() => setStep('confirm')}
                >
                  {mainCtaLabel}
                </button>
              </div>

              {onBackToHome ? (
                <button
                  type="button"
                  className="mt-4 w-full text-center text-sm text-[var(--brand-muted)]"
                  onClick={onBackToHome}
                >
                  ← На главную
                </button>
              ) : null}
            </>
          )}
        </section>
      )}

      {step === 'confirm' && selectedService && selectedSlot ? (
        <section key="confirm" className="booking-step stagger">
          <h2 className="section-title">Подтвердите запись</h2>
          <div className="card px-4 py-4 space-y-3">
            <div>
              <p className="meta-label">Услуга</p>
              <p className="font-semibold">{selectedService.title}</p>
            </div>
            <div>
              <p className="meta-label">Когда</p>
              <p className="font-semibold">
                {formatDayLabel(selectedSlot.start)} · {formatSlotLabel(selectedSlot.start)}
              </p>
            </div>
            <div>
              <p className="meta-label">Цена</p>
              <p className="text-xl font-semibold text-[var(--brand-primary)]">
                {formatPrice(selectedService.price_cents, selectedService.currency)}
              </p>
            </div>
            <p className="text-xs text-[var(--brand-muted)]">
              Отменить можно в «Мои записи» — без штрафа. Напомним в Telegram перед визитом.
            </p>
          </div>
          {error ? <p className="text-sm text-warning">{error}</p> : null}
          <button
            type="button"
            className={`${btnClass} mt-4`}
            disabled={busy}
            onClick={confirmBooking}
          >
            {mainCtaLabel}
          </button>
        </section>
      ) : null}

      {lightboxIndex != null ? (
        <PortfolioLightbox
          images={portfolio}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </AppShell>
  )
}
