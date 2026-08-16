import { useEffect, useState } from 'react'
import { TextField } from './Fields'
import {
  MAX_SEARCH_TAGS,
  normalizeSearchTag,
  normalizeSearchTags,
} from '../lib/searchExpand'
import { haptic } from '../hooks/useTelegramChrome'

/**
 * Теги поиска: мастер задаёт слова, по которым его найдут.
 */
export default function SearchTagsEditor({
  value = [],
  onSave,
  busy = false,
}) {
  const [tags, setTags] = useState(() => normalizeSearchTags(value))
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (busy || dirty) return
    setTags(normalizeSearchTags(value))
  }, [value, busy, dirty])

  function addTag() {
    const t = normalizeSearchTag(draft)
    if (t.length < 2) return
    if (tags.includes(t)) {
      setDraft('')
      return
    }
    if (tags.length >= MAX_SEARCH_TAGS) return
    setTags((prev) => [...prev, t])
    setDraft('')
    setDirty(true)
    haptic('light')
  }

  function removeTag(tag) {
    setTags((prev) => prev.filter((x) => x !== tag))
    setDirty(true)
    haptic('light')
  }

  async function save() {
    const next = normalizeSearchTags(tags)
    setTags(next)
    const res = await onSave?.(next)
    if (res?.ok !== false) {
      setDirty(false)
      haptic('success')
    }
  }

  return (
    <div className="card space-y-3 px-4 py-3">
      <div>
        <h3 className="section-title">Теги для поиска</h3>
        <p className="mt-1 text-sm text-[var(--brand-muted)]">
          Слова, по которым вас найдут: тату, tattoo, tats…
        </p>
      </div>

      {tags.length ? (
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t}>
              <button
                type="button"
                className="pressable preset-chip is-added"
                disabled={busy}
                onClick={() => removeTag(t)}
                title="Убрать"
              >
                {t} ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--brand-muted)]">Пока нет тегов</p>
      )}

      {tags.length < MAX_SEARCH_TAGS ? (
        <TextField
          label="Добавить тег"
          value={draft}
          placeholder="например tats"
          maxLength={24}
          onChange={setDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
          endAdornment={
            <button
              type="button"
              className="pressable price-field-save"
              disabled={busy || normalizeSearchTag(draft).length < 2}
              onClick={addTag}
            >
              Добавить
            </button>
          }
        />
      ) : (
        <p className="text-xs text-[var(--brand-muted)]">
          Максимум {MAX_SEARCH_TAGS} тегов
        </p>
      )}

      {dirty ? (
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={busy}
          onClick={save}
        >
          {busy ? 'Сохраняю…' : 'Сохранить теги'}
        </button>
      ) : null}
    </div>
  )
}
