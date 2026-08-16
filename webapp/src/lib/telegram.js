import sdk from '@twa-dev/sdk'

/**
 * Всегда берём актуальный window.Telegram.WebApp (после инъекции клиента).
 * Не кэшируем stub на этапе импорта модуля.
 */
function resolveWebApp() {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.ready) {
    return window.Telegram.WebApp
  }

  const candidate = sdk?.ready ? sdk : sdk?.default
  if (candidate?.ready) return candidate

  return {
    initData: '',
    initDataUnsafe: {},
    themeParams: {},
    platform: 'unknown',
    ready: () => {},
    expand: () => {},
    showAlert: (msg) => window.alert?.(msg),
    HapticFeedback: {
      impactOccurred: () => {},
      notificationOccurred: () => {},
    },
    MainButton: {
      setText: () => {},
      show: () => {},
      hide: () => {},
      enable: () => {},
      disable: () => {},
      onClick: () => {},
      offClick: () => {},
    },
    BackButton: {
      show: () => {},
      hide: () => {},
      onClick: () => {},
      offClick: () => {},
    },
  }
}

export const WebApp = new Proxy(
  {},
  {
    get(_target, prop) {
      const wa = resolveWebApp()
      const value = wa[prop]
      return typeof value === 'function' ? value.bind(wa) : value
    },
    set(_target, prop, value) {
      resolveWebApp()[prop] = value
      return true
    },
  },
)

function hashHasTgData() {
  try {
    const hash = String(window.location.hash || '').replace(/^#/, '')
    return /tgWebAppData=/.test(hash)
  } catch {
    return false
  }
}

function hashHasTgVersion() {
  try {
    const hash = String(window.location.hash || '')
    return /tgWebAppVersion=/.test(hash) || /tgWebAppPlatform=/.test(hash)
  } catch {
    return false
  }
}

export function isTelegramEnvironment() {
  try {
    const wa = resolveWebApp()
    // Реальная сессия Telegram. Не опираемся только на platform:
    // у stub/браузера с подключённым sdk.js platform может быть «не unknown».
    if (wa.initData && wa.initData.length > 0) return true
    if (wa.initDataUnsafe?.user?.id) return true
    if (hashHasTgData()) return true
    // Desktop/Web иногда отдаёт hash с version до initData — это всё ещё TG.
    if (hashHasTgVersion() && typeof window !== 'undefined' && window.Telegram?.WebApp) {
      return true
    }
    return false
  } catch {
    return false
  }
}
