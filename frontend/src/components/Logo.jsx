import { Link } from 'react-router-dom'
import clsx from 'clsx'

export default function Logo({ to = '/', compact = false, className }) {
  return (
    <Link to={to} className={clsx('group inline-flex items-center gap-2.5', className)} aria-label="SignBridge home">
      <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-ink-950 shadow-soft ring-1 ring-white/10 transition group-hover:scale-[1.03]">
        <span className="absolute -right-3 -top-3 h-8 w-8 rounded-full bg-violet-500/70 blur-md" />
        <span className="absolute -bottom-2 -left-2 h-7 w-7 rounded-full bg-brand-400/70 blur-md" />
        <svg viewBox="0 0 32 32" className="relative h-5 w-5 text-white" fill="currentColor" aria-hidden="true">
          <path d="M8.2 17.7c0-1 .8-1.8 1.8-1.8h.9v-5.4a1.8 1.8 0 1 1 3.6 0v4.6h.9V9.3a1.8 1.8 0 1 1 3.6 0v5.8h.9V11a1.8 1.8 0 1 1 3.6 0v7.3c0 4.5-3.1 7.2-7.1 7.2h-1c-4 0-7.2-3.1-7.2-7.2Z" opacity=".95" />
          <path d="M10.6 19.8c1.4 2.1 3.6 3.2 5.8 3.2" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity=".7" />
        </svg>
      </span>
      {!compact ? (
        <span className="leading-none">
          <span className="block whitespace-nowrap font-display text-[15px] font-bold tracking-tight text-ink-950 dark:text-white sm:text-lg">SignBridge</span>
          <span className="logo-tagline mt-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-400 dark:text-ink-500">Every learner, one class</span>
        </span>
      ) : null}
    </Link>
  )
}
