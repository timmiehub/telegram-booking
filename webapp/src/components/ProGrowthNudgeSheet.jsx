import { createPortal } from 'react-dom'
import Icon from './Icon'
import { haptic } from '../hooks/useTelegramChrome'
import { getProPriceLabel } from '../lib/pro'

/**
 * Мягкий рост-nudge для free: не блокирует, dismissible.
 */
export default function ProGrowthNudgeSheet({
  open,
  visits = 0,
  busy = false,
  onLater,
  onOpenPro,
}) {
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="sheet-backdrop pro-nudge-scrim"
      role="presentation"
      onClick={busy ? undefined : onLater}
    >
      <div
        className="sheet-panel pro-nudge-panel"
        role="dialog"
        aria-labelledby="pro-nudge-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden />
        <div className="pro-nudge-icon" aria-hidden>
          <Icon name="icon-search" size={28} />
        </div>
        <h2 id="pro-nudge-title" className="text-lg font-semibold">
          Вас уже записывают
        </h2>
        <p className="mt-2 text-sm text-[var(--brand-muted)]">
          За месяц около {visits} визитов. С Pro вы выше в поиске — чаще находят
          новые клиенты. Ничего в кабинете не отключаем.
        </p>
        <button
          type="button"
          className="btn btn-primary w-full mt-5"
          disabled={busy}
          onClick={() => {
            haptic('success')
            onOpenPro?.()
          }}
        >
          Pro · {getProPriceLabel()}
        </button>
        <button
          type="button"
          className="btn btn-secondary w-full mt-2"
          disabled={busy}
          onClick={() => {
            haptic('light')
            onLater?.()
          }}
        >
          Позже
        </button>
      </div>
    </div>,
    document.body,
  )
}

export const PRO_NUDGE_VISIT_THRESHOLD = 12
export const PRO_NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

export function nudgeStorageKey(businessId) {
  return `pro_growth_nudge_${businessId || 'anon'}_v1`
}

export function shouldShowProGrowthNudge({
  isPro,
  visits30d,
  settings,
  businessId,
} = {}) {
  if (isPro) return false
  if (Number(visits30d) < PRO_NUDGE_VISIT_THRESHOLD) return false
  const fromSettings = settings?.pro_nudge_at
    ? new Date(settings.pro_nudge_at).getTime()
    : 0
  let fromLocal = 0
  try {
    const raw = localStorage.getItem(nudgeStorageKey(businessId))
    fromLocal = raw ? Number(raw) || 0 : 0
  } catch {
    // ignore
  }
  const last = Math.max(fromSettings || 0, fromLocal || 0)
  if (last && Date.now() - last < PRO_NUDGE_COOLDOWN_MS) return false
  return true
}

export function markProGrowthNudgeSeen(businessId) {
  try {
    localStorage.setItem(nudgeStorageKey(businessId), String(Date.now()))
  } catch {
    // ignore
  }
}
