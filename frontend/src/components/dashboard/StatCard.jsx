import clsx from 'clsx'
import { ArrowUpRight } from 'lucide-react'

const TONES = {
  brand: {
    icon: 'bg-brand-500/10 text-brand-700 dark:text-brand-300',
    accent: 'from-brand-500/20 to-transparent',
  },
  violet: {
    icon: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    accent: 'from-violet-500/20 to-transparent',
  },
  emerald: {
    icon: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    accent: 'from-emerald-500/20 to-transparent',
  },
  amber: {
    icon: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    accent: 'from-amber-500/20 to-transparent',
  },
}

export default function StatCard({ icon: Icon, label, value, hint, tone = 'brand', action, className }) {
  const styles = TONES[tone] || TONES.brand
  return (
    <div className={clsx('card relative overflow-hidden p-5', className)}>
      <div className={clsx('pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br blur-2xl', styles.accent)} />
      <div className="relative flex items-start justify-between">
        <div className={clsx('flex h-10 w-10 items-center justify-center rounded-xl', styles.icon)}>
          {Icon ? <Icon className="h-4.5 w-4.5" /> : null}
        </div>
        {action}
      </div>
      <p className="relative mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">{label}</p>
      <p className="stat-value relative mt-1.5">{value}</p>
      {hint ? <p className="relative mt-1 text-xs text-ink-500 dark:text-ink-400">{hint}</p> : null}
    </div>
  )
}

export function MetricPill({ icon: Icon, label, value, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-500/10 text-brand-700 dark:text-brand-300',
    violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink-200/70 bg-white/70 px-3.5 py-2.5 dark:border-ink-800 dark:bg-ink-900/50">
      <span className={clsx('flex h-8 w-8 items-center justify-center rounded-xl', tones[tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-400">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  )
}

export function ArrowLink({ children, ...props }) {
  return (
    <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 transition hover:gap-1.5 dark:text-brand-300" {...props}>
      {children} <ArrowUpRight className="h-3 w-3" />
    </button>
  )
}
