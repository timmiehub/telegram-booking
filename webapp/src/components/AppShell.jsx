export default function AppShell({ children, className = '' }) {
  return <main className={`app-shell ${className}`}>{children}</main>
}

export function PageTitle({ eyebrow, title, right }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3 fade-up">
      <div>
        {eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-muted)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="display mt-1 text-[28px] font-extrabold leading-tight">
          {title}
        </h1>
      </div>
      {right}
    </header>
  )
}

export function Surface({ children, className = '' }) {
  return <div className={`card ${className}`}>{children}</div>
}

export function SkeletonBlock({ className = '' }) {
  return <div className={`skeleton ${className}`} aria-hidden />
}

export function SkeletonMasterCard() {
  return (
    <div className="skeleton-master mb-2" aria-hidden>
      <div className="skeleton" />
      <div className="skeleton-lines">
        <div className="skeleton h-4 w-3/5" />
        <div className="skeleton h-3 w-2/5" />
      </div>
    </div>
  )
}
