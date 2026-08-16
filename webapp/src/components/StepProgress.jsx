const STEPS = [
  { id: 'service', label: 'Услуга' },
  { id: 'time', label: 'Время' },
  { id: 'done', label: 'Готово' },
]

export default function StepProgress({ current }) {
  const idx = STEPS.findIndex((s) => s.id === current)
  const active = idx < 0 ? 0 : idx

  return (
    <ol className="step-progress mb-5" aria-label="Шаги записи">
      {STEPS.map((s, i) => {
        const state = i < active ? 'done' : i === active ? 'active' : ''
        return (
          <li key={s.id} className={state}>
            <span className="step-dot" aria-hidden />
            <span className="step-label">{s.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
