import WorkCalendar from '../../components/WorkCalendar'
import { NumberField } from '../../components/Fields'

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
    <div className="space-y-4">
      <WorkCalendar schedule={schedule} onChange={setSchedule} />
      <div className="card px-4 py-3 space-y-3">
        <p className="text-sm font-semibold">Правила для клиентов</p>
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={bizSettings.require_confirm}
            onChange={(e) =>
              setBizSettings((s) => ({ ...s, require_confirm: e.target.checked }))
            }
          />
          Просить подтверждение визита за сутки (кнопка в боте)
        </label>
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
