import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import Toast from '../components/Toast'
import ExternalBookingSheet from '../components/ExternalBookingSheet'
import { useToast } from '../hooks/useToast'
import ScheduleSection from './master/ScheduleSection'
import {
  fillNextDays,
  createEmptySchedule,
  fetchMemberAvailability,
  updateMemberSchedule,
} from '../lib/availability'
import {
  fetchBusinessSettings,
  updateBusinessSettings,
  DEFAULT_BUSINESS_SETTINGS,
} from '../lib/settings'
import { haptic } from '../hooks/useTelegramChrome'

/** Отдельная вкладка «Расписание» в кабинете мастера */
export default function MasterScheduleTab({ masterId, businessId }) {
  const [schedule, setSchedule] = useState(() => fillNextDays(createEmptySchedule(), 14))
  const [bizSettings, setBizSettings] = useState(DEFAULT_BUSINESS_SETTINGS)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [externalOpen, setExternalOpen] = useState(false)
  const { message: toastMsg, kind: toastKind, showToast } = useToast()

  useEffect(() => {
    if (!businessId) return
    fetchBusinessSettings(businessId).then(({ settings }) => {
      setBizSettings(settings)
    })
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

  return (
    <div className="fade-up space-y-4">
      <Toast message={toastMsg} kind={toastKind} />
      <p className="text-sm text-[var(--brand-muted)]">
        Отметьте рабочие дни и часы — клиенты увидят только свободные окна.
      </p>
      <button
        type="button"
        className="pressable schedule-external-row"
        onClick={() => {
          haptic('light')
          setExternalOpen(true)
        }}
      >
        <span className="schedule-external-row-icon" aria-hidden>
          <Icon name="icon-plus" size={18} />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-semibold text-[var(--brand-text)]">
            Сторонняя запись
          </span>
          <span className="mt-0.5 block text-xs text-[var(--brand-muted)]">
            YClients, Google, звонок — занять слот, чтобы не записывались поверх
          </span>
        </span>
        <Icon name="icon-chevron-right" size={18} className="shrink-0 opacity-50" />
      </button>
      {error ? <p className="text-sm text-warning">{error}</p> : null}
      <ScheduleSection
        schedule={schedule}
        setSchedule={setSchedule}
        bizSettings={bizSettings}
        setBizSettings={setBizSettings}
        busy={busy}
        onSaveSchedule={onSaveSchedule}
        onSaveBizSettings={onSaveBizSettings}
      />
      <ExternalBookingSheet
        open={externalOpen}
        masterId={masterId}
        businessId={businessId}
        onClose={() => setExternalOpen(false)}
        onSaved={() => showToast('Запись добавлена')}
      />
    </div>
  )
}
