export default function PageHeader({ eyebrow, title, description, actions, children }) {
  return (
    <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="section-eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500 dark:text-ink-400">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  )
}
