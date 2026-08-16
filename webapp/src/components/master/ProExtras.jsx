import { useEffect, useState } from 'react'
import { TextField } from '../Fields'
import { updateBusinessSettings } from '../../lib/settings'
import { normalizeReminders } from '../../lib/remindersSettings'
import {
  MAX_LOCATIONS,
  MAX_REPLY_TEMPLATES,
  normalizeLocations,
  normalizeReplyTemplates,
  primaryLocation,
} from '../../lib/proExtras'
import { updateBusinessCity, updateBusinessAddress } from '../../lib/business'
import { haptic } from '../../hooks/useTelegramChrome'
import {
  fetchBlockedClients,
  setClientBlocked,
} from '../../lib/clientNotes'

/**
 * Компактные Pro-блоки: напоминания, отчёт, шаблоны, адреса, ЧС.
 */
export default function ProExtras({
  businessId,
  masterId,
  settings,
  onSettingsChange,
}) {
  const rem = normalizeReminders(settings?.reminders)
  const [r24, setR24] = useState(rem.client_24h || '')
  const [r2, setR2] = useState(rem.client_2h || '')
  const [after, setAfter] = useState(rem.after_visit || '')
  const [afterOn, setAfterOn] = useState(Boolean(rem.after_visit_on))
  const [templates, setTemplates] = useState(() =>
    normalizeReplyTemplates(settings?.reply_templates),
  )
  const [locations, setLocations] = useState(() =>
    normalizeLocations(settings?.locations),
  )
  const [blocked, setBlocked] = useState([])
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    const next = normalizeReminders(settings?.reminders)
    setR24(next.client_24h || '')
    setR2(next.client_2h || '')
    setAfter(next.after_visit || '')
    setAfterOn(Boolean(next.after_visit_on))
    setTemplates(normalizeReplyTemplates(settings?.reply_templates))
    setLocations(normalizeLocations(settings?.locations))
  }, [settings])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!masterId) return
      const rows = await fetchBlockedClients(masterId)
      if (!cancelled) setBlocked(rows)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [masterId])

  async function savePatch(patch, okMsg) {
    if (!businessId) return
    setBusy('save')
    setToast('')
    const res = await updateBusinessSettings(businessId, patch)
    setBusy('')
    if (!res.ok) {
      setToast(res.error || 'Не сохранилось')
      return
    }
    onSettingsChange?.(res.settings)
    haptic('success')
    setToast(okMsg || 'Сохранено')
  }

  async function saveReminders() {
    await savePatch(
      {
        reminders: normalizeReminders({
          client_24h: r24,
          client_2h: r2,
          after_visit: after,
          after_visit_on: afterOn,
        }),
      },
      'Тексты напоминаний сохранены',
    )
  }

  async function requestReport() {
    const now = new Date()
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    const month = prev.toISOString().slice(0, 10)
    await savePatch({ request_report: month }, 'Отчёт уйдёт в Telegram в течение минуты')
  }

  async function saveTemplates() {
    await savePatch(
      { reply_templates: normalizeReplyTemplates(templates) },
      'Шаблоны сохранены',
    )
  }

  async function saveLocations() {
    if (!businessId) return
    setBusy('save')
    setToast('')
    const normalized = normalizeLocations(locations)
    const resPatch = await updateBusinessSettings(businessId, {
      locations: normalized,
    })
    if (!resPatch.ok) {
      setBusy('')
      setToast(resPatch.error || 'Не сохранилось')
      return
    }
    const main = primaryLocation(normalized)
    if (main) {
      if (main.city) await updateBusinessCity(businessId, main.city)
      if (main.address) await updateBusinessAddress(businessId, main.address)
    }
    setBusy('')
    onSettingsChange?.(resPatch.settings)
    haptic('success')
    setToast('Адреса сохранены')
  }

  function addTemplate() {
    if (templates.length >= MAX_REPLY_TEMPLATES) return
    setTemplates((prev) => [
      ...prev,
      { id: `t${Date.now()}`, keys: ['цена'], text: 'Актуальные цены — в приложении.' },
    ])
  }

  function addLocation() {
    if (locations.length >= MAX_LOCATIONS) return
    setLocations((prev) => [
      ...prev,
      {
        id: `loc${Date.now()}`,
        title: `Точка ${prev.length + 1}`,
        address: '',
        city: '',
        primary: prev.length === 0,
      },
    ])
  }

  async function unblock(clientTelegramId) {
    setBusy(`u${clientTelegramId}`)
    const res = await setClientBlocked(masterId, clientTelegramId, false)
    setBusy('')
    if (res.ok) {
      setBlocked((prev) => prev.filter((r) => r.client_telegram_id !== clientTelegramId))
      haptic('success')
    }
  }

  return (
    <div className="space-y-4">
      <div id="pro-reminders" className="card space-y-3 px-4 py-3">
        <h3 className="section-title">Тексты клиенту</h3>
        <p className="text-sm text-[var(--brand-muted)]">
          Бот сам пишет клиенту перед визитом. Здесь можно заменить стандартный
          текст на свой.
        </p>
        <p className="text-xs text-[var(--brand-muted)]">
          Можно вставить: время {'{time}'}, услуга {'{title}'}, адрес{' '}
          {'{place}'}. Пустое поле — стандартный текст.
        </p>
        <TextField
          label="За сутки до визита"
          value={r24}
          onChange={setR24}
          placeholder="Например: Завтра в {time} — {title}. Если планы изменились, напишите."
          maxLength={500}
        />
        <TextField
          label="За 2 часа"
          value={r2}
          onChange={setR2}
          placeholder="Например: Через пару часов, в {time} — ждём вас."
          maxLength={500}
        />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={afterOn}
            onChange={(e) => setAfterOn(e.target.checked)}
          />
          <span>
            Спасибо после визита
            <span className="block text-xs text-[var(--brand-muted)] font-normal mt-0.5">
              Одно короткое сообщение, когда отметите визит завершённым.
            </span>
          </span>
        </label>
        {afterOn ? (
          <TextField
            label="Текст после визита"
            value={after}
            onChange={setAfter}
            placeholder="Например: Спасибо, что были на «{title}». Будем рады снова."
            maxLength={500}
          />
        ) : null}
        <button
          type="button"
          className="btn btn-secondary w-full"
          disabled={busy === 'save'}
          onClick={saveReminders}
        >
          Сохранить тексты
        </button>
      </div>

      <div className="card space-y-2 px-4 py-3">
        <h3 className="section-title">Отчёт за месяц</h3>
        <p className="text-xs text-[var(--brand-muted)]">
          Пришлём в Telegram отчёт за прошлый месяц.
        </p>
        <button
          type="button"
          className="btn btn-secondary w-full"
          disabled={busy === 'save'}
          onClick={requestReport}
        >
          Прислать отчёт в Telegram
        </button>
      </div>

      <div id="pro-templates" className="card space-y-3 px-4 py-3">
        <h3 className="section-title">Шаблоны в чате</h3>
        <p className="text-sm text-[var(--brand-muted)]">
          Клиент или вы пишете слово — бот отвечает готовым текстом (до{' '}
          {MAX_REPLY_TEMPLATES}). Без нейросети.
        </p>
        {templates.map((t, idx) => (
          <div key={t.id} className="space-y-2 border-t border-[color-mix(in_srgb,var(--brand-text)_8%,transparent)] pt-2">
            <TextField
              label="Слова-триггеры"
              value={(t.keys || []).join(', ')}
              onChange={(v) => {
                setTemplates((prev) =>
                  prev.map((x, i) =>
                    i === idx
                      ? {
                          ...x,
                          keys: v.split(',').map((k) => k.trim()).filter(Boolean),
                        }
                      : x,
                  ),
                )
              }}
              placeholder="Например: цена, прайс, сколько"
            />
            <TextField
              label="Что ответить"
              value={t.text}
              onChange={(v) => {
                setTemplates((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, text: v } : x)),
                )
              }}
              placeholder="Например: Актуальные цены — в приложении."
              maxLength={800}
            />
            <button
              type="button"
              className="btn btn-ghost w-full"
              onClick={() => setTemplates((prev) => prev.filter((_, i) => i !== idx))}
            >
              Удалить
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-ghost w-full"
          disabled={templates.length >= MAX_REPLY_TEMPLATES}
          onClick={addTemplate}
        >
          Добавить шаблон
        </button>
        <button
          type="button"
          className="btn btn-secondary w-full"
          disabled={busy === 'save'}
          onClick={saveTemplates}
        >
          Сохранить шаблоны
        </button>
      </div>

      <div id="pro-locations" className="card space-y-3 px-4 py-3">
        <h3 className="section-title">Адреса</h3>
        <p className="text-xs text-[var(--brand-muted)]">
          До {MAX_LOCATIONS} точек. Клиент выберет при записи.
        </p>
        {locations.map((loc, idx) => (
          <div key={loc.id} className="space-y-2 border-t border-[color-mix(in_srgb,var(--brand-text)_8%,transparent)] pt-2">
            <TextField
              label="Название"
              value={loc.title}
              onChange={(v) => {
                setLocations((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, title: v } : x)),
                )
              }}
            />
            <TextField
              label="Город"
              value={loc.city}
              onChange={(v) => {
                setLocations((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, city: v } : x)),
                )
              }}
            />
            <TextField
              label="Адрес"
              value={loc.address}
              onChange={(v) => {
                setLocations((prev) =>
                  prev.map((x, i) => (i === idx ? { ...x, address: v } : x)),
                )
              }}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="primary-loc"
                checked={Boolean(loc.primary)}
                onChange={() => {
                  setLocations((prev) =>
                    prev.map((x, i) => ({ ...x, primary: i === idx })),
                  )
                }}
              />
              Основная
            </label>
            <button
              type="button"
              className="btn btn-ghost w-full"
              onClick={() => setLocations((prev) => prev.filter((_, i) => i !== idx))}
            >
              Удалить
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-ghost w-full"
          disabled={locations.length >= MAX_LOCATIONS}
          onClick={addLocation}
        >
          Добавить адрес
        </button>
        <button
          type="button"
          className="btn btn-secondary w-full"
          disabled={busy === 'save'}
          onClick={saveLocations}
        >
          Сохранить адреса
        </button>
      </div>

      <div id="pro-blacklist" className="card space-y-2 px-4 py-3">
        <h3 className="section-title">Чёрный список</h3>
        <p className="text-xs text-[var(--brand-muted)]">
          Блокировка — в карточке клиента на вкладке «Сегодня».
        </p>
        {!blocked.length ? (
          <p className="text-sm text-[var(--brand-muted)]">Пока пусто</p>
        ) : (
          <ul className="space-y-2">
            {blocked.map((row) => (
              <li key={row.client_telegram_id} className="flex items-center justify-between gap-2">
                <span className="text-sm truncate">
                  {row.display_name || `TG ${row.client_telegram_id}`}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy === `u${row.client_telegram_id}`}
                  onClick={() => unblock(row.client_telegram_id)}
                >
                  Снять
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {toast ? <p className="text-sm text-[var(--brand-primary)]">{toast}</p> : null}
    </div>
  )
}
