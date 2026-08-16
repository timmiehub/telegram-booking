import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PRO_FEATURES,
  PRO_BENEFITS,
  isProPlan,
  getTributeProUrl,
  loadProState,
  startProCheckout,
  redeemPromoCode,
  canUseAi,
  getProCtaLabel,
  getProPriceLabel,
} from '../lib/pro'
import ClientsAtRisk from './ClientsAtRisk'
import QuietStats from './QuietStats'
import FillGaps from './FillGaps'
import { TextField } from '../components/Fields'
import Icon from '../components/Icon'
import {
  buildDaySlots,
  dayOffset,
} from '../lib/slots'
import { haptic } from '../hooks/useTelegramChrome'
import ProExtras from '../components/master/ProExtras'
import { WebApp } from '../lib/telegram'
import { assetUrl } from '../lib/assets'

/**
 * Pro для соло-мастера: статус, ассистент, инструменты.
 */
export default function ProPanel({
  businessId,
  masterId = null,
  businessName = '',
  businessSlug = '',
  services = [],
  businessCreatedAt = null,
  initialTool = '',
  onSettingsChange,
  onOpenProfile,
}) {
  const [settings, setSettings] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [tool, setTool] = useState(initialTool || '')
  const [promoDraft, setPromoDraft] = useState('')
  const [promoBusy, setPromoBusy] = useState(false)
  const [freeSlots, setFreeSlots] = useState([])
  const [featureTip, setFeatureTip] = useState(null)
  const awaitingProRef = useRef(false)
  const pollTimerRef = useRef(null)
  const pollDeadlineRef = useRef(0)

  const activeServices = useMemo(
    () => (services || []).filter((s) => s.is_active !== false),
    [services],
  )
  const serviceId = activeServices[0]?.id || null
  const duration = activeServices[0]?.duration_min || 60

  async function refresh() {
    if (!businessId) return null
    const state = await loadProState(businessId)
    setSettings(state.settings)
    return state.settings
  }

  function stopProPoll() {
    awaitingProRef.current = false
    pollDeadlineRef.current = 0
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  function startProPoll() {
    awaitingProRef.current = true
    pollDeadlineRef.current = Date.now() + 120_000
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)

    async function tick() {
      if (!awaitingProRef.current) return
      if (Date.now() > pollDeadlineRef.current) {
        stopProPoll()
        return
      }
      const next = await refresh()
      if (isProPlan(next)) {
        stopProPoll()
        haptic('success')
        setToast('Pro подключён')
        onSettingsChange?.(next)
      }
    }

    tick()
    pollTimerRef.current = setInterval(tick, 3500)
  }

  useEffect(() => {
    refresh()
  }, [businessId])

  useEffect(() => {
    if (initialTool) setTool(initialTool)
  }, [initialTool])

  useEffect(() => {
    let cancelled = false
    async function loadSlots() {
      if (!masterId) return
      const day0 = await buildDaySlots(masterId, dayOffset(0), duration)
      const day1 = await buildDaySlots(masterId, dayOffset(1), duration)
      const merged = [
        ...day0.slice(0, 6).map((s) => ({ ...s, day: dayOffset(0) })),
        ...day1.slice(0, 6).map((s) => ({ ...s, day: dayOffset(1) })),
      ]
      if (!cancelled) setFreeSlots(merged)
    }
    loadSlots()
    return () => {
      cancelled = true
    }
  }, [masterId, duration])

  useEffect(() => {
    function onFocusOrVisible() {
      if (!awaitingProRef.current) return
      if (typeof document !== 'undefined' && document.hidden) return
      startProPoll()
    }

    document.addEventListener('visibilitychange', onFocusOrVisible)
    window.addEventListener('focus', onFocusOrVisible)
    WebApp.onEvent?.('activated', onFocusOrVisible)

    return () => {
      document.removeEventListener('visibilitychange', onFocusOrVisible)
      window.removeEventListener('focus', onFocusOrVisible)
      WebApp.offEvent?.('activated', onFocusOrVisible)
      stopProPoll()
    }
  }, [businessId])

  async function onConnect() {
    if (!businessId) return
    setBusy(true)
    setError('')
    setToast('')
    const res = await startProCheckout(businessId)
    setBusy(false)
    if (!res.ok) {
      setError(res.error || 'Не удалось')
      return
    }
    setSettings(res.settings)
    haptic('success')
    if (res.mode === 'tribute') {
      setToast(
        res.opened
          ? 'Открыли оплату — после оплаты Pro включится сам'
          : 'Ссылка на оплату готова',
      )
      if (!res.opened && getTributeProUrl()) {
        WebApp.showAlert?.(getTributeProUrl())
      }
      if (!isProPlan(res.settings)) startProPoll()
    } else {
      setToast('Заявка сохранена.')
    }
    onSettingsChange?.(res.settings)
  }

  async function openTool(id) {
    haptic('light')
    if (!isProPlan(settings)) {
      await onConnect()
      return
    }
    setFeatureTip(null)
    setTool(id)
    setError('')
    setToast('')
  }

  function scrollToTarget(target) {
    haptic('light')
    if (!isProPlan(settings)) {
      onConnect()
      return
    }
    setFeatureTip(null)
    setTool('')
    const el = document.getElementById(target)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  function onFeatureClick(f) {
    if (f.action === 'tip') {
      haptic('light')
      setFeatureTip({ title: f.title, text: f.tip })
      setTool('')
      return
    }
    if (f.action === 'profile') {
      haptic('light')
      onOpenProfile?.()
      return
    }
    if (f.action === 'scroll') {
      scrollToTarget(f.target)
      return
    }
    if (f.action === 'tool' && f.tool) {
      openTool(f.tool)
    }
  }

  async function onRedeemPromo() {
    if (!businessId || !promoDraft.trim()) return
    setPromoBusy(true)
    setError('')
    setToast('')
    const res = await redeemPromoCode(businessId, promoDraft)
    setPromoBusy(false)
    if (!res.ok) {
      setError(res.error || 'Не удалось')
      return
    }
    setSettings(res.settings)
    setPromoDraft('')
    haptic('success')
    setToast(
      `Pro на ${res.days} дн. до ${new Date(res.until).toLocaleDateString('ru-RU')}`,
    )
    onSettingsChange?.(res.settings)
  }

  const pro = isProPlan(settings)
  const proSource = String(settings?.pro_source || '')
  const isLifetimePro =
    proSource.startsWith('lifetime') || proSource.startsWith('early')
  const proUntilLabel = settings?.pro_until
    ? new Date(settings.pro_until).toLocaleDateString('ru-RU')
    : null
  const proStatusLabel = isLifetimePro ? 'Pro · без срока' : 'Pro активен'

  if (tool === 'ai' && pro) {
    return (
      <FillGaps
        masterId={masterId}
        businessName={businessName}
        businessSlug={businessSlug}
        serviceId={serviceId}
        freeSlots={freeSlots}
        aiReady={canUseAi(settings)}
        onBack={() => setTool('')}
      />
    )
  }

  return (
    <div className="pro-panel space-y-4">
      {pro ? (
        <div className="pro-upsell pro-upsell--active pro-stagger-1">
          <div className="pro-upsell-inner">
            <span className="pro-badge pro-badge--hero">
              <img src={assetUrl('pro-mark.svg')} alt="" width={14} height={14} className="pro-badge-mark" />
              {proStatusLabel}
            </span>
            {proUntilLabel && !isLifetimePro ? (
              <p className="pro-upsell-until">До {proUntilLabel}</p>
            ) : (
              <p className="pro-upsell-lead">Все инструменты ниже открыты.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="pro-upsell pro-stagger-1">
          <div className="pro-upsell-inner space-y-4">
            <div>
              <p className="pro-upsell-eyebrow">Pro</p>
              <h2 className="pro-upsell-title">Выше в поиске — больше записей</h2>
              <p className="pro-upsell-lead">
                Pro поднимает вас в выдаче города. Плюс бренд, отчёт и ИИ —{' '}
                <span className="pro-upsell-price">{getProPriceLabel()}</span>
              </p>
            </div>
            <ul className="pro-benefit-list">
              {PRO_BENEFITS.map((b) => (
                <li key={b.text} className="pro-benefit-chip">
                  <span className="pro-benefit-icon" aria-hidden>
                    <Icon name={b.icon} size={16} />
                  </span>
                  <span>{b.text}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn-primary pro-cta w-full"
              disabled={busy || !businessId}
              onClick={onConnect}
            >
              {getProCtaLabel({ busy })}
            </button>
          </div>
        </div>
      )}

      <div className="pro-stagger-2">
        <h2 className="section-title">Преимущества Pro</h2>
        <p className="mt-1 text-sm text-[var(--brand-muted)]">
          Нажмите, чтобы открыть или узнать.
        </p>
      </div>

      <ul className="pro-feature-grid pro-stagger-3">
        {PRO_FEATURES.map((f) => {
          const locked = !pro && (f.action === 'tool' || f.action === 'scroll')
          return (
            <li key={f.id}>
              <button
                type="button"
                className="pressable pro-feature-tile"
                disabled={busy || !businessId}
                onClick={() => onFeatureClick(f)}
              >
                <span className="pro-feature-icon" aria-hidden>
                  <Icon name={f.icon || 'icon-star'} size={20} />
                </span>
                <span className="pro-feature-row-body">
                  <p className="pro-feature-title">
                    {f.title}
                    {locked ? <span className="pro-feature-lock">Pro</span> : null}
                  </p>
                  <p className="pro-feature-hint">{f.hint}</p>
                </span>
                <Icon
                  name="icon-chevron-right"
                  size={18}
                  className="pro-feature-chevron-icon"
                />
              </button>
            </li>
          )
        })}
      </ul>

      {featureTip ? (
        <div className="pro-tip-card space-y-3">
          <p className="text-sm font-semibold">{featureTip.title}</p>
          <p className="text-sm text-[var(--brand-muted)]">{featureTip.text}</p>
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={() => setFeatureTip(null)}
          >
            Понятно
          </button>
        </div>
      ) : null}

      {tool === 'winback' && pro ? (
        <ClientsAtRisk masterId={masterId} aiReady={canUseAi(settings)} />
      ) : null}

      {tool === 'stats' && pro ? (
        <QuietStats
          masterId={masterId}
          businessId={businessId}
          businessCreatedAt={businessCreatedAt}
        />
      ) : null}

      {pro ? (
        <ProExtras
          businessId={businessId}
          masterId={masterId}
          settings={settings}
          onSettingsChange={(next) => {
            setSettings(next)
            onSettingsChange?.(next)
          }}
        />
      ) : null}

      {toast ? <p className="toast toast-ok">{toast}</p> : null}
      {error ? <p className="text-sm text-warning">{error}</p> : null}

      {!pro ? (
        <div className="pro-promo-card space-y-2 pro-stagger-4">
          <p className="text-sm font-semibold">Промокод</p>
          <p className="text-xs text-[var(--brand-muted)]">
            Один код = 3 месяца Pro.
          </p>
          <TextField
            value={promoDraft}
            onChange={setPromoDraft}
            placeholder="Например BOOKQ"
            maxLength={16}
            autoComplete="off"
          />
          <button
            type="button"
            className="btn btn-secondary w-full"
            disabled={promoBusy || !businessId || !promoDraft.trim()}
            onClick={onRedeemPromo}
          >
            {promoBusy ? '…' : 'Активировать'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
