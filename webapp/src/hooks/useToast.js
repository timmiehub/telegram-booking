import { useCallback, useState } from 'react'

/**
 * Лёгкий toast для save/delete/copy.
 * @returns {{ message, kind, showToast, clearToast }}
 */
export function useToast() {
  const [state, setState] = useState({ message: '', kind: 'ok' })
  const timerRef = { current: null }

  const clearToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setState({ message: '', kind: 'ok' })
  }, [])

  const showToast = useCallback(
    (message, kind = 'ok') => {
      if (!message) return
      if (timerRef.current) clearTimeout(timerRef.current)
      setState({ message, kind })
      timerRef.current = setTimeout(() => {
        setState({ message: '', kind: 'ok' })
      }, 2500)
    },
    [],
  )

  return { ...state, showToast, clearToast }
}
