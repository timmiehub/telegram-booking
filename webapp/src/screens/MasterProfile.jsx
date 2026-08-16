import { useEffect, useMemo, useState } from 'react'
import CityPicker from '../components/CityPicker'
import ServiceSortableList from '../components/ServiceSortableList'
import Toast from '../components/Toast'
import PortfolioLightbox from '../components/PortfolioLightbox'
import { TextField } from '../components/Fields'
import { useToast } from '../hooks/useToast'
import { createService } from '../lib/services'
import { presetsForType } from '../lib/servicePresets'
import {
  updateBusinessMedia,
  updateBusinessName,
  updateBusinessType,
  uploadBusinessImage,
  fetchPortfolio,
  addPortfolioImage,
  removePortfolioImage,
} from '../lib/media'
import { updateBusinessCity, updateBusinessAddress, updateBusinessSearchTags } from '../lib/business'
import { normalizeCity } from '../lib/cities'
import {
  fetchBusinessSettings,
  updateBusinessSettings,
  DEFAULT_BUSINESS_SETTINGS,
  normalizeMediaFrame,
} from '../lib/settings'
import {
  fillNextDays,
  createEmptySchedule,
  fetchMemberAvailability,
  updateMemberSchedule,
} from '../lib/availability'
import { assetUrl } from '../lib/assets'
import { haptic } from '../hooks/useTelegramChrome'
import BrandColorCard from '../components/master/BrandColorCard'
import CategoryPicker from '../components/CategoryPicker'
import SearchTagsEditor from '../components/SearchTagsEditor'
import { canUseBrand, isProPlan, portfolioMax, canAddPortfolioItem, getProPriceLabel } from '../lib/pro'
import ProPanel from './ProPanel'
import SettingsHub from '../components/master/SettingsHub'
import ScheduleSection from './master/ScheduleSection'
import MediaCropSheet from '../components/MediaCropSheet'

const SECTION_TITLE = {
  profile: 'Профиль',
  media: 'Профиль',
  services: 'Услуги',
  schedule: 'Расписание',
  pro: 'Pro',
}

export default function MasterProfile({
  businessId,
  masterId,
  masterSlug = '',
  businessType = 'other',
  businessName,
  businessCity = '',
  businessAddress = '',
  businessSearchTags = [],
  businessCreatedAt = null,
  members = [],
  theme,
  services = [],
  initialSection = 'hub',
  onServicesChange,
  onBusinessMediaChange,
  onTypeChange,
  onCityChange,
  onAddressChange,
  onSearchTagsChange,
  onThemeRefresh,
  onOpenPro,
  onPlanChange,
  onMediaFrameChange,
}) {
  const [section, setSection] = useState(
    initialSection === 'media' ? 'profile' : initialSection,
  )
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const { message: toastMsg, kind: toastKind, showToast } = useToast()
  const [customTitle, setCustomTitle] = useState('')
  const [nameDraft, setNameDraft] = useState(businessName || '')
  const [cityLocal, setCityLocal] = useState(businessCity || '')
  const [addressLocal, setAddressLocal] = useState(businessAddress || '')
  const [typeLocal, setTypeLocal] = useState(businessType)
  const [tagsLocal, setTagsLocal] = useState(businessSearchTags || [])
  const [schedule, setSchedule] = useState(() => fillNextDays(createEmptySchedule(), 14))
  const [bizSettings, setBizSettings] = useState(DEFAULT_BUSINESS_SETTINGS)
  const [portfolio, setPortfolio] = useState([])
  const [portfolioBusy, setPortfolioBusy] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [crop, setCrop] = useState(null)

  const activeServices = useMemo(
    () => (services || []).filter((s) => s.is_active !== false),
    [services],
  )

  const presets = presetsForType(typeLocal || businessType)
  const existingTitles = new Set(
    activeServices.map((s) => String(s.title || '').toLowerCase()),
  )
  const mediaFrame = normalizeMediaFrame(bizSettings.media_frame)

  useEffect(() => {
    const next = initialSection === 'media' ? 'profile' : initialSection
    setSection(next)
  }, [initialSection])

  useEffect(() => {
    setNameDraft(businessName || '')
  }, [businessName])

  useEffect(() => {
    setCityLocal(businessCity || '')
  }, [businessCity])

  useEffect(() => {
    setAddressLocal(businessAddress || '')
  }, [businessAddress])

  useEffect(() => {
    setTypeLocal(businessType)
  }, [businessType])

  useEffect(() => {
    setTagsLocal(businessSearchTags || [])
  }, [businessSearchTags])

  useEffect(() => {
    if (!businessId) return
    fetchBusinessSettings(businessId).then(({ settings }) => {
      setBizSettings(settings)
      onPlanChange?.(settings)
      onMediaFrameChange?.(settings.media_frame)
    })
  }, [businessId])

  async function onSaveSearchTags(nextTags) {
    if (!businessId) return { ok: false, error: 'Нет id' }
    setBusy('tags')
    setError('')
    const res = await updateBusinessSearchTags(businessId, nextTags)
    setBusy('')
    if (!res.ok) {
      setError(res.error || 'Теги не сохранились')
      return res
    }
    setTagsLocal(res.tags || nextTags)
    showToast('Теги сохранены')
    onSearchTagsChange?.(res.tags || nextTags)
    return res
  }

  async function onMediaFramePatch(layerKind, layer) {
    if (!businessId) return
    const nextFrame = normalizeMediaFrame({
      ...mediaFrame,
      [layerKind]: layer,
    })
    setBizSettings((prev) => ({ ...prev, media_frame: nextFrame }))
    onMediaFrameChange?.(nextFrame)
    const res = await updateBusinessSettings(businessId, { media_frame: nextFrame })
    if (!res.ok) {
      setError(res.error || 'Кадр не сохранился')
      return
    }
    setBizSettings(res.settings)
    showToast('Кадр сохранён')
  }

  function openCrop(kind) {
    const url =
      kind === 'cover'
        ? assetUrl(theme.cover_url || 'cover-demo.svg')
        : assetUrl(theme.logo_url || 'avatar-demo.svg')
    setCrop({ kind, url })
  }

  useEffect(() => {
    let cancelled = false
    async function loadPortfolio() {
      if (!businessId) {
        if (!cancelled) setPortfolio([])
        return
      }
      const rows = await fetchPortfolio(businessId)
      if (!cancelled) setPortfolio(rows)
    }
    loadPortfolio()
    return () => {
      cancelled = true
    }
  }, [businessId])

  useEffect(() => {
    let cancelled = false
    async function loadHours() {
      if (!masterId) return
      const { schedule: loaded } = await fetchMemberAvailability(masterId)
      if (!cancelled) setSchedule(loaded)
    }
    loadHours()
    return () => {
      cancelled = true
    }
  }, [masterId])

  async function onPickFile(kind, file) {
    if (!file || !businessId) return
    setBusy(kind)
    setError('')
    const up = await uploadBusinessImage({ businessId, file, kind })
    if (!up.ok) {
      setBusy('')
      setError(up.error || 'Не удалось загрузить фото')
      return
    }
    const patch =
      kind === 'cover' ? { coverUrl: up.url } : { avatarUrl: up.url }
    const upd = await updateBusinessMedia({
      businessId,
      masterId,
      ...patch,
    })
    setBusy('')
    if (!upd.ok) {
      setError(upd.error || 'Не сохранилось')
      return
    }
    haptic('success')
    showToast(kind === 'cover' ? 'Шапка загружена' : 'Ава загружена')
    onBusinessMediaChange?.()
    setCrop({
      kind: kind === 'cover' ? 'cover' : 'avatar',
      url: up.url,
    })
  }

  async function onAddPortfolio(files) {
    const list = Array.isArray(files)
      ? files.filter(Boolean)
      : Array.from(files || []).filter(Boolean)
    if (!businessId) {
      setError('Нет кабинета — перезайдите в приложение')
      return
    }
    if (!list.length) {
      setError('Фото не выбралось. Попробуйте ещё раз.')
      return
    }

    const max = portfolioMax(bizSettings)
    const room = Math.max(0, max - portfolio.length)
    if (room <= 0) {
      onOpenPro?.()
      setSection('pro')
      showToast(`На free — до ${max} фото. Остальное в Pro.`)
      return
    }

    const batch = list.slice(0, room)
    const skipped = list.length - batch.length

    setPortfolioBusy(true)
    setError('')
    const added = []
    let lastError = ''

    for (const file of batch) {
      const up = await uploadBusinessImage({ businessId, file, kind: 'portfolio' })
      if (!up.ok) {
        lastError = up.error || 'Не удалось загрузить фото'
        continue
      }
      const res = await addPortfolioImage({ businessId, imageUrl: up.url })
      if (!res.ok) {
        lastError = res.error || 'Не сохранилось'
        continue
      }
      added.push(res.row)
    }

    setPortfolioBusy(false)
    if (added.length) {
      setPortfolio((prev) => [...added, ...prev])
      haptic('success')
      if (added.length === 1) showToast('Фото в портфолио')
      else showToast(`Добавлено ${added.length} фото`)
    }
    if (skipped > 0) {
      showToast(`Лимит ${max}: ещё ${skipped} не вошли. Pro — больше фото.`)
    }
    if (lastError && !added.length) {
      setError(lastError)
      showToast(lastError)
    } else if (lastError) {
      setError(`Часть не загрузилась: ${lastError}`)
    }
  }

  async function onRemovePortfolio(id) {
    setPortfolioBusy(true)
    const res = await removePortfolioImage(id)
    setPortfolioBusy(false)
    if (!res.ok) {
      setError(res.error || 'Не удалилось')
      return
    }
    setPortfolio((prev) => prev.filter((p) => p.id !== id))
    haptic('success')
  }

  async function onSaveName() {
    if (!businessId) return
    setBusy('name')
    setError('')
    const res = await updateBusinessName(businessId, nameDraft)
    setBusy('')
    if (!res.ok) {
      setError(res.error || 'Не сохранилось')
      return
    }
    haptic('success')
    showToast('Название сохранено')
    onBusinessMediaChange?.()
  }

  async function onSaveCity(nextCity) {
    if (!businessId) return
    const city = normalizeCity(nextCity)
    setCityLocal(city)
    setBusy('city')
    setError('')
    const res = await updateBusinessCity(businessId, city)
    setBusy('')
    if (!res.ok) {
      setError(res.error || 'Город не сохранился')
      return
    }
    haptic('success')
    showToast(city ? 'Город сохранён' : 'Город очищен')
    onCityChange?.(city)
    onBusinessMediaChange?.()
  }

  async function onSaveAddress(nextAddress) {
    if (!businessId) return
    const addr = String(nextAddress || '').trim().slice(0, 200)
    setAddressLocal(addr)
    setBusy('address')
    setError('')
    const res = await updateBusinessAddress(businessId, addr)
    setBusy('')
    if (!res.ok) {
      setError(res.error || 'Адрес не сохранился')
      return
    }
    haptic('success')
    showToast(addr ? 'Адрес сохранён' : 'Адрес очищен')
    onAddressChange?.(addr)
    onBusinessMediaChange?.()
  }

  async function onSaveBizSettings(patch) {
    if (!businessId) return
    setBusy('settings')
    const res = await updateBusinessSettings(businessId, patch)
    setBusy('')
    if (!res.ok) {
      setError(res.error || 'Не сохранилось')
      return
    }
    setBizSettings(res.settings)
    haptic('success')
    showToast('Настройки сохранены')
  }

  async function onSaveSchedule() {
    if (!masterId) return
    setBusy('schedule')
    setError('')
    const res = await updateMemberSchedule(masterId, schedule)
    setBusy('')
    if (!res.ok) {
      setError(res.error || 'Расписание не сохранилось')
      return
    }
    haptic('success')
    showToast('Расписание сохранено')
  }

  async function onPickType(id) {
    if (!businessId || id === typeLocal) return
    setBusy('type')
    setError('')
    const res = await updateBusinessType(businessId, id)
    setBusy('')
    if (!res.ok) {
      setError(res.error || 'Тип не сохранился')
      return
    }
    setTypeLocal(id)
    haptic('success')
    showToast('Тип обновлён')
    onTypeChange?.(id)
    onBusinessMediaChange?.()
  }

  async function onAddPreset(p) {
    if (!masterId || existingTitles.has(p.title.toLowerCase())) return
    setBusy(`add-${p.title}`)
    setError('')
    const res = await createService({
      businessId,
      masterId,
      title: p.title,
      durationMin: p.duration_min,
      priceCents: Math.round((p.price_rub || 0) * 100),
    })
    setBusy('')
    if (!res.ok) {
      setError(res.error || 'Не добавилось')
      return
    }
    haptic('success')
    showToast('Услуга добавлена')
    onServicesChange?.()
  }

  async function onAddCustom() {
    const title = customTitle.trim()
    if (!title) return
    setBusy('custom')
    setError('')
    const res = await createService({
      businessId,
      masterId,
      title,
      durationMin: 30,
      priceCents: 0,
    })
    setBusy('')
    if (!res.ok) {
      setError(res.error || 'Не добавилось')
      return
    }
    setCustomTitle('')
    haptic('success')
    showToast('Услуга добавлена')
    onServicesChange?.()
  }

  return (
    <div className="fade-up space-y-4">
      <Toast message={toastMsg} kind={toastKind} />

      {section === 'hub' ? (
        <SettingsHub
          isPro={isProPlan(bizSettings)}
          masterId={masterId}
          businessId={businessId}
          onOpen={(id) => setSection(id)}
        />
      ) : (
        <>
          <div className="settings-subnav">
            <button
              type="button"
              className="pressable settings-subnav-back"
              onClick={() => setSection('hub')}
            >
              ← К меню
            </button>
            <h2 className="settings-subnav-title">
              {SECTION_TITLE[section] || 'Настройки'}
            </h2>
          </div>

      {error ? <p className="text-sm text-warning">{error}</p> : null}

      {section === 'profile' || section === 'media' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="pressable booking-secondary-btn cursor-pointer text-center">
              {busy === 'avatar' ? 'Загружаю…' : 'Сменить аву'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  onPickFile('avatar', f)
                }}
              />
            </label>
            <label className="pressable booking-secondary-btn cursor-pointer text-center">
              {busy === 'cover' ? 'Загружаю…' : 'Сменить шапку'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  onPickFile('cover', f)
                }}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => openCrop('avatar')}
            >
              Кадр авы
            </button>
            {canUseBrand(bizSettings) ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => openCrop('cover')}
              >
                Кадр шапки
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  onOpenPro?.()
                  setSection('pro')
                }}
              >
                Кадр шапки · Pro · {getProPriceLabel()}
              </button>
            )}
          </div>

          <BrandColorCard
            businessId={businessId}
            masterId={masterId}
            theme={theme}
            settings={bizSettings}
            onThemeRefresh={onThemeRefresh}
            onOpenPro={() => {
              onOpenPro?.()
              setSection('pro')
            }}
          />

          <div className="space-y-2">
            <TextField
              label="Изменить название"
              value={nameDraft}
              onChange={setNameDraft}
              onBlur={() => {
                if (
                  nameDraft.trim() &&
                  nameDraft.trim() !== String(businessName || '').trim()
                ) {
                  onSaveName()
                }
              }}
              placeholder="Название заведения"
              maxLength={80}
              endAdornment={
                <button
                  type="button"
                  className="pressable price-field-save"
                  disabled={busy === 'name'}
                  onClick={onSaveName}
                >
                  Сохранить
                </button>
              }
            />
          </div>

          <CityPicker
            label="Город"
            value={cityLocal}
            onChange={onSaveCity}
            placeholder="Москва, Казань…"
          />
          {busy === 'city' ? (
            <p className="text-xs text-[var(--brand-muted)]">Сохраняю город…</p>
          ) : null}

          <TextField
            label="Адрес"
            value={addressLocal}
            onChange={setAddressLocal}
            onBlur={() => {
              if (addressLocal !== (businessAddress || '')) onSaveAddress(addressLocal)
            }}
            placeholder="Улица, дом, офис"
            maxLength={200}
            endAdornment={
              <button
                type="button"
                className="pressable price-field-save"
                disabled={busy === 'address'}
                onClick={() => onSaveAddress(addressLocal)}
              >
                Сохранить
              </button>
            }
          />
          <p className="text-xs text-[var(--brand-muted)] -mt-1">
            Клиенты увидят при записи. Необязательно.
          </p>
          {busy === 'address' ? (
            <p className="text-xs text-[var(--brand-muted)]">Сохраняю адрес…</p>
          ) : null}

          <CategoryPicker
            value={typeLocal}
            disabled={busy === 'type'}
            onChange={(id) => onPickType(id)}
          />

          <SearchTagsEditor
            value={tagsLocal}
            busy={busy === 'tags'}
            onSave={onSaveSearchTags}
          />

          <div>
            <span className="meta-label">Портфолио на записи</span>
            <div className="mt-2 space-y-2">
              {canAddPortfolioItem(bizSettings, portfolio.length) ? (
                <label className="pressable booking-secondary-btn block cursor-pointer text-center">
                  {portfolioBusy ? 'Загружаю…' : 'Добавить фото'}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={portfolioBusy}
                    onChange={(e) => {
                      // Копируем File[] ДО сброса input — иначе FileList обнуляется
                      // и multi-upload молча ничего не добавляет (Telegram/WebKit).
                      const files = Array.from(e.target.files || [])
                      e.target.value = ''
                      if (!files.length) {
                        setError('Фото не выбралось. Попробуйте ещё раз.')
                        return
                      }
                      onAddPortfolio(files)
                    }}
                  />
                </label>
              ) : (
                <button
                  type="button"
                  className="pressable booking-secondary-btn w-full text-center"
                  onClick={() => {
                    onOpenPro?.()
                    setSection('pro')
                  }}
                >
                  Ещё фото · Pro · {getProPriceLabel()} ({portfolio.length}/{portfolioMax(bizSettings)})
                </button>
              )}
              {portfolio.length ? (
                <ul className="grid grid-cols-3 gap-2">
                  {portfolio.map((p, idx) => (
                    <li key={p.id} className="relative overflow-hidden rounded-xl">
                      <button
                        type="button"
                        className="block w-full p-0 border-0 bg-transparent"
                        onClick={() => {
                          haptic('light')
                          setLightboxIndex(idx)
                        }}
                      >
                        <img
                          src={assetUrl(p.image_url)}
                          alt=""
                          className="aspect-square w-full object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white"
                        disabled={portfolioBusy}
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemovePortfolio(p.id)
                        }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--brand-muted)]">
                  До {portfolioMax(bizSettings)} фото на free. Клиент увидит их при записи.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {section === 'services' ? (
        <div className="space-y-4">
          <div>
            <p className="meta-label mb-2">Добавить из типичных</p>
            <ul className="flex flex-wrap gap-2">
              {presets.map((p) => {
                const added = existingTitles.has(p.title.toLowerCase())
                return (
                  <li key={p.title}>
                    <button
                      type="button"
                      className={`pressable preset-chip ${added ? 'is-added' : ''}`}
                      disabled={added || busy === `add-${p.title}`}
                      onClick={() => onAddPreset(p)}
                    >
                      {added ? '✓ ' : '+ '}
                      {p.title}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <TextField
            label="Своя услуга"
            value={customTitle}
            onChange={setCustomTitle}
            placeholder="Например: Укладка"
            maxLength={60}
            endAdornment={
              <button
                type="button"
                className="pressable booking-secondary-btn px-4"
                disabled={busy === 'custom'}
                onClick={onAddCustom}
              >
                +
              </button>
            }
          />

          <ServiceSortableList
            services={services}
            masterId={masterId}
            businessId={businessId}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            showToast={showToast}
            onServicesChange={onServicesChange}
          />
        </div>
      ) : null}

      {section === 'schedule' ? (
        <ScheduleSection
          schedule={schedule}
          setSchedule={setSchedule}
          bizSettings={bizSettings}
          setBizSettings={setBizSettings}
          busy={busy}
          onSaveSchedule={onSaveSchedule}
          onSaveBizSettings={onSaveBizSettings}
        />
      ) : null}

      {section === 'pro' ? (
        <ProPanel
          businessId={businessId}
          masterId={masterId}
          businessName={businessName}
          businessSlug={masterSlug}
          services={services}
          businessCreatedAt={businessCreatedAt}
          onOpenProfile={() => setSection('profile')}
          onSettingsChange={(settings) => {
            setBizSettings(settings)
            onPlanChange?.(settings)
          }}
        />
      ) : null}
        </>
      )}

      <MediaCropSheet
        open={!!crop}
        kind={crop?.kind || 'avatar'}
        imageUrl={crop?.url || ''}
        previewCoverUrl={assetUrl(theme.cover_url || 'cover-demo.svg')}
        previewAvatarUrl={assetUrl(theme.logo_url || 'avatar-demo.svg')}
        businessName={nameDraft || businessName || 'Заведение'}
        initialLayer={
          crop?.kind === 'cover' ? mediaFrame.cover : mediaFrame.avatar
        }
        onClose={() => setCrop(null)}
        onSave={async (layer) => {
          const kind = crop?.kind || 'avatar'
          setCrop(null)
          await onMediaFramePatch(kind, layer)
        }}
      />

      {lightboxIndex != null ? (
        <PortfolioLightbox
          images={portfolio}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  )
}
