import { useEffect, useRef, useState } from 'react'
import { updateBusinessThemeColors } from '../../lib/business'
import { applyThemeToDocument } from '../../lib/theme'
import { accentFromPrimary } from '../../lib/settings'
import { canUseBrand, getProPriceLabel } from '../../lib/pro'
import { assetUrl } from '../../lib/assets'
import { haptic } from '../../hooks/useTelegramChrome'

/**
 * Цвет кнопки записи: в Профиле. Free — замок → Pro.
 */
export default function BrandColorCard({
  businessId,
  masterId = null,
  theme = null,
  settings = null,
  onThemeRefresh,
  onOpenPro,
}) {
  const pro = canUseBrand(settings)
  const [primary, setPrimary] = useState(theme?.primary_color || '#cf9a4a')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const timer = useRef(null)
  const dirty = useRef(false)

  useEffect(() => {
    if (!theme?.primary_color) return
    if (dirty.current || busy) return
    setPrimary(theme.primary_color)
  }, [theme?.primary_color, busy])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  async function commit(nextPrimary) {
    if (!businessId || !pro) return
    const nextAccent = accentFromPrimary(nextPrimary)
    setBusy(true)
    const res = await updateBusinessThemeColors(businessId, {
      primary_color: nextPrimary,
      accent_color: nextAccent,
      masterId,
    })
    setBusy(false)
    dirty.current = false
    if (!res.ok) {
      setToast(res.error || 'Не удалось сохранить цвет')
      return
    }
    applyThemeToDocument({
      ...(theme || {}),
      primary_color: nextPrimary,
      accent_color: nextAccent,
    })
    haptic('success')
    setToast('Цвет сохранён')
    onThemeRefresh?.()
  }

  function onPrimaryChange(value) {
    if (!pro) {
      onOpenPro?.()
      return
    }
    dirty.current = true
    setPrimary(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => commit(value), 400)
  }

  function onLockedClick() {
    haptic('light')
    onOpenPro?.()
  }

  return (
    <div className="card space-y-3 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="section-title">Цвет кнопки</h3>
          <p className="mt-1 text-sm text-[var(--brand-muted)]">
            Так кнопка «Записаться» выглядит у клиента.
          </p>
        </div>
        {!pro ? (
          <span className="brand-color-lock shrink-0" aria-hidden>
            🔒 Pro
          </span>
        ) : null}
      </div>

      <label
        className={`pro-color-field ${!pro ? 'is-locked' : ''}`}
        onClick={!pro ? onLockedClick : undefined}
      >
        <span>Цвет кнопки</span>
        <input
          type="color"
          value={primary}
          disabled={!pro || busy}
          onChange={(e) => onPrimaryChange(e.target.value)}
          onClick={(e) => {
            if (!pro) {
              e.preventDefault()
              onLockedClick()
            }
          }}
        />
      </label>

      <div
        className={`pro-brand-preview ${!pro ? 'is-locked' : ''}`}
        role={!pro ? 'button' : undefined}
        tabIndex={!pro ? 0 : undefined}
        onClick={!pro ? onLockedClick : undefined}
        onKeyDown={
          !pro
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onLockedClick()
                }
              }
            : undefined
        }
      >
        <div
          className="pro-brand-preview-cover"
          style={{
            backgroundImage: `url(${assetUrl(theme?.cover_url || 'cover-demo.svg')})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="pro-brand-preview-body">
          <p>Так видит клиент</p>
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled
            style={!pro ? undefined : { background: primary }}
          >
            Записаться
          </button>
          <button type="button" className="btn btn-secondary w-full" disabled>
            Поделиться
          </button>
        </div>
        {!pro ? (
          <div className="brand-color-lock-overlay">
            <span>Цвет кнопки · Pro · {getProPriceLabel()}</span>
          </div>
        ) : null}
      </div>

      {toast ? <p className="text-sm text-[var(--brand-primary)]">{toast}</p> : null}
    </div>
  )
}
