import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import logger from './lib/logger'
import { applyThemeToDocument, buttonClassName, DEFAULT_THEME } from './lib/theme'
import { fetchBusinessBundle, resolveBusinessSlug, resolveTeamInviteCode } from './lib/business'
import { resolveInviteFromContext } from './lib/inviteLinks'
import { captureGrowthAttributionFromContext, parseGrowthStartParam } from './lib/growthAttribution'
import { ensureProfile, fetchMemberships } from './lib/profile'
import { fetchBusinessServices } from './lib/services'
import { fetchMasterAnalytics } from './lib/analytics'
import { getSavedRole, setSavedRole } from './lib/role'
import { WebApp, isTelegramEnvironment } from './lib/telegram'
import { isVkEnvironment, getVkUserInfo } from './lib/vk'
import { resolveCurrentProfile, getTelegramIdentity, getVkIdentity } from './lib/identity'
import { hideBootSplash } from './lib/bootSplash'
import AppShell, { SkeletonBlock } from './components/AppShell'
import RoleGate from './screens/RoleGate'
import ProGiftModal from './components/ProGiftModal'
import { hasSeenProGift, markProGiftSeen } from './lib/lifetimePro'
import { ensureLaunchProForBusiness } from './lib/lifetimeProGrant'

const MasterCabinet = lazy(() => import('./screens/MasterCabinet'))
const ClientHome = lazy(() => import('./screens/ClientHome'))
const BookingFlow = lazy(() => import('./screens/BookingFlow'))
const OnboardBusiness = lazy(() => import('./screens/OnboardBusiness'))
const ShareReady = lazy(() => import('./screens/ShareReady'))
const VkLink = lazy(() => import('./screens/VkLink'))

function initTelegramSdkSafely() {
  try {
    WebApp.ready()
    WebApp.expand()
    const tp = WebApp.themeParams || {}
    // TG-native фон/текст; accent остаётся из темы бизнеса (applyThemeToDocument)
    if (tp.bg_color) {
      document.documentElement.style.setProperty('--tg-bg', tp.bg_color)
      document.documentElement.style.setProperty('--brand-bg', tp.bg_color)
    }
    if (tp.secondary_bg_color) {
      document.documentElement.style.setProperty(
        '--brand-surface',
        tp.secondary_bg_color,
      )
    }
    if (tp.text_color) {
      document.documentElement.style.setProperty('--tg-text', tp.text_color)
      document.documentElement.style.setProperty('--brand-text', tp.text_color)
    }
    if (tp.hint_color) {
      document.documentElement.style.setProperty('--brand-muted', tp.hint_color)
    }
    if (tp.button_color) {
      document.documentElement.style.setProperty('--tg-button', tp.button_color)
    }
    if (tp.button_text_color) {
      document.documentElement.style.setProperty(
        '--brand-btn-text',
        tp.button_text_color,
      )
    }
    if (tp.section_bg_color) {
      document.documentElement.style.setProperty(
        '--brand-surface-2',
        tp.section_bg_color,
      )
    }
  } catch (err) {
    logger.warn('Telegram SDK недоступен (это нормально в браузере):', err)
  }
}

function resolveInitialBookingStep(members) {
  const active = (members || []).filter((m) => m.is_active !== false)
  if (active.length > 1) return 'staff'
  return 'book'
}

/** Явные view из бота; deeplink → сразу запись */
function resolveBootRoute({ canOpenCabinet, savedRole, hasDeeplink, inviteCode }) {
  const view = new URLSearchParams(window.location.search).get('view')
  if (view === 'join' || inviteCode) {
    return {
      mode: 'join',
      tab: 'today',
      bookingStep: 'book',
      inviteCode: inviteCode || new URLSearchParams(window.location.search).get('invite') || '',
    }
  }
  if (view === 'book') {
    return {
      mode: 'booking',
      tab: 'today',
      bookingStep: 'book',
      autoClient: true,
    }
  }
  if (view === 'onboard') {
    return { mode: canOpenCabinet ? 'cabinet' : 'onboard', tab: 'today', bookingStep: 'book' }
  }
  if (view === 'mine') {
    return {
      mode: 'booking',
      tab: 'today',
      bookingStep: 'mine',
      autoClient: true,
    }
  }
  if (view === 'home' || view === 'app' || view === 'gate') {
    return { mode: 'gate', tab: 'today', bookingStep: 'book' }
  }
  if (
    canOpenCabinet &&
    (view === 'dashboard' ||
      view === 'today' ||
      view === 'schedule' ||
      view === 'windows' ||
      view === 'link' ||
      view === 'clients' ||
      view === 'analytics' ||
      view === 'profile' ||
      view === 'more')
  ) {
    return {
      mode: 'cabinet',
      tab:
        view === 'dashboard' || view === 'today'
          ? 'today'
          : view === 'schedule'
            ? 'schedule'
            : view === 'windows' || view === 'link'
              ? 'link'
              : 'more',
      bookingStep: 'book',
    }
  }

  if (hasDeeplink) {
    // Гостевая ссылка / startapp — всегда сразу запись, без «Кто вы?»
    return {
      mode: 'booking',
      tab: 'today',
      bookingStep: 'book',
      autoClient: true,
    }
  }

  if (savedRole === 'master') {
    return {
      mode: canOpenCabinet ? 'cabinet' : 'onboard',
      tab: 'today',
      bookingStep: 'book',
    }
  }
  if (savedRole === 'client') {
    return {
      mode: 'client',
      tab: 'today',
      bookingStep: 'book',
    }
  }
  return { mode: 'gate', tab: 'today', bookingStep: 'book' }
}

function darkThemePatch(theme) {
  return {
    ...theme,
    background_color:
      theme.background_color === '#ffffff' ? '#0c1016' : theme.background_color,
    surface_color:
      theme.surface_color === '#f8fafc' ? '#151b24' : theme.surface_color,
    text_color:
      theme.text_color === '#0f172a' || theme.text_color === '#14532d'
        ? '#f4f6f8'
        : theme.text_color,
    cover_url: theme.cover_url || 'cover-demo.svg',
    logo_url: theme.logo_url || 'avatar-demo.svg',
  }
}

function CabinetFallback() {
  return (
    <AppShell>
      <SkeletonBlock className="mb-4 h-28 w-full" />
      <SkeletonBlock className="mb-3 h-12 w-full" />
      <SkeletonBlock className="mb-2 h-16 w-full" />
      <SkeletonBlock className="h-16 w-full" />
    </AppShell>
  )
}

function App() {
  const [userName, setUserName] = useState('')
  const [isReady, setIsReady] = useState(false)
  const [outsideTelegram, setOutsideTelegram] = useState(false)
  const [theme, setTheme] = useState(DEFAULT_THEME)
  const [businessSlug, setBusinessSlug] = useState(null)
  const [entrySlug, setEntrySlug] = useState(null)
  const [business, setBusiness] = useState(null)
  const [members, setMembers] = useState([])
  const [selectedMasterId, setSelectedMasterId] = useState(null)
  const [services, setServices] = useState([])
  const [selectedServiceId, setSelectedServiceId] = useState(null)
  const [mode, setMode] = useState('gate')
  const [cabinetTab, setCabinetTab] = useState('today')
  const [profileInitialSection, setProfileInitialSection] = useState('profile')
  const [bookingStep, setBookingStep] = useState('service')
  const [profile, setProfile] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [analytics, setAnalytics] = useState({
    revenueMonthly: [],
    densityDaily: [],
    bookings: [],
  })
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [proGift, setProGift] = useState(null)

  const canOpenCabinet = memberships.length > 0
  const myBusiness = memberships[0]?.businesses || null

  function tgUser() {
    return WebApp.initDataUnsafe?.user || null
  }

  function maybeOfferProGift(grant) {
    const user = tgUser()
    const tid = user?.id
    if (!grant || !tid || hasSeenProGift(tid)) return
    setProGift(grant)
  }

  async function applyLaunchProIfEligible(businessId) {
    const res = await ensureLaunchProForBusiness(businessId)
    if (res.applied && res.grant) maybeOfferProGift(res.grant)
    return res
  }

  const btnClass = useMemo(
    () => buttonClassName(theme.button_style),
    [theme.button_style],
  )

  const [prefillServiceId, setPrefillServiceId] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('service') || null
  })
  const [prefillSlotIso, setPrefillSlotIso] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('slot') || null
  })

  const deeplinkBusiness = useMemo(() => {
    if (!entrySlug || !business || business.slug !== entrySlug) {
      if (entrySlug && business?.slug) {
        return {
          slug: business.slug,
          name: business.name,
          avatar_url: business.avatar_url,
        }
      }
      if (entrySlug) {
        return { slug: entrySlug, name: theme.business_name, avatar_url: null }
      }
      return null
    }
    return {
      slug: business.slug,
      name: business.name,
      avatar_url: business.avatar_url,
    }
  }, [entrySlug, business, theme.business_name])

  async function loadBusiness(slug) {
    const result = await fetchBusinessBundle(slug || 'demo')
    const applied = applyThemeToDocument(darkThemePatch(result.theme))
    setTheme(applied)
    setBusiness(result.business)
    setMembers(result.members || [])
    setBusinessSlug(result.business?.slug || slug || 'demo')

    const activeMembers = (result.members || []).filter((m) => m.is_active !== false)
    const defaultMaster =
      activeMembers.length === 1
        ? activeMembers[0].profile_id
        : result.business?.owner_profile_id ||
          result.business?.legacy_master_id ||
          activeMembers[0]?.profile_id ||
          null
    setSelectedMasterId(defaultMaster)

    const list = await fetchBusinessServices({
      businessId: result.business?.id || null,
      masterId: defaultMaster || result.business?.legacy_master_id,
      includeInactive: true,
    })
    setServices(list)
    const active = list.filter((s) => s.is_active !== false)
    setSelectedServiceId(active[0]?.id || null)
    return { result, defaultMaster, list }
  }

  async function refreshAnalytics(id = selectedMasterId) {
    if (!id) return
    const stats = await fetchMasterAnalytics(id)
    setAnalytics(stats)
    setAnalyticsLoaded(true)
  }

  useEffect(() => {
    let cancelled = false
    const BOOT_MS = 8000

    async function boot() {
      const allowDevPreview = import.meta.env.DEV === true
      const withTimeout = (promise, ms) =>
        Promise.race([
          promise,
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('timeout')), ms)
          }),
        ])

      const finishReady = (opts = {}) => {
        if (cancelled) return
        if (opts.outside != null) setOutsideTelegram(Boolean(opts.outside))
        setIsReady(true)
        hideBootSplash()
      }

      try {
        initTelegramSdkSafely()
        const inTelegram = isTelegramEnvironment()
        captureGrowthAttributionFromContext()
        const invite = resolveInviteFromContext()
        const slug = invite.slug || resolveBusinessSlug()
        const teamInvite = resolveTeamInviteCode()
        const view = new URLSearchParams(window.location.search).get('view')
        let startParam = ''
        try {
          startParam = String(WebApp.initDataUnsafe?.start_param || '').trim()
        } catch {
          // ignore
        }
        const growth = parseGrowthStartParam(startParam || invite.raw)
        if (!cancelled) {
          setEntrySlug(slug)
          if (teamInvite) setInviteCode(teamInvite)
          if (invite.serviceIdPrefix) setPrefillServiceId(invite.serviceIdPrefix)
          if (invite.slotAt && !Number.isNaN(invite.slotAt.getTime())) {
            setPrefillSlotIso(invite.slotAt.toISOString())
          }
        }

        if (!inTelegram && !isVkEnvironment() && !slug && !view && !teamInvite && !allowDevPreview) {
          finishReady({ outside: true })
          return
        }

        let nextProfile = null
        let nextMemberships = []
        let earlyLoaded = null

        if (inTelegram) {
          const user = WebApp.initDataUnsafe?.user
          const fullName = [user?.first_name, user?.last_name]
            .filter(Boolean)
            .join(' ')
          if (!cancelled) {
            setUserName(fullName || user?.username || 'Пользователь')
          }
          if (user?.id) {
            try {
              const ensured = await withTimeout(
                ensureProfile({
                  telegramId: user.id,
                  fullName: fullName || null,
                  username: user.username || null,
                }),
                BOOT_MS,
              )
              nextProfile = ensured.profile
              if (ensured.error) logger.warn('profile:', ensured.error)
            } catch (err) {
              logger.warn('profile/memberships boot:', err?.message || err)
            }
          }
        } else if (isVkEnvironment()) {
          try {
            const ensured = await withTimeout(resolveCurrentProfile(), BOOT_MS)
            if (ensured) {
              nextProfile = ensured
              if (!cancelled) {
                const vkName = await getVkUserInfo()
                const fullName = [vkName?.first_name, vkName?.last_name].filter(Boolean).join(' ').trim()
                if (fullName) {
                  nextProfile = { ...nextProfile, full_name: fullName }
                }
                setUserName(nextProfile.full_name || `VK ${nextProfile.vk_id}`)
              }
            } else {
              // Профиль не найден — покажем VkLink для выбора
              if (!cancelled) {
                setMode('vk-link')
                finishReady({ outside: false })
                return
              }
            }
          } catch (err) {
            logger.warn('vk profile/memberships boot:', err?.message || err)
            if (!cancelled) {
              setMode('vk-link')
              finishReady({ outside: false })
              return
            }
          }
        } else if (!cancelled) {
          setUserName(allowDevPreview ? 'Гость (dev)' : 'Гость')
        }

        if (nextProfile && !cancelled) {
          const knownSlug = slug || null
          if (knownSlug) {
            const [mems, bizLoaded] = await Promise.all([
              withTimeout(fetchMemberships(nextProfile.id), BOOT_MS),
              withTimeout(loadBusiness(knownSlug), BOOT_MS).catch((err) => {
                logger.warn('loadBusiness boot parallel:', err?.message || err)
                return null
              }),
            ])
            nextMemberships = mems
            if (bizLoaded) earlyLoaded = bizLoaded
          } else {
            nextMemberships = await withTimeout(
              fetchMemberships(nextProfile.id),
              BOOT_MS,
            )
          }
        }

        if (cancelled) return
        setProfile(nextProfile)
        setMemberships(nextMemberships)

        const canCabinet = nextMemberships.length > 0
        const loadSlug =
          slug ||
          nextMemberships[0]?.businesses?.slug ||
          'demo'
        let loaded = {
          result: { members: [], business: null },
          defaultMaster: null,
        }
        try {
          if (earlyLoaded && slug && loadSlug === slug) {
            loaded = earlyLoaded
          } else {
            loaded = await withTimeout(loadBusiness(loadSlug), BOOT_MS)
          }
        } catch (err) {
          logger.warn('loadBusiness boot:', err?.message || err)
          applyThemeToDocument(DEFAULT_THEME)
          setTheme(DEFAULT_THEME)
        }
        if (cancelled) return

        const servicePrefix = invite.serviceIdPrefix
        if (servicePrefix && loaded.list?.length) {
          const active = loaded.list.filter((s) => s.is_active !== false)
          const match = active.find(
            (s) =>
              String(s.id) === servicePrefix ||
              String(s.id).startsWith(String(servicePrefix)),
          )
          if (match) setSelectedServiceId(match.id)
        }

        const initial = resolveBootRoute({
          canOpenCabinet: canCabinet,
          savedRole: getSavedRole(),
          hasDeeplink: Boolean(slug),
          inviteCode: teamInvite,
        })
        if (initial.mode === 'cabinet' && !canCabinet) {
          initial.mode = 'onboard'
        }
        if (
          !canCabinet &&
          (growth.kind === 'channel' || growth.kind === 'referral') &&
          initial.mode !== 'join'
        ) {
          initial.mode = 'onboard'
          setSavedRole('master')
        }
        if (initial.autoClient && getSavedRole() !== 'master') {
          setSavedRole('client')
        }
        if (initial.inviteCode) setInviteCode(initial.inviteCode)

        setMode(initial.mode)
        setCabinetTab(initial.tab)
        setBookingStep(
          resolveInitialBookingStep(loaded.result.members || []) === 'staff'
            ? 'staff'
            : initial.bookingStep || 'book',
        )
        finishReady({ outside: false })

        if (initial.mode === 'cabinet' && loaded.defaultMaster) {
          refreshAnalytics(loaded.defaultMaster)
        }
      } catch (err) {
        logger.error('Ошибка инициализации Mini App:', err)
        if (cancelled) return
        applyThemeToDocument(DEFAULT_THEME)
        setTheme(DEFAULT_THEME)
        setUserName('Гость')
        setMode('gate')
        finishReady({
          outside: allowDevPreview ? false : !isTelegramEnvironment(),
        })
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [])

  function pickClient() {
    setSavedRole('client')
    if (entrySlug) {
      setBookingStep('book')
      setMode('booking')
      return
    }
    setMode('client')
  }

  async function pickMaster() {
    setSavedRole('master')
    if (canOpenCabinet) {
      const slug = myBusiness?.slug
      if (slug && slug !== businessSlug) {
        const loaded = await loadBusiness(slug)
        setAnalyticsLoaded(false)
        if (loaded.defaultMaster) refreshAnalytics(loaded.defaultMaster)
      } else if (!analyticsLoaded && selectedMasterId) {
        refreshAnalytics(selectedMasterId)
      }
      setCabinetTab('today')
      setMode('cabinet')
      return
    }
    await openOnboard()
  }

  async function openOnboard() {
    let p = profile
    let err = null
    if (!p?.id) {
      const user = WebApp.initDataUnsafe?.user
      if (user?.id) {
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')
        const ensured = await ensureProfile({
          telegramId: user.id,
          fullName: fullName || null,
          username: user.username || null,
        })
        p = ensured.profile
        err = ensured.error
        if (p) setProfile(p)
      } else {
        err = 'Нет данных Telegram. Откройте Mini App из бота.'
      }
    }
    if (!p?.id) {
      try {
        WebApp.showAlert?.(
          err ||
            'Не удалось создать профиль. В боте нажмите /start. Если снова ошибка — migration_profiles_rls.sql в Supabase.',
        )
      } catch {
        // ignore
      }
      return
    }
    setMode('onboard')
  }

  async function afterOnboard(created) {
    const mems = profile ? await fetchMemberships(profile.id) : []
    setMemberships(mems)
    await loadBusiness(created.slug)
    if (created?.id) await applyLaunchProIfEligible(created.id)
    setSavedRole('master')
    setMode('shareReady')
  }

  function finishShareReady() {
    setMode('cabinet')
    setCabinetTab('today')
    setProfileInitialSection('media')
  }

  async function openBookingForSlug(slug, opts = {}) {
    if (!slug) return
    const loaded = await loadBusiness(slug)
    const bizId = loaded.result?.business?.id || null

    let list = loaded.list || []
    if (opts.masterId) {
      setSelectedMasterId(opts.masterId)
      if (opts.masterId !== loaded.defaultMaster) {
        list = await fetchBusinessServices({
          businessId: bizId,
          masterId: opts.masterId,
          includeInactive: true,
        })
        setServices(list)
      }
    }

    const active = list.filter((s) => s.is_active !== false)
    const prefer =
      opts.serviceId &&
      active.find(
        (s) =>
          s.id === opts.serviceId ||
          String(s.id).startsWith(String(opts.serviceId)),
      )
    setSelectedServiceId(prefer?.id || active[0]?.id || null)
    setPrefillServiceId(opts.serviceId || null)
    setBookingStep('book')
    setMode('booking')
  }

  // Deep-link открывает booking, но явный переход в ClientHome («Мои записи» / Готово)
  // не должен снова форсировать booking.
  const allowClientHomeRef = useRef(false)

  useEffect(() => {
    if (!isReady || !entrySlug) return
    if (mode === 'client' && !allowClientHomeRef.current) {
      setBookingStep('book')
      setMode('booking')
    }
  }, [isReady, mode, entrySlug])

  // Launch Pro: кабинет до 01.09 без активного Pro → месяц + модалка
  useEffect(() => {
    if (!isReady || !myBusiness?.id) return
    let cancelled = false
    ;(async () => {
      const res = await applyLaunchProIfEligible(myBusiness.id)
      if (cancelled || !res?.applied || !profile?.id) return
      const mems = await fetchMemberships(profile.id)
      if (!cancelled) setMemberships(mems)
    })()
    return () => {
      cancelled = true
    }
  }, [isReady, myBusiness?.id, profile?.id])

  function switchRole() {
    setSavedRole(null)
    setMode('gate')
  }

  const giftModal = (
    <ProGiftModal
      open={Boolean(proGift)}
      title={proGift?.title}
      body={proGift?.body}
      onClose={() => {
        markProGiftSeen(tgUser()?.id)
        setProGift(null)
      }}
    />
  )

  let screen = null

  if (!isReady) {
    // Запасной экран, если HTML-splash уже снят, а boot ещё идёт
    screen = (
      <AppShell className="flex flex-col items-center justify-center text-center">
        <p className="text-base font-semibold">Загрузка…</p>
        <p className="mt-2 text-sm text-[var(--brand-muted)]">Открываем приложение</p>
      </AppShell>
    )
  } else if (outsideTelegram) {
    screen = (
      <AppShell className="flex flex-col items-center justify-center text-center">
        <h1 className="display text-2xl font-extrabold">Откройте в Telegram</h1>
        <p className="mt-2 max-w-sm text-sm text-[var(--brand-muted)]">
          Это Mini App. Запустите бота и нажмите кнопку приложения.
        </p>
      </AppShell>
    )
  } else if (mode === 'gate') {
    screen = (
      <RoleGate
        userName={userName}
        onPickClient={pickClient}
        onPickMaster={pickMaster}
      />
    )
  } else if (mode === 'join') {
    screen = (
      <AppShell>
        <h1 className="display text-xl font-extrabold">Команда недоступна</h1>
        <p className="mt-2 text-sm text-[var(--brand-muted)]">
          Кабинет рассчитан на одного мастера. Создайте свой или откройте как клиент.
        </p>
        <button
          type="button"
          className={`${btnClass} mt-4`}
          onClick={() => {
            if (canOpenCabinet) setMode('cabinet')
            else if (profile?.id) setMode('onboard')
            else switchRole()
          }}
        >
          {canOpenCabinet ? 'В кабинет' : profile?.id ? 'Создать кабинет' : 'К выбору роли'}
        </button>
      </AppShell>
    )
  } else if (mode === 'onboard') {
    if (canOpenCabinet) {
      screen = (
        <AppShell>
          <h1 className="display text-xl font-extrabold">Кабинет уже есть</h1>
          <p className="mt-2 text-sm text-[var(--brand-muted)]">
            Второй кабинет создавать не нужно — откройте текущий.
          </p>
          <button type="button" className={`${btnClass} mt-4`} onClick={() => setMode('cabinet')}>
            Открыть кабинет
          </button>
        </AppShell>
      )
    } else if (!profile?.id) {
      screen = (
        <AppShell>
          <h1 className="display text-xl font-extrabold">Стать мастером</h1>
          <p className="mt-2 text-sm text-[var(--brand-muted)]">
            Профиль не создался. В боте напишите /start и откройте приложение снова.
          </p>
          <button type="button" className={`${btnClass} mt-4`} onClick={switchRole}>
            К выбору роли
          </button>
        </AppShell>
      )
    } else {
      screen = (
        <Suspense fallback={<CabinetFallback />}>
          <OnboardBusiness
            profileId={profile.id}
            profile={profile}
            btnClass={btnClass}
            onCancel={() => switchRole()}
            onDone={afterOnboard}
          />
        </Suspense>
      )
    }
  } else if (mode === 'shareReady') {
    const avatar = theme.logo_url || ''
    const cover = theme.cover_url || ''
    const hasCustomAvatar = Boolean(
      avatar && !/avatar-demo|demo\.svg/i.test(avatar),
    )
    const hasCustomCover = Boolean(
      cover && !/cover-demo|demo\.svg/i.test(cover),
    )
    screen = (
      <Suspense fallback={<CabinetFallback />}>
        <ShareReady
          businessName={business?.name || theme.business_name}
          businessSlug={businessSlug || business?.slug}
          profile={profile}
          btnClass={btnClass}
          onContinue={finishShareReady}
          hasCustomAvatar={hasCustomAvatar}
          hasCustomCover={hasCustomCover}
        />
      </Suspense>
    )
  } else if (mode === 'cabinet') {
    if (!canOpenCabinet) {
      screen = (
        <AppShell>
          <h1 className="display text-xl font-extrabold">Кабинет ещё не создан</h1>
          <p className="mt-2 text-sm text-[var(--brand-muted)]">
            Создайте заведение — получите ссылку и QR за пару минут.
          </p>
          <button type="button" className={`${btnClass} mt-4`} onClick={openOnboard}>
            Создать
          </button>
          <button type="button" className="btn btn-secondary mt-2 w-full" onClick={switchRole}>
            К выбору роли
          </button>
        </AppShell>
      )
    } else {
      screen = (
        <Suspense fallback={<CabinetFallback />}>
          <MasterCabinet
            theme={theme}
            masterId={selectedMasterId || business?.owner_profile_id || business?.legacy_master_id}
            masterSlug={businessSlug}
            businessId={business?.id || null}
            businessCreatedAt={business?.created_at || null}
            businessType={business?.type || 'other'}
            businessName={business?.name || theme.business_name}
            businessCity={business?.city || ''}
            businessAddress={business?.address || ''}
            businessSearchTags={business?.search_tags || []}
            services={services}
            memberships={memberships}
            members={members}
            analytics={analytics}
            analyticsLoaded={analyticsLoaded}
            initialTab={cabinetTab}
            profileInitialSection={profileInitialSection}
            onServicesChange={async () => {
              const list = await fetchBusinessServices({
                businessId: business?.id || null,
                masterId: selectedMasterId,
                includeInactive: true,
              })
              setServices(list)
              const active = list.filter((s) => s.is_active !== false)
              setSelectedServiceId(active[0]?.id || selectedServiceId)
            }}
            onBusinessMediaChange={async () => {
              if (businessSlug) await loadBusiness(businessSlug)
            }}
            onTypeChange={(type) => {
              setBusiness((prev) => (prev ? { ...prev, type } : prev))
            }}
            onCityChange={(city) => {
              setBusiness((prev) => (prev ? { ...prev, city } : prev))
            }}
            onAddressChange={(address) => {
              setBusiness((prev) => (prev ? { ...prev, address } : prev))
            }}
            onSearchTagsChange={(search_tags) => {
              setBusiness((prev) => (prev ? { ...prev, search_tags } : prev))
            }}
            onSwitchBusiness={async (slug) => {
              setAnalyticsLoaded(false)
              const loaded = await loadBusiness(slug)
              if (loaded.defaultMaster) refreshAnalytics(loaded.defaultMaster)
              setCabinetTab('today')
            }}
            onBack={switchRole}
            onRefresh={() => refreshAnalytics()}
            onNeedAnalytics={() => {
              if (!analyticsLoaded) refreshAnalytics()
            }}
          />
        </Suspense>
      )
    }
  } else if (mode === 'vk-link') {
    screen = (
      <Suspense fallback={<CabinetFallback />}>
        <VkLink
          onProfile={async (p) => {
            setProfile(p)
            setUserName(p?.full_name || `VK ${p?.vk_id || ''}`)
            const mems = await fetchMemberships(p?.id)
            setMemberships(mems)
            if (mems.length > 0) {
              const slug = mems[0]?.businesses?.slug
              if (slug) {
                const loaded = await loadBusiness(slug)
                setMode('cabinet')
                setCabinetTab('today')
              } else {
                setMode('cabinet')
              }
            } else {
              setMode('role-gate')
            }
          }}
        />
      </Suspense>
    )
  } else if (mode === 'client') {
    screen = (
      <Suspense fallback={<CabinetFallback />}>
        <ClientHome
          userName={userName}
          profile={profile}
          deeplinkBusiness={deeplinkBusiness}
          onBookBusiness={openBookingForSlug}
          onSwitchRole={switchRole}
        />
      </Suspense>
    )
  } else {
    screen = (
      <Suspense fallback={<CabinetFallback />}>
        <BookingFlow
          theme={theme}
          masterId={selectedMasterId || business?.owner_profile_id || business?.legacy_master_id}
          businessId={business?.id || null}
          businessSlug={businessSlug}
          businessCity={business?.city || ''}
          businessAddress={business?.address || ''}
          members={members}
          selectedMasterId={selectedMasterId}
          setSelectedMasterId={async (id) => {
            setSelectedMasterId(id)
            const list = await fetchBusinessServices({
              businessId: business?.id || null,
              masterId: id,
              includeInactive: true,
            })
            setServices(list)
            const active = list.filter((s) => s.is_active !== false)
            setSelectedServiceId(active[0]?.id || null)
          }}
          userName={userName}
          profile={profile}
          services={services.filter((s) => s.is_active !== false)}
          selectedServiceId={selectedServiceId}
          setSelectedServiceId={setSelectedServiceId}
          btnClass={btnClass}
          initialStep={bookingStep}
          prefillServiceId={prefillServiceId}
          prefillSlotIso={prefillSlotIso}
          onBackToHome={() => {
            allowClientHomeRef.current = true
            setMode('client')
          }}
        />
      </Suspense>
    )
  }

  return (
    <>
      {screen}
      {giftModal}
    </>
  )
}

export default App
