import { assetUrl } from '../lib/assets'

/** Иконка из sprite icons.svg */
export default function Icon({ name, className = '', size = 20 }) {
  return (
    <svg
      className={`ui-icon ${className}`}
      width={size}
      height={size}
      aria-hidden
    >
      <use href={`${assetUrl('icons.svg')}#${name}`} />
    </svg>
  )
}
