import { useEffect, useMemo, useState } from 'react'
import { filterCategories, categoryLabel } from '../lib/searchExpand'
import { TextField } from './Fields'

/**
 * Свернутый выбор категории с поиском по списку.
 */
export default function CategoryPicker({
  value = 'other',
  onChange,
  disabled = false,
  label = 'Тип организации',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const list = useMemo(() => filterCategories(query, 20), [query])
  const currentLabel = categoryLabel(value)

  function pick(id) {
    onChange?.(id)
    setOpen(false)
  }

  return (
    <div>
      <span className="meta-label">{label}</span>
      {!open ? (
        <div className="mt-2 flex items-center gap-2">
          <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--brand-text)]">
            {currentLabel}
          </p>
          <button
            type="button"
            className="btn btn-secondary shrink-0"
            disabled={disabled}
            onClick={() => setOpen(true)}
          >
            Изменить
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <TextField
            label="Найти категорию"
            value={query}
            placeholder="тату, ногти, массаж…"
            onChange={setQuery}
            autoFocus
          />
          <ul className="city-suggest category-picker-list">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`pressable city-suggest-item ${
                    c.id === value ? 'is-selected' : ''
                  }`}
                  disabled={disabled}
                  onClick={() => pick(c.id)}
                >
                  {c.label}
                </button>
              </li>
            ))}
            {!list.length ? (
              <li className="px-3 py-2 text-sm text-[var(--brand-muted)]">
                Ничего не нашлось
              </li>
            ) : null}
          </ul>
          <button
            type="button"
            className="pressable booking-link text-sm"
            onClick={() => setOpen(false)}
          >
            Свернуть
          </button>
        </div>
      )}
    </div>
  )
}
