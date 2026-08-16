import { assetUrl } from '../lib/assets'

export default function EmptyState({
  imageSrc = 'empty-day.svg',
  title,
  text,
  actionLabel,
  onAction,
}) {
  return (
    <div className="card fade-up px-5 py-8 text-center">
      <img
        src={assetUrl(imageSrc)}
        alt=""
        className="mx-auto mb-4 h-28 w-28 object-contain"
      />
      <h3 className="display text-lg font-bold">{title}</h3>
      {text ? (
        <p className="mx-auto mt-2 max-w-xs text-sm text-[var(--brand-muted)]">
          {text}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          className="pressable mt-5 rounded-[var(--brand-radius)] px-4 py-3 text-sm font-semibold"
          style={{
            background: 'var(--brand-primary)',
            color: 'var(--brand-btn-text)',
          }}
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
