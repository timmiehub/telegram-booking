import { createPortal } from 'react-dom'
import { haptic } from '../hooks/useTelegramChrome'

/**
 * Подтверждение опасного/важного действия (отмена, не пришёл).
 * Portal в body — иначе fixed ломается из‑за transform у предков.
 */
export default function ConfirmActionSheet({
  open,
  title = 'Подтвердите',
  text = '',
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Назад',
  busy = false,
  danger = false,
  onClose,
  onConfirm,
}) {
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="sheet-backdrop" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="sheet-panel"
        role="dialog"
        aria-labelledby="confirm-action-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden />
        <h2 id="confirm-action-title" className="text-lg font-semibold">
          {title}
        </h2>
        {text ? (
          <p className="mt-3 text-sm text-[var(--brand-muted)] whitespace-pre-line">
            {text}
          </p>
        ) : null}

        <button
          type="button"
          className={`btn w-full mt-5 ${danger ? 'btn-danger' : 'btn-primary'}`}
          disabled={busy}
          onClick={() => {
            haptic('light')
            onConfirm?.()
          }}
        >
          {busy ? 'Секунду…' : confirmLabel}
        </button>

        <button
          type="button"
          className="btn btn-secondary w-full mt-2"
          disabled={busy}
          onClick={onClose}
        >
          {cancelLabel}
        </button>
      </div>
    </div>,
    document.body,
  )
}
