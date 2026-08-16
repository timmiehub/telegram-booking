import { useEffect, useRef, useState } from 'react'
import { haptic } from '../hooks/useTelegramChrome'

function pad(n) {
  return String(n).padStart(2, '0')
}

function parseTime(value) {
  const [h, m] = String(value || '00:00').split(':')
  return {
    h: Math.max(0, Math.min(23, Number(h) || 0)),
    m: Math.max(0, Math.min(59, Number(m) || 0)),
  }
}

function WheelColumn({ items, value, onChange, suffix = '' }) {
  const listRef = useRef(null)
  const itemHeight = 42
  const visibleCount = 5
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (listRef.current && !isDragging) {
      listRef.current.scrollTop = value * itemHeight
    }
  }, [value, isDragging])

  function scrollToIndex(index) {
    const clamped = Math.max(0, Math.min(items.length - 1, index))
    if (clamped !== value) {
      haptic('light')
      onChange(clamped)
    }
  }

  function onScroll() {
    if (!listRef.current) return
    const index = Math.round(listRef.current.scrollTop / itemHeight)
    scrollToIndex(index)
  }

  function snap() {
    if (!listRef.current) return
    const index = Math.round(listRef.current.scrollTop / itemHeight)
    listRef.current.scrollTo({ top: index * itemHeight, behavior: 'smooth' })
    scrollToIndex(index)
  }

  return (
    <div className="time-wheel-column" style={{ '--item-height': `${itemHeight}px` }}>
      <div className="time-wheel-column-shade" aria-hidden />
      <ul
        ref={listRef}
        className="time-wheel-list"
        onScroll={onScroll}
        onMouseDown={() => setIsDragging(true)}
        onMouseUp={() => {
          setIsDragging(false)
          snap()
        }}
        onTouchStart={() => setIsDragging(true)}
        onTouchEnd={() => {
          setIsDragging(false)
          setTimeout(snap, 80)
        }}
      >
        {items.map((item, i) => (
          <li
            key={item}
            className={`time-wheel-item ${i === value ? 'is-active' : ''}`}
            onClick={() => {
              if (listRef.current) {
                listRef.current.scrollTo({ top: i * itemHeight, behavior: 'smooth' })
              }
              scrollToIndex(i)
            }}
          >
            {pad(item)}{suffix}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function TimeWheel({ value = '09:00', onChange }) {
  const { h, m } = parseTime(value)
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const minutes = Array.from({ length: 60 }, (_, i) => i)

  return (
    <div className="time-wheel">
      <WheelColumn items={hours} value={h} onChange={(nh) => onChange(`${pad(nh)}:${pad(m)}`)} />
      <span className="time-wheel-separator">:</span>
      <WheelColumn items={minutes} value={m} onChange={(nm) => onChange(`${pad(h)}:${pad(nm)}`)} />
    </div>
  )
}
