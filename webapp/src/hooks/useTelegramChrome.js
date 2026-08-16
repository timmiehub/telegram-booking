import { useEffect } from 'react'
import { WebApp } from '../lib/telegram'

const MAIN_BTN_CLASS = 'has-main-button'

/**
 * Нативные MainButton / BackButton Telegram.
 * Вне Telegram — no-op.
 */
export function useTelegramChrome({
  mainText,
  mainVisible = false,
  mainEnabled = true,
  onMain,
  backVisible = false,
  onBack,
}) {
  useEffect(() => {
    if (mainVisible) {
      document.documentElement.classList.add(MAIN_BTN_CLASS)
    } else {
      document.documentElement.classList.remove(MAIN_BTN_CLASS)
    }
    return () => {
      document.documentElement.classList.remove(MAIN_BTN_CLASS)
    }
  }, [mainVisible])

  useEffect(() => {
    const main = WebApp.MainButton
    const back = WebApp.BackButton
    if (!main && !back) return undefined

    const handleMain = () => onMain?.()
    const handleBack = () => onBack?.()

    try {
      if (main) {
        if (mainText) main.setText(mainText)
        if (mainEnabled) main.enable?.()
        else main.disable?.()
        if (mainVisible) main.show?.()
        else main.hide?.()
        main.onClick?.(handleMain)
      }
      if (back) {
        if (backVisible) back.show?.()
        else back.hide?.()
        back.onClick?.(handleBack)
      }
    } catch (err) {
      console.warn('Telegram chrome:', err)
    }

    return () => {
      try {
        main?.offClick?.(handleMain)
        back?.offClick?.(handleBack)
        main?.hide?.()
        back?.hide?.()
      } catch {
        // ignore
      }
    }
  }, [mainText, mainVisible, mainEnabled, onMain, backVisible, onBack])
}

export function haptic(type = 'light') {
  try {
    if (type === 'success' || type === 'error' || type === 'warning') {
      WebApp.HapticFeedback?.notificationOccurred?.(type === 'warning' ? 'warning' : type)
      return
    }
    WebApp.HapticFeedback?.impactOccurred?.(type)
  } catch {
    // ignore
  }
}
