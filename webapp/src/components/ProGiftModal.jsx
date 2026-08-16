import { createPortal } from 'react-dom'
import Icon from './Icon'
import { haptic } from '../hooks/useTelegramChrome'
import { FEEDBACK_TG, FEEDBACK_TG_URL, PRO_GIFT_COPY } from '../lib/lifetimePro'
import { WebApp } from '../lib/telegram'

function openFeedbackTg() {
  haptic('light')
  try {
    if (typeof WebApp.openTelegramLink === 'function') {
      WebApp.openTelegramLink(FEEDBACK_TG_URL)
      return
    }
  } catch {
    // fall through
  }
  window.open(FEEDBACK_TG_URL, '_blank', 'noopener,noreferrer')
}

/** Одноразовое уведомление: Pro на месяц + приглашение к фидбеку */
export default function ProGiftModal({ open, title, body, onClose }) {
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="pro-gift-scrim" role="presentation">
      <div
        className="pro-gift-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pro-gift-title"
      >
        <div className="pro-gift-badge" aria-hidden>
          <Icon name="icon-star" size={28} />
        </div>
        <p className="pro-gift-eyebrow">{PRO_GIFT_COPY.eyebrow}</p>
        <h2 id="pro-gift-title" className="pro-gift-title">
          {title || PRO_GIFT_COPY.title}
        </h2>
        <p className="pro-gift-body">
          {body || PRO_GIFT_COPY.body}
        </p>
        <div className="pro-gift-pill">{PRO_GIFT_COPY.pill}</div>
        <button type="button" className="pro-gift-tg" onClick={openFeedbackTg}>
          {PRO_GIFT_COPY.tgCta || `Написать @${FEEDBACK_TG}`}
        </button>
        <button
          type="button"
          className="pro-gift-cta"
          onClick={() => {
            haptic('success')
            onClose?.()
          }}
        >
          {PRO_GIFT_COPY.cta}
        </button>
      </div>
    </div>,
    document.body,
  )
}
