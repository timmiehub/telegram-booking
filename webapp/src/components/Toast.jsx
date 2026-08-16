/** Неблокирующее уведомление */
export default function Toast({ message, kind = 'ok' }) {
  if (!message) return null
  return (
    <p
      className={`toast toast-${kind}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </p>
  )
}
