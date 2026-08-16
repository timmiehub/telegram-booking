import { Component } from 'react'

/** Ловит падения React, чтобы не оставался чёрный экран. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('UI crash:', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || 'Неизвестная ошибка'
      return (
        <div
          style={{
            minHeight: '100vh',
            padding: 24,
            background: '#0c1016',
            color: '#f4f6f8',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
          }}
        >
          <h1
            style={{
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif',
              fontSize: 22,
              margin: '0 0 8px',
            }}
          >
            Что-то сломалось
          </h1>
          <p style={{ color: '#97a1b0', fontSize: 14, margin: '0 0 16px' }}>
            Перезапустите Mini App из бота. Если снова — напишите в поддержку.
          </p>
          <p style={{ fontSize: 12, color: '#6b7280', wordBreak: 'break-word' }}>{msg}</p>
          <button
            type="button"
            style={{
              marginTop: 16,
              minHeight: 48,
              padding: '0 18px',
              borderRadius: 14,
              border: 0,
              background: '#4db0e0',
              color: '#061018',
              fontWeight: 700,
            }}
            onClick={() => window.location.reload()}
          >
            Обновить
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
