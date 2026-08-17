import { useState } from 'react'
import AppShell from '../components/AppShell'
import { bookingQrPngUrl, downloadBookingQr } from '../lib/qr'
import { buildClientBookingLink } from '../lib/inviteLinks'
import { growthCopyPack } from '../lib/shareCopy'
import { haptic } from '../hooks/useTelegramChrome'
import { WebApp } from '../lib/telegram'

/**
 * Финальный шаг онбординга: ссылка + QR + текст для bio.
 */
export default function ShareReady({
  businessName,
  businessSlug,
  profile,
  btnClass,
  onContinue,
  hasCustomAvatar = false,
  hasCustomCover = false,
}) {
  const pack = growthCopyPack(
    businessName,
    businessSlug,
    profile?.telegram_id || null,
  )
  const deep = buildClientBookingLink(businessSlug)
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState('')
  const needsPhoto = !hasCustomAvatar || !hasCustomCover

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text)
      setToast(label || 'Скопировано')
      haptic('success')
    } catch {
      WebApp.showAlert?.(text)
    }
  }

  async function onQr() {
    setBusy('qr')
    try {
      await downloadBookingQr(deep, `zapis-${businessSlug || 'qr'}.png`)
      setToast('QR сохранён')
      haptic('success')
    } catch (err) {
      setToast(err?.message || 'Не удалось скачать QR')
    } finally {
      setBusy('')
    }
  }

  return (
    <AppShell className="fade-up">
      <p className="meta-label">Почти готово</p>
      <h1 className="display mt-1 text-2xl font-extrabold leading-tight">
        Дайте клиентам ссылку
      </h1>
      <p className="mt-2 text-sm text-[var(--brand-muted)]">
        Клиент записывается из Telegram за полминуты — без переписки «а можно завтра?»
      </p>

      {toast ? <p className="toast toast-ok mt-3">{toast}</p> : null}

      {needsPhoto ? (
        <div className="card mt-4 px-4 py-3.5 space-y-2 border border-[var(--brand-primary)]/20">
          <p className="text-sm font-semibold">Сначала добавьте фото</p>
          <p className="text-xs text-[var(--brand-muted)] leading-snug">
            Аватар и шапка повышают доверие: клиенты охотнее записываются, когда видят вас,
            а не пустой фон.
          </p>
          <ul className="text-xs text-[var(--brand-muted)] space-y-1">
            <li>{hasCustomAvatar ? '✓' : '○'} Аватар профиля</li>
            <li>{hasCustomCover ? '✓' : '○'} Шапка (обложка)</li>
          </ul>
          <p className="text-xs text-[var(--brand-muted)]">
            В кабинете: Ещё → Профиль и адрес.
          </p>
        </div>
      ) : null}

      <div className="card mt-5 px-4 py-4 space-y-3">
        <p className="text-sm font-semibold">{businessName || 'Ваше заведение'}</p>
        <p className="text-xs text-[var(--brand-muted)] break-all">{deep}</p>
        <div className="flex justify-center py-2">
          <img
            src={bookingQrPngUrl(deep, 200)}
            alt="QR записи"
            width={160}
            height={160}
            className="rounded-lg bg-white p-2"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm w-full"
            onClick={() => copy(deep, 'Ссылка скопирована')}
          >
            Ссылка
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm w-full"
            disabled={busy === 'qr'}
            onClick={onQr}
          >
            {busy === 'qr' ? '…' : 'Скачать QR'}
          </button>
        </div>
      </div>

      <div className="card mt-3 px-4 py-4 space-y-3">
        <p className="text-sm font-semibold">Текст для bio</p>
        <p className="text-xs text-[var(--brand-muted)]">
          Скопируйте и вставьте в описание профиля в Telegram или соцсети.
        </p>
        <button
          type="button"
          className="btn btn-secondary w-full text-left !justify-start !h-auto !py-3"
          onClick={() => copy(pack.bio, 'Текст для bio скопирован')}
        >
          <span className="block w-full min-w-0 whitespace-pre-wrap break-words text-sm font-medium leading-snug">
            {pack.bio}
          </span>
        </button>
      </div>

      <button type="button" className={`${btnClass} mt-5`} onClick={onContinue}>
        В кабинет
      </button>
      <p className="mt-3 text-center text-xs text-[var(--brand-muted)]">
        Ссылка и QR — во вкладке «Ссылка».
      </p>
    </AppShell>
  )
}
