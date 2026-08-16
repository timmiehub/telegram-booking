import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../hooks/useTelegramChrome'
import { normalizeMediaFrame } from '../lib/settings'

/**
 * Telegram-style crop: drag + zoom, live header preview.
 * kind: 'cover' | 'avatar'
 */
export default function MediaCropSheet({
  open,
  kind = 'cover',
  imageUrl = '',
  previewCoverUrl = '',
  previewAvatarUrl = '',
  businessName = 'Заведение',
  initialLayer = null,
  onClose,
  onSave,
}) {
  const frame = normalizeMediaFrame({
    cover: kind === 'cover' ? initialLayer : undefined,
    avatar: kind === 'avatar' ? initialLayer : undefined,
  })
  const start = kind === 'cover' ? frame.cover : frame.avatar

  const [scale, setScale] = useState(start.scale)
  const [x, setX] = useState(start.x)
  const [y, setY] = useState(start.y)
  const drag = useRef(null)
  const pinch = useRef(null)
  const stageRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const layer = kind === 'cover' ? frame.cover : frame.avatar
    setScale(layer.scale)
    setX(layer.x)
    setY(layer.y)
  }, [open, kind, imageUrl])

  const layerStyle = useMemo(
    () => ({
      backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
      backgroundSize: `${scale * 100}%`,
      backgroundPosition: `${x}% ${y}%`,
    }),
    [imageUrl, scale, x, y],
  )

  const previewCoverStyle = useMemo(() => {
    if (kind === 'cover') return layerStyle
    return {
      backgroundImage: previewCoverUrl ? `url(${previewCoverUrl})` : undefined,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }, [kind, layerStyle, previewCoverUrl])

  const previewAvatarStyle = useMemo(() => {
    if (kind === 'avatar') {
      return {
        ...layerStyle,
        width: 56,
        height: 56,
        borderRadius: '50%',
      }
    }
    return {
      backgroundImage: previewAvatarUrl ? `url(${previewAvatarUrl})` : undefined,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      width: 56,
      height: 56,
      borderRadius: '50%',
    }
  }, [kind, layerStyle, previewAvatarUrl])

  function onPointerDown(e) {
    if (e.pointerType === 'touch' && e.target?.setPointerCapture) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: x,
      startY: y,
    }
  }

  function nudgeY(delta) {
    setY((prev) => Math.max(0, Math.min(100, Math.round(prev + delta))))
    haptic('light')
  }

  function onPointerMove(e) {
    if (!drag.current || drag.current.id !== e.pointerId) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    const sens = 0.28 / Math.max(scale, 1)
    const sensY = kind === 'cover' ? sens * 1.4 : sens
    setX(Math.max(0, Math.min(100, drag.current.startX - dx * sens)))
    setY(Math.max(0, Math.min(100, drag.current.startY - dy * sensY)))
  }

  function onPointerUp(e) {
    if (drag.current?.id === e.pointerId) drag.current = null
  }

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      const [a, b] = e.touches
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      pinch.current = { dist, scale }
      drag.current = null
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 2 && pinch.current) {
      e.preventDefault()
      const [a, b] = e.touches
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const next = pinch.current.scale * (dist / Math.max(pinch.current.dist, 1))
      setScale(Math.max(1, Math.min(3, next)))
    }
  }

  function onTouchEnd(e) {
    if (e.touches.length < 2) pinch.current = null
  }

  if (!open || typeof document === 'undefined') return null

  const title = kind === 'cover' ? 'Кадр шапки' : 'Кадр авы'

  return createPortal(
    <div
      className="sheet-backdrop media-crop-sheet"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="sheet-panel"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden />
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[var(--brand-muted)]">
          Тяните картинку или двигайте ползунки. ↑↓ — мелкий сдвиг по вертикали.
        </p>

        <div className="media-crop-preview-card mt-4">
          <div className="media-crop-preview-cover" style={previewCoverStyle} />
          <div className="media-crop-preview-body">
            <div className="media-crop-preview-avatar" style={previewAvatarStyle} />
            <p className="text-sm font-semibold truncate w-full">{businessName}</p>
          </div>
        </div>

        <div
          ref={stageRef}
          className={`media-crop-stage ${kind === 'avatar' ? 'is-avatar' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="media-crop-stage-img" style={layerStyle} />
        </div>

        <label className="media-crop-zoom">
          Масштаб
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          />
        </label>

        <div className="media-crop-axis">
          <label className="media-crop-zoom flex-1">
            Вертикаль
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={y}
              onChange={(e) => setY(Number(e.target.value))}
            />
          </label>
          <div className="media-crop-nudge">
            <button type="button" className="btn btn-secondary" aria-label="Выше" onClick={() => nudgeY(-2)}>
              ↑
            </button>
            <button type="button" className="btn btn-secondary" aria-label="Ниже" onClick={() => nudgeY(2)}>
              ↓
            </button>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary w-full mt-4"
          onClick={() => {
            haptic('success')
            onSave?.({ scale, x: Math.round(x), y: Math.round(y) })
          }}
        >
          Готово
        </button>
        <button type="button" className="btn btn-secondary w-full mt-2" onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>,
    document.body,
  )
}
