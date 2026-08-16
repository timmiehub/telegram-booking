import { createPortal } from 'react-dom'
import { haptic } from '../hooks/useTelegramChrome'

/**
 * Bottom sheet: сначала предложить перенос, отмена — с явным подтверждением.
 * locked: слишком поздно по правилу часов — предложить написать исполнителю.
 */
export default function CancelBookingSheet({
  open,
  bookingLabel = '',
  busy = false,
  error = '',
  locked = false,
  hours = 24,
  chatBusy = false,
  onClose,
  onReschedule,
  onConfirmCancel,
  onWriteMaster,
}) {
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="sheet-backdrop" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="sheet-panel"
        role="dialog"
        aria-labelledby="cancel-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden />
        <h2 id="cancel-sheet-title" className="text-lg font-semibold">
          {locked ? 'Уже поздно менять в приложении' : 'Отменить запись?'}
        </h2>
        {bookingLabel ? (
          <p className="mt-1 text-sm text-[var(--brand-muted)]">{bookingLabel}</p>
        ) : null}

        {locked ? (
          <>
            <p className="mt-3 text-sm text-[var(--brand-muted)]">
              Отмена и перенос в приложении — не позже чем за {hours} ч до визита.
              Напишите исполнителю и обговорите лично.
            </p>
            <button
              type="button"
              className="btn btn-primary w-full mt-5"
              disabled={chatBusy}
              onClick={() => {
                haptic('light')
                onWriteMaster?.()
              }}
            >
              {chatBusy ? 'Открываю…' : 'Написать исполнителю'}
            </button>
            <button
              type="button"
              className="btn btn-secondary w-full mt-2"
              disabled={busy || chatBusy}
              onClick={onClose}
            >
              Закрыть
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-[var(--brand-muted)]">
              Если время не подходит — лучше перенести, чем отменять.
            </p>

            <button
              type="button"
              className="btn btn-primary w-full mt-5"
              disabled={busy}
              onClick={() => {
                haptic('light')
                onReschedule?.()
              }}
            >
              Перенести время
            </button>

            <button
              type="button"
              className="btn btn-secondary w-full mt-2"
              disabled={busy}
              onClick={onClose}
            >
              Оставить как есть
            </button>

            {error ? <p className="mt-3 text-sm text-warning">{error}</p> : null}

            <button
              type="button"
              className="btn btn-danger w-full mt-3"
              disabled={busy}
              onClick={() => {
                haptic('light')
                onConfirmCancel?.()
              }}
            >
              {busy ? 'Отменяю…' : 'Да, отменить запись'}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
