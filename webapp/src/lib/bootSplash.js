/**
 * Скрыть HTML-splash после готовности React.
 * Минимум MIN_MS — чтобы не мелькало и ощущалось как «премиум» загрузка.
 */
const MIN_MS = 750

export function hideBootSplash({ force = false } = {}) {
  const hide = () => {
    try {
      window.__hideBootSplash?.()
    } catch {
      // ignore
    }
  }

  if (force) {
    hide()
    return
  }

  const started = Number(window.__BOOT_SPLASH_AT) || Date.now()
  const wait = Math.max(0, MIN_MS - (Date.now() - started))
  if (wait === 0) hide()
  else setTimeout(hide, wait)
}
