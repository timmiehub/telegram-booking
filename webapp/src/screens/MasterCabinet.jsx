import { useEffect, useMemo, useState } from 'react'
import AppShell from '../components/AppShell'
import { useTelegramChrome, haptic } from '../hooks/useTelegramChrome'
import { fetchDayBookings } from '../lib/bookings'
import { fetchBusinessSettings, mediaFrameStyle, updateBusinessSettings } from '../lib/settings'
import { isProPlan } from '../lib/pro'
import { fetchCompletedVisitsCount } from '../lib/growthMetrics'
import { profileCompletion } from '../lib/profileProgress'
import TodayAgenda from './TodayAgenda'
import HotSlots from './HotSlots'
import MasterProfile from './MasterProfile'
import MasterScheduleTab from './MasterScheduleTab'
import { assetUrl } from '../lib/assets'
import ProGrowthNudgeSheet, {
  shouldShowProGrowthNudge,
  markProGrowthNudgeSeen,
} from '../components/ProGrowthNudgeSheet'
import ProBadge from '../components/ProBadge'
import { FEEDBACK_TG, FEEDBACK_TG_URL } from '../lib/lifetimePro'
import { categoryLabel } from '../lib/searchExpand'
import Icon from '../components/Icon'
import { WebApp } from '../lib/telegram'

const TAB_ICONS = {
  today: 'icon-calendar',
  schedule: 'icon-clock',
  link: 'icon-pin',
  more: 'icon-settings',
}

const TABS = [
  { id: 'today', label: 'Сегодня', shortLabel: 'День' },
  { id: 'schedule', label: 'Расписание', shortLabel: 'График' },
  { id: 'link', label: 'Ссылка', shortLabel: 'Ссылка' },
  { id: 'more', label: 'Ещё', shortLabel: 'Ещё' },
]

export default function MasterCabinet({
  theme,
  masterId,
  masterSlug,
  businessId = null,
  businessCreatedAt = null,
  businessType = 'other',
  businessName,
  businessCity = '',
  businessAddress = '',
  businessSearchTags = [],
  services,
  memberships = [],
  members = [],
  analytics,
  analyticsLoaded,
  onBack,
  onRefresh,
  onNeedAnalytics,
  onServicesChange,
  onBusinessMediaChange,
  onSwitchBusiness,
  onTypeChange,
  onCityChange,
  onAddressChange,
  onSearchTagsChange,
  profileInitialSection = 'hub',
  initialTab = 'today',
}) {
  const mapTab = (t) => {
    if (t === 'schedule') return 'schedule'
    if (t === 'windows' || t === 'link') return 'link'
    if (t === 'profile' || t === 'more' || t === 'analytics' || t === 'clients') return 'more'
    return 'today'
  }

  const [tab, setTab] = useState(mapTab(initialTab))
  const [profileSection, setProfileSection] = useState(
    profileInitialSection === 'media' ? 'profile' : profileInitialSection || 'hub',
  )
  /** Сброс экрана «Ещё» на корневое меню при каждом нажатии вкладки. */
  const [moreEpoch, setMoreEpoch] = useState(0)
  const [visitCount, setVisitCount] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [isPro, setIsPro] = useState(false)
  const [mediaFrame, setMediaFrame] = useState(null)
  const [bizSettings, setBizSettings] = useState(null)
  const [nudgeVisits, setNudgeVisits] = useState(0)
  const [nudgeOpen, setNudgeOpen] = useState(false)
  const [nudgeBusy, setNudgeBusy] = useState(false)

  const openMore = (section = 'hub') => {
    setProfileSection(section === 'media' ? 'profile' : section || 'hub')
    setMoreEpoch((n) => n + 1)
    setTab('more')
  }

  const openSupportChat = () => {
    haptic('light')
    try {
      if (typeof WebApp.openTelegramLink === 'function') {
        WebApp.openTelegramLink(FEEDBACK_TG_URL)
        return
      }
    } catch {
      /* fall through */
    }
    window.open(FEEDBACK_TG_URL, '_blank', 'noopener,noreferrer')
  }

  const orgs = useMemo(
    () =>
      (memberships || [])
        .map((m) => m.businesses)
        .filter((b) => b?.slug),
    [memberships],
  )

  useEffect(() => {
    setTab(mapTab(initialTab))
  }, [initialTab])

  useEffect(() => {
    const next =
      profileInitialSection === 'media' ? 'profile' : profileInitialSection
    setProfileSection(next)
  }, [profileInitialSection])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!masterId) return
      const rows = await fetchDayBookings(masterId)
      if (!cancelled) setVisitCount(rows.length)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [masterId, analytics])

  useEffect(() => {
    let cancelled = false
    async function loadPlan() {
      if (!businessId) {
        setIsPro(false)
        setMediaFrame(null)
        setBizSettings(null)
        setNudgeOpen(false)
        return
      }
      const [{ settings }, visits30d] = await Promise.all([
        fetchBusinessSettings(businessId),
        fetchCompletedVisitsCount({ masterId, businessId, days: 30 }),
      ])
      if (cancelled) return
      const pro = isProPlan(settings)
      setIsPro(pro)
      setMediaFrame(settings.media_frame)
      setBizSettings(settings)
      setNudgeVisits(visits30d)
      setNudgeOpen(
        shouldShowProGrowthNudge({
          isPro: pro,
          visits30d,
          settings,
          businessId,
        }),
      )
    }
    loadPlan()
    return () => {
      cancelled = true
    }
  }, [businessId, masterId, profileSection, tab])

  async function dismissProNudge({ openPro = false } = {}) {
    setNudgeBusy(true)
    markProGrowthNudgeSeen(businessId)
    const at = new Date().toISOString()
    if (businessId) {
      await updateBusinessSettings(businessId, { pro_nudge_at: at })
      setBizSettings((s) => (s ? { ...s, pro_nudge_at: at } : s))
    }
    setNudgeOpen(false)
    setNudgeBusy(false)
    if (openPro) openMore('pro')
  }

  useTelegramChrome({
    mainVisible: false,
    backVisible: true,
    onBack,
  })

  const cover = assetUrl(theme.cover_url || 'cover-demo.svg')
  const logo = assetUrl(theme.logo_url || 'avatar-demo.svg')
  const frameStyle = mediaFrameStyle(mediaFrame)
  const moreProgress = useMemo(
    () =>
      profileCompletion({
        theme,
        businessCity,
        businessAddress,
        services,
      }),
    [theme, businessCity, businessAddress, services],
  )

  return (
    <AppShell>
      <header className="profile-header-card profile-header-card--centered fade-up" style={frameStyle}>
        <div className="profile-header-cover-wrap">
          <div
            className="profile-header-cover"
            style={{ backgroundImage: `url(${cover})` }}
          />
        </div>
        <div className="profile-header-body">
          <span className="profile-header-avatar-wrap">
            <img
              src={logo}
              alt=""
              className="profile-header-avatar"
              width={76}
              height={76}
              decoding="async"
            />
          </span>
          <div className="profile-header-text">
            <div className="profile-header-title-row">
              <h1 className="display truncate text-[22px] font-bold leading-tight">
                {businessName || theme.business_name || 'Заведение'}
              </h1>
              {isPro ? <ProBadge compact /> : null}
            </div>
            <p className="mt-1 text-sm text-[var(--brand-muted)]">
              {tab === 'today'
                ? visitCount
                  ? `${visitCount} сегодня`
                  : 'Нет визитов сегодня'
                : tab === 'schedule'
                  ? 'Рабочие дни и часы'
                  : tab === 'more'
                    ? moreProgress.label
                    : categoryLabel(businessType)}
            </p>
          </div>
        </div>
      </header>

      <nav className="tab-bar tab-bar--four mb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'active' : ''}
            onClick={() => {
              haptic('light')
              if (t.id === 'more') {
                openMore('hub')
                return
              }
              setTab(t.id)
            }}
          >
            <Icon name={TAB_ICONS[t.id]} size={20} />
            <span className="tab-label-full">{t.label}</span>
            <span className="tab-label-short">{t.shortLabel}</span>
          </button>
        ))}
      </nav>

      <div key={tab} className="view-enter">
        {tab === 'today' ? (
          <TodayAgenda
            masterId={masterId}
            businessId={businessId}
            isPro={isPro}
            onOpenPro={() => openMore('pro')}
            onOpenHotSlots={() => setTab('link')}
            onRefreshStats={() => {
              onRefresh?.()
              fetchDayBookings(masterId).then((rows) => setVisitCount(rows.length))
            }}
          />
        ) : null}

        {tab === 'schedule' ? (
          <MasterScheduleTab masterId={masterId} businessId={businessId} />
        ) : null}

        {tab === 'link' ? (
          <HotSlots
            masterId={masterId}
            services={(services || []).filter((s) => s.is_active !== false)}
            masterSlug={masterSlug}
            businessName={businessName || theme.business_name}
            businessId={businessId}
            isPro={isPro}
            onOpenSchedule={() => setTab('schedule')}
            onOpenPro={() => openMore('pro')}
          />
        ) : null}

        {tab === 'more' ? (
          <div className="space-y-4">
            {orgs.length > 1 ? (
              <div className="card px-4 py-3 space-y-2">
                <button
                  type="button"
                  className="btn btn-secondary w-full"
                  onClick={() => {
                    haptic('light')
                    setPickerOpen((v) => !v)
                  }}
                >
                  Сменить кабинет
                </button>
                {pickerOpen ? (
                  <ul className="tg-list">
                    {orgs.map((b) => {
                      const active = b.slug === masterSlug
                      return (
                        <li key={b.id || b.slug}>
                          <button
                            type="button"
                            className={`pressable tg-row ${active ? 'service-row is-selected' : ''}`}
                            onClick={() => {
                              setPickerOpen(false)
                              if (!active) onSwitchBusiness?.(b.slug)
                            }}
                          >
                            <span className="min-w-0 flex-1 text-left font-semibold">
                              {b.name}
                            </span>
                            {active ? <span className="service-check">✓</span> : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <MasterProfile
              key={`more-${moreEpoch}`}
              businessId={businessId}
              masterId={masterId}
              masterSlug={masterSlug}
              businessType={businessType}
              businessName={businessName || theme.business_name}
              businessCity={businessCity}
              businessAddress={businessAddress}
              businessSearchTags={businessSearchTags}
              businessCreatedAt={businessCreatedAt}
              members={members}
              theme={theme}
              services={services}
              initialSection={profileSection}
              onServicesChange={onServicesChange}
              onBusinessMediaChange={() => {
                onBusinessMediaChange?.()
                if (businessId) {
                  fetchBusinessSettings(businessId).then(({ settings }) => {
                    setMediaFrame(settings.media_frame)
                    setIsPro(isProPlan(settings))
                  })
                }
              }}
              onTypeChange={onTypeChange}
              onCityChange={onCityChange}
              onAddressChange={onAddressChange}
              onSearchTagsChange={onSearchTagsChange}
              onThemeRefresh={() => onBusinessMediaChange?.()}
              onOpenPro={() => openMore('pro')}
              onPlanChange={(settings) => setIsPro(isProPlan(settings))}
              onMediaFrameChange={(frame) => setMediaFrame(frame)}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          className="w-full text-center text-sm text-[var(--brand-muted)]"
          onClick={onBack}
        >
          Сменить роль
        </button>
        <button
          type="button"
          className="pressable support-tg-btn"
          onClick={openSupportChat}
        >
          <span className="support-tg-btn-icon" aria-hidden>
            <Icon name="icon-chat" size={20} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-semibold">Написать в поддержку</span>
            <span className="mt-0.5 block text-xs text-[var(--brand-muted)]">
              Баги и вопросы — @{FEEDBACK_TG}
            </span>
          </span>
          <Icon name="icon-chevron-right" size={18} className="shrink-0 opacity-50" />
        </button>
      </div>

      <ProGrowthNudgeSheet
        open={nudgeOpen}
        visits={nudgeVisits}
        busy={nudgeBusy}
        onLater={() => dismissProNudge({ openPro: false })}
        onOpenPro={() => dismissProNudge({ openPro: true })}
      />
    </AppShell>
  )
}
