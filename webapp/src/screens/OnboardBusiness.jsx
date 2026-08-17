import { useMemo, useState } from 'react'
import AppShell from '../components/AppShell'
import CityPicker from '../components/CityPicker'
import { TextField, MoneyField, NumberField, parseMinutes } from '../components/Fields'
import { createBusiness, slugifyName } from '../lib/business'
import {
  captureGrowthAttributionFromContext,
  growthSettingsPatch,
  readGrowthAttribution,
} from '../lib/growthAttribution'
import { WebApp } from '../lib/telegram'
import WorkCalendar from '../components/WorkCalendar'
import CategoryPicker from '../components/CategoryPicker'
import { createEmptySchedule, fillNextDays, normalizeSchedule } from '../lib/availability'
import { normalizeCity } from '../lib/cities'
import { presetsForType } from '../lib/servicePresets'
import { craftOnboardHints, isGeminiConfigured } from '../lib/gemini'
import { haptic } from '../hooks/useTelegramChrome'

function newCartItem(preset) {
  return {
    key: `${preset.title}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: preset.title,
    duration_min: preset.duration_min || 30,
    price_rub: preset.price_rub ?? 0,
  }
}

export default function OnboardBusiness({ profileId, profile, btnClass, onDone, onCancel }) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [type, setType] = useState('barbershop')
  const [cart, setCart] = useState([])
  const [customTitle, setCustomTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [error, setError] = useState('')
  const [durationErrors, setDurationErrors] = useState({})
  const [extraIdeas, setExtraIdeas] = useState([])
  const [schedule, setSchedule] = useState(() => fillNextDays(createEmptySchedule(), 14))

  const slugPreview = useMemo(() => slugifyName(name), [name])
  const presets = useMemo(() => presetsForType(type), [type])
  const cartTitles = useMemo(() => new Set(cart.map((c) => c.title.toLowerCase())), [cart])

  function addPreset(p) {
    if (cartTitles.has(p.title.toLowerCase())) return
    haptic('light')
    setCart((prev) => [...prev, newCartItem(p)])
  }

  function addCustom() {
    const title = customTitle.trim()
    if (!title) return
    if (cartTitles.has(title.toLowerCase())) {
      setError('Уже в списке')
      return
    }
    haptic('light')
    setCart((prev) => [
      ...prev,
      newCartItem({ title, duration_min: 30, price_rub: 0 }),
    ])
    setCustomTitle('')
    setError('')
  }

  function updateCart(key, patch) {
    setCart((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }

  function removeCart(key) {
    setCart((prev) => prev.filter((c) => c.key !== key))
  }

  async function onAiExtra() {
    setAiBusy(true)
    setError('')
    const hints = await craftOnboardHints({ name: name.trim() || 'Заведение', type })
    const ideas = (hints.services || [])
      .filter((t) => !cartTitles.has(String(t).toLowerCase()))
      .map((title) => ({ title, duration_min: 30, price_rub: 0 }))
    setExtraIdeas(ideas)
    setAiBusy(false)
  }

  function goServices() {
    if (!name.trim()) {
      setError('Укажите название')
      return
    }
    if (!normalizeCity(city)) {
      setError('Укажите город')
      return
    }
    setError('')
    setStep(2)
    haptic('light')
  }

  function goSchedule() {
    if (!cart.length) {
      setError('Добавьте хотя бы одну услугу')
      return
    }
    const nextErrors = {}
    for (const c of cart) {
      const dur = parseMinutes(c.duration_min)
      if (dur == null) {
        nextErrors[c.key] = 'Укажите время оказания услуги'
      } else if (dur < 10) {
        nextErrors[c.key] = 'Минимум 10 минут'
      } else if (dur > 480) {
        nextErrors[c.key] = 'Максимум 8 часов (480 мин)'
      }
    }
    if (Object.keys(nextErrors).length) {
      setDurationErrors(nextErrors)
      setError('Проверьте длительность услуг')
      haptic('error')
      return
    }
    setDurationErrors({})
    setError('')
    setStep(3)
    haptic('light')
  }

  async function submit() {
    if (!cart.length) {
      setError('Добавьте хотя бы одну услугу')
      return
    }
    for (const c of cart) {
      if (!c.title.trim()) {
        setError('У услуги нужно название')
        return
      }
      const dur = parseMinutes(c.duration_min)
      if (dur == null || dur < 10 || dur > 480) {
        setError('Укажите время оказания услуги (от 10 минут)')
        return
      }
      if (Number(c.price_rub) < 0 || Number.isNaN(Number(c.price_rub))) {
        setError('Проверьте цены')
        return
      }
    }
    setBusy(true)
    setError('')
    captureGrowthAttributionFromContext()
    const attr = readGrowthAttribution()
    const ownerTg = profile?.telegram_id ?? null
    const result = await createBusiness({
      name: name.trim(),
      type,
      slug: slugPreview,
      ownerProfileId: profileId,
      city: normalizeCity(city),
      services: cart.map((c) => ({
        title: c.title.trim(),
        duration_min: parseMinutes(c.duration_min),
        price_cents: Math.round(Number(c.price_rub || 0) * 100),
      })),
      workHours: normalizeSchedule(schedule),
      settingsPatch: growthSettingsPatch(attr, ownerTg),
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error || 'Не удалось создать')
      return
    }
    haptic('success')
    onDone?.(result.business)
  }

  return (
    <AppShell className="booking-shell fade-up">
      <button
        type="button"
        className="mb-4 text-sm text-[var(--brand-muted)]"
        onClick={() => {
          if (step === 3) setStep(2)
          else if (step === 2) setStep(1)
          else onCancel?.()
        }}
      >
        ← Назад
      </button>

      <p className="meta-label">Шаг {step} из 3</p>
      <h1 className="display mt-1 text-2xl font-extrabold leading-tight">
        {step === 1
          ? 'Ваше заведение'
          : step === 2
            ? 'Услуги и цены'
            : 'Когда принимаете'}
      </h1>
      <p className="mt-2 mb-6 text-sm text-[var(--brand-muted)]">
        {step === 1
          ? 'Название, город и тип — клиенты найдут вас в своём городе.'
          : step === 2
            ? 'Нажмите + на типичных услугах, укажите цену. Свои тоже можно.'
            : 'От этого строятся окна для записи по вашей ссылке.'}
      </p>

      {step === 1 ? (
        <div className="space-y-5">
          <TextField
            label="Название"
            value={name}
            onChange={setName}
            placeholder="Например: Fade Room"
            maxLength={80}
          />

          <CityPicker
            label="Город"
            value={city}
            onChange={setCity}
            placeholder="Москва, Казань…"
          />

          <CategoryPicker value={type} onChange={setType} label="Тип" />

          <p className="text-xs text-[var(--brand-muted)]">
            Ссылка: ?business={slugPreview || '…'}
          </p>

          {error ? <p className="text-sm text-warning">{error}</p> : null}

          <button type="button" className={btnClass} onClick={goServices}>
            Дальше — услуги
          </button>
        </div>
      ) : step === 2 ? (
        <div className="space-y-5">
          <div>
            <p className="meta-label mb-2">Популярные для типа</p>
            <ul className="flex flex-wrap gap-2">
              {presets.map((p) => {
                const added = cartTitles.has(p.title.toLowerCase())
                return (
                  <li key={p.title}>
                    <button
                      type="button"
                      className={`pressable preset-chip ${added ? 'is-added' : ''}`}
                      disabled={added}
                      onClick={() => addPreset(p)}
                    >
                      {added ? '✓ ' : '+ '}
                      {p.title}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          {isGeminiConfigured() ? (
            <button
              type="button"
              className="pressable booking-link"
              disabled={aiBusy}
              onClick={onAiExtra}
            >
              {aiBusy ? 'Ищу идеи…' : 'Ещё идеи услуг'}
            </button>
          ) : null}

          {extraIdeas.length ? (
            <ul className="flex flex-wrap gap-2">
              {extraIdeas.map((p) => (
                <li key={p.title}>
                  <button
                    type="button"
                    className="pressable preset-chip"
                    onClick={() => addPreset(p)}
                  >
                    + {p.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div>
            <p className="meta-label mb-2">Ваш список</p>
            {!cart.length ? (
              <p className="text-sm text-[var(--brand-muted)]">
                Пока пусто — нажмите + на услугах выше.
              </p>
            ) : (
              <ul className="space-y-3">
                {cart.map((c) => (
                  <li key={c.key} className="card px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{c.title}</p>
                      <button
                        type="button"
                        className="text-xs text-[var(--brand-muted)]"
                        onClick={() => removeCart(c.key)}
                      >
                        Убрать
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <NumberField
                        label="Минут"
                        value={c.duration_min}
                        min={10}
                        max={480}
                        suffix="мин"
                        placeholder="например 45"
                        error={durationErrors[c.key] || ''}
                        onChange={(v) => {
                          updateCart(c.key, { duration_min: v })
                          if (durationErrors[c.key]) {
                            setDurationErrors((prev) => {
                              const next = { ...prev }
                              delete next[c.key]
                              return next
                            })
                          }
                        }}
                      />
                      <MoneyField
                        label="Цена"
                        value={
                          c.price_rub === '' || c.price_rub == null
                            ? ''
                            : String(c.price_rub)
                        }
                        onChange={(raw) =>
                          updateCart(c.key, { price_rub: raw })
                        }
                        showSave={false}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <TextField
            label="Своя услуга"
            value={customTitle}
            onChange={setCustomTitle}
            placeholder="Своя услуга"
            maxLength={60}
            endAdornment={
              <button
                type="button"
                className="pressable booking-secondary-btn shrink-0 px-4"
                onClick={addCustom}
              >
                +
              </button>
            }
          />

          {error ? <p className="text-sm text-warning">{error}</p> : null}

          <button
            type="button"
            className={btnClass}
            disabled={busy || !cart.length}
            onClick={goSchedule}
          >
            Дальше — расписание
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <WorkCalendar schedule={schedule} onChange={setSchedule} compact />
          <p className="text-sm text-[var(--brand-muted)]">
            Отметьте дни в календаре. Позже можно изменить в профиле.
          </p>
          {error ? <p className="text-sm text-warning">{error}</p> : null}
          <button
            type="button"
            className={btnClass}
            disabled={busy}
            onClick={submit}
          >
            {busy ? 'Создаю…' : 'Создать кабинет'}
          </button>
        </div>
      )}
    </AppShell>
  )
}
