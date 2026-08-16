import { assetUrl } from '../lib/assets'

/** Компактный бейдж Pro в списках и витрине — в цветах приложения */
export default function ProBadge({ className = '', compact = false, label = 'Pro' }) {
  return (
    <span
      className={`pro-badge ${compact ? 'is-compact' : ''} ${className}`.trim()}
      title="Pro"
    >
      <img
        src={assetUrl('pro-mark.png')}
        alt=""
        width={compact ? 12 : 14}
        height={compact ? 12 : 14}
        className="pro-badge-mark"
      />
      <span>{label}</span>
    </span>
  )
}
