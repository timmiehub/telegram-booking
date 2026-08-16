import { useCallback, useEffect, useRef, useState } from 'react'
import { assetUrl } from '../lib/assets'
import { haptic } from '../hooks/useTelegramChrome'
import { WebApp } from '../lib/telegram'

/**
 * Полноэкранный просмотр портфолио: стрелки, крестик, свайп.
 */
export default function PortfolioLightbox({
  images = [],
  index = 0,
  onClose,
  onIndexChange,
}) {
  const list = Array.isArray(images) ? images.filter((x) => x?.image_url || x?.url) : []
  const [i, setI] = useState(index)
  const touchX = useRef(null)

  const go = useCallback(
    (next) => {
      if (!list.length) return
      const n = ((next % list.length) + list.length) % list.length
      setI(n)
      onIndexChange?.(n)
      haptic('light')
    },
    [list.length, onIndexChange],
  )

  useEffect(() => {
    setI(Math.max(0, Math.min(index, Math.max(0, list.length - 1))))
  }, [index, list.length])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'ArrowLeft') go(i - 1)
      if (e.key === 'ArrowRight') go(i + 1)
    }
    window.addEventListener('keydown', onKey)
    WebApp.BackButton?.show?.()
    const off = () => onClose?.()
    WebApp.BackButton?.onClick?.(off)
    return () => {
      window.removeEventListener('keydown', onKey)
      WebApp.BackButton?.offClick?.(off)
      WebApp.BackButton?.hide?.()
    }
  }, [go, i, onClose])

  if (!list.length) return null

  const current = list[i]
  const src = assetUrl(current.image_url || current.url)

  return (
    <div
      className="portfolio-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр фото"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <button
        type="button"
        className="portfolio-lightbox-close"
        aria-label="Закрыть"
        onClick={onClose}
      >
        ×
      </button>

      <p className="portfolio-lightbox-count">
        {i + 1} / {list.length}
      </p>

      <button
        type="button"
        className="portfolio-lightbox-nav is-prev"
        aria-label="Предыдущее"
        onClick={(e) => {
          e.stopPropagation()
          go(i - 1)
        }}
      >
        ‹
      </button>

      <div
        className="portfolio-lightbox-stage"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          touchX.current = e.changedTouches[0]?.clientX ?? null
        }}
        onTouchEnd={(e) => {
          const start = touchX.current
          const end = e.changedTouches[0]?.clientX
          touchX.current = null
          if (start == null || end == null) return
          const dx = end - start
          if (Math.abs(dx) < 48) return
          go(dx > 0 ? i - 1 : i + 1)
        }}
      >
        <img src={src} alt="" className="portfolio-lightbox-img" />
      </div>

      <button
        type="button"
        className="portfolio-lightbox-nav is-next"
        aria-label="Следующее"
        onClick={(e) => {
          e.stopPropagation()
          go(i + 1)
        }}
      >
        ›
      </button>
    </div>
  )
}
