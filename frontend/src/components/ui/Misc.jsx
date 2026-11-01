import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import { initials } from '@/lib/format'

const BADGE_TONES = {
  brand: 'border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-950/60 dark:text-brand-200',
  violet: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-200',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
  amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200',
  rose: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200',
  slate: 'border-ink-200 bg-ink-50 text-ink-700 dark:border-ink-700 dark:bg-ink-800/60 dark:text-ink-200',
}

export function Badge({ tone = 'slate', className, children, dot = false }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', BADGE_TONES[tone] || BADGE_TONES.slate, className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  )
}

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={clsx('animate-spin text-brand-600 dark:text-brand-300', className)} aria-label="Loading" />
}

export function FullPageLoader({ label = 'Preparing your classroom…' }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-500/10">
        <Spinner className="h-6 w-6" />
        <span className="absolute inset-0 animate-pulse-ring rounded-3xl border border-brand-400/40" />
      </div>
      <p className="text-sm text-ink-500 dark:text-ink-400">{label}</p>
    </div>
  )
}

export function Avatar({ name, src, size = 'md', tone = 'brand', className }) {
  const sizes = {
    xs: 'h-8 w-8 text-[11px]',
    sm: 'h-10 w-10 text-xs',
    md: 'h-12 w-12 text-sm',
    lg: 'h-16 w-16 text-lg',
    xl: 'h-20 w-20 text-xl',
  }
  const tones = {
    brand: 'from-brand-400 to-brand-600 text-white',
    violet: 'from-violet-400 to-violet-600 text-white',
    slate: 'from-ink-500 to-ink-800 text-white',
  }
  return (
    <div
      className={clsx(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br font-bold shadow-sm',
        sizes[size],
        tones[tone] || tones.brand,
        className,
      )}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center rounded-3xl border border-dashed border-ink-300 bg-white/60 px-6 py-12 text-center dark:border-ink-700 dark:bg-ink-900/40', className)}>
      {Icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-700 dark:text-brand-300">
          <Icon className="h-6 w-6" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-500 dark:text-ink-400">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function Skeleton({ className }) {
  return <div className={clsx('animate-pulse rounded-2xl bg-ink-200/70 dark:bg-ink-800/70', className)} />
}

export function ProgressBar({ value = 0, tone = 'brand', className, label }) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0))
  const tones = {
    brand: 'bg-brand-500',
    violet: 'bg-violet-500',
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
  }
  return (
    <div className={className}>
      {label ? <div className="mb-1.5 flex justify-between text-xs text-ink-500 dark:text-ink-400"><span>{label}</span><span>{Math.round(percent)}%</span></div> : null}
      <div className="h-2 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className={clsx('h-full rounded-full transition-all duration-500', tones[tone] || tones.brand)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
