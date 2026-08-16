import { useEffect, useMemo, useState } from 'react'
import { filterCities, normalizeCity } from '../lib/cities'
import { TextField } from './Fields'

/**
 * Поиск/выбор города России.
 */
export default function CityPicker({
  label = 'Город',
  value = '',
  onChange,
  placeholder = 'Начните вводить город',
}) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  const suggestions = useMemo(() => filterCities(query, 10), [query])

  function pick(city) {
    const next = normalizeCity(city)
    setQuery(next)
    setOpen(false)
    onChange?.(next)
  }

  function commitTyped() {
    const next = normalizeCity(query)
    if (next && next !== value) onChange?.(next)
  }

  return (
    <div className="relative">
      <TextField
        label={label}
        value={query}
        placeholder={placeholder}
        onChange={(v) => {
          setQuery(v)
          setOpen(true)
          if (!v.trim()) onChange?.('')
        }}
        onBlur={() => {
          commitTyped()
          setTimeout(() => setOpen(false), 150)
        }}
      />
      {open && suggestions.length ? (
        <ul className="city-suggest">
          {suggestions.map((c) => (
            <li key={c}>
              <button
                type="button"
                className="pressable city-suggest-item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {value ? (
        <p className="mt-1 text-xs text-[var(--brand-muted)]">Выбрано: {value}</p>
      ) : null}
    </div>
  )
}
