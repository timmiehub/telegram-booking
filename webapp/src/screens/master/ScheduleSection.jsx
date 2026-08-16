import WorkCalendar from '../../components/WorkCalendar'
import { NumberField } from '../../components/Fields'
import { haptic } from '../../hooks/useTelegramChrome'

export default function ScheduleSection({
  schedule,
  setSchedule,
  bizSettings,
  setBizSettings,
  busy,
  onSaveSchedule,
  onSaveBizSettings,
}) {
  return (
    <div className="space-y-4 schedule-tab-body">
      <WorkCalendar schedule={schedule} onChange={setSchedule} />

      <div className="card schedule-rules-card">
        <div className="schedule-rules-head">
          <span className="schedule-rules-title">Правила для клиентов</span>
          <span className="schedule-rules-sub">Когда можно отменить или подтвердить визит</span>
        </div>

        <NumberField
          label="Перенос/отмена не позже (часов)"
          value={bizSettings.reschedule_min_hours}
          min={0}
          max={168}
          placeholder="24"
          suffix="ч"
          onChange={(v) =>
            setBizSettings((s) => ({
              ...s,
              reschedule_min_hours: v,
            }))
          }
          onBlur={() => {
            if (
              bizSettings.reschedule_min_hours === '' ||
              bizSettings.reschedule_min_hours == null
            ) {
              setBizSettings((s) => ({ ...s, reschedule_min_hours: 0 }))
            }
          }}
        />

        <button
          type="button"
          className={`schedule-confirm-toggle ${bizSettings.require_confirm ? 'is-on' : ''}`}
          role="switch"
          aria-checked={Boolean(bizSettings.require_confirm)}
          onClick={() => {
            haptic('light')
            setBizSettings((s) => ({ ...s, require_confirm: !s.require_confirm }))
          }}
        >
          <span className="schedule-confirm-copy">
            <span className="schedule-confirm-title">Подтверждение за сутки</span>
            <span className="schedule-confirm-hint">Кнопка в боте перед визитом</span>
          </span>
          <span className="schedule-confirm-switch" aria-hidden="true">
            <span className="schedule-confirm-knob" />
          </span>
        </button>

        <button
          type="button"
          className="btn btn-secondary w-full"
          disabled={busy === 'settings'}
          onClick={() =>
            onSaveBizSettings({
              ...bizSettings,
              reschedule_min_hours:
                bizSettings.reschedule_min_hours === '' ||
                bizSettings.reschedule_min_hours == null
                  ? 0
                  : Number(bizSettings.reschedule_min_hours) || 0,
            })
          }
        >
          {busy === 'settings' ? 'Сохраняю…' : 'Сохранить правила'}
        </button>
      </div>

      <button
        type="button"
        className="pressable btn btn-primary w-full"
        disabled={busy === 'schedule'}
        onClick={onSaveSchedule}
      >
        {busy === 'schedule' ? 'Сохраняю…' : 'Сохранить расписание'}
      </button>
    </div>
  )
}
