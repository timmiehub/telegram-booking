import { useEffect, useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { assetUrl } from '../lib/assets'
import { haptic } from '../hooks/useTelegramChrome'
import { markStorySeen } from '../lib/featureStories'

const SLIDE_MS = 6500
const TAP_MS = 280

function preloadUrl(url) {
  if (!url || typeof Image === 'undefined') return
  const img = new Image()
  img.decoding = 'async'
  img.src = assetUrl(url)
}

/**
 * Полноэкранный просмотр highlights: вопрос → ответ, прогресс, тап влево/вправо.
 */
export default function StoryViewer({ story, onClose, onComplete }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [imgReady, setImgReady] = useState(false)
  const downAtRef = useRef(0)
  const startRef = useRef(0)
  const elapsedRef = useRef(0)
  const rafRef = useRef(0)

  const slides = story?.slides || []
  const slide = slides[index]
  const isLast = index >= slides.length - 1

  const finish = useCallback(() => {
    markStorySeen(story.id)
    onComplete?.(story.id)
    onClose?.()
  }, [story?.id, onClose, onComplete])

  const goNext = useCallback(() => {
    haptic('light')
    if (isLast) {
      finish()
      return
    }
    elapsedRef.current = 0
    setProgress(0)
    setIndex((i) => i + 1)
  }, [isLast, finish])

  const goPrev = useCallback(() => {
    haptic('light')
    elapsedRef.current = 0
    setProgress(0)
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  useEffect(() => {
    if (!story) return undefined
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') {
        markStorySeen(story.id)
        onClose?.()
      }
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [story, goNext, goPrev, onClose])

  useEffect(() => {
    if (!slide) return
    setImgReady(false)
    elapsedRef.current = 0
    setProgress(0)
    preloadUrl(slide.image)
    const next = slides[index + 1]
    if (next) preloadUrl(next.image)
    const next2 = slides[index + 2]
    if (next2) preloadUrl(next2.image)
  }, [slide, index, slides])

  useEffect(() => {
    if (!slide || paused || !imgReady) return undefined
    startRef.current = performance.now() - elapsedRef.current

    const tick = (now) => {
      const elapsed = now - startRef.current
      elapsedRef.current = elapsed
      const p = Math.min(1, elapsed / SLIDE_MS)
      setProgress(p)
      if (p >= 1) {
        goNext()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [slide, index, paused, imgReady, goNext])

  if (!story || !slide || typeof document === 'undefined') return null

  const onPointerDown = () => {
    downAtRef.current = performance.now()
    setPaused(true)
  }
  const onPointerUp = (e) => {
    const held = performance.now() - downAtRef.current
    setPaused(false)
    if (held >= TAP_MS) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX ?? 0
    const rel = (x - rect.left) / Math.max(1, rect.width)
    if (rel < 0.35) goPrev()
    else goNext()
  }

  return createPortal(
    <div className="story-viewer" role="dialog" aria-modal="true" aria-label={story.label}>
      <div className="story-viewer-chrome">
        <div className="story-progress" aria-hidden>
          {slides.map((s, i) => (
            <div key={s.id} className="story-progress-seg">
              <div
                className="story-progress-fill"
                style={{
                  '--fill':
                    i < index ? 1 : i === index ? progress : 0,
                }}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="story-viewer-close pressable"
          aria-label="Закрыть"
          onClick={() => {
            haptic('light')
            markStorySeen(story.id)
            onClose?.()
          }}
        >
          ×
        </button>
      </div>

      <div
        className="story-viewer-body"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setPaused(false)}
      >
        <div className="story-slide fade-up" key={slide.id}>
          <p className="story-for-whom">{slide.forWhom}</p>
          <div className={`story-art-wrap${imgReady ? ' is-ready' : ''}`}>
            <img
              src={assetUrl(slide.image)}
              alt=""
              className="story-art"
              width={320}
              height={320}
              decoding="async"
              fetchPriority="high"
              draggable={false}
              ref={(el) => {
                if (el?.complete && el.naturalWidth > 0) setImgReady(true)
              }}
              onLoad={() => setImgReady(true)}
              onError={() => setImgReady(true)}
            />
          </div>
          <h2 className="story-title">{slide.title}</h2>
          <p className="story-q">{slide.question}</p>
          <p className="story-a">
            <span className="story-a-label">Как решаем</span>
            {slide.answer}
          </p>
        </div>
      </div>

      <div className="story-viewer-hint" aria-hidden>
        {isLast ? 'Готово — выберите роль ниже' : 'Коснитесь, чтобы дальше'}
      </div>
    </div>,
    document.body,
  )
}
