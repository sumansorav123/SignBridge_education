import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowRight, Menu, X } from 'lucide-react'
import Logo from '@/components/Logo'
import ThemeToggle from '@/components/ThemeToggle'
import Button from '@/components/ui/Button'

const links = [
  { to: '/features', label: 'Features' },
  { to: '/about', label: 'About' },
]

export default function PublicLayout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setOpen(false)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-white/50 bg-white/75 backdrop-blur-xl dark:border-white/5 dark:bg-ink-950/70">
        <div className="container-page flex h-[72px] items-center justify-between gap-4">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2.5 md:flex">
            <ThemeToggle />
            <Button as={Link} to="/login/student" variant="ghost" size="sm">
              Student sign in
            </Button>
            <Button as={Link} to="/login/teacher" variant="primary" size="sm" icon={ArrowRight}>
              Teacher sign in
            </Button>
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-ink-200 bg-white/70 dark:border-ink-700 dark:bg-ink-900/60"
              aria-label="Toggle navigation menu"
              aria-expanded={open}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open ? (
          <div className="border-t border-ink-100 bg-white px-5 py-4 dark:border-ink-800 dark:bg-ink-950 md:hidden">
            <nav className="flex flex-col gap-1" aria-label="Mobile navigation">
              {links.map((link) => (
                <NavLink key={link.to} to={link.to} className="rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-ink-100 dark:hover:bg-ink-800">
                  {link.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button as={Link} to="/login/student" variant="ghost" size="sm">Student</Button>
              <Button as={Link} to="/login/teacher" variant="primary" size="sm">Teacher</Button>
            </div>
          </div>
        ) : null}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-ink-200/70 bg-white/50 py-10 dark:border-ink-800/70 dark:bg-ink-950/40">
        <div className="container-page grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-500 dark:text-ink-400">
              One live classroom where deaf and hearing students learn together — with teacher video,
              multilingual captions and a synchronized ISL avatar.
            </p>
            <p className="mt-4 text-xs text-ink-400 dark:text-ink-500">
              Built as an inclusive-education prototype. Verify sign language content with certified interpreters before high-stakes use.
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-400">Platform</p>
            <div className="mt-3 flex flex-col gap-2 text-sm text-ink-600 dark:text-ink-300">
              <Link to="/features" className="hover:text-brand-700 dark:hover:text-brand-300">Features</Link>
              <Link to="/about" className="hover:text-brand-700 dark:hover:text-brand-300">About the project</Link>
              <Link to="/login/teacher" className="hover:text-brand-700 dark:hover:text-brand-300">Teacher portal</Link>
              <Link to="/login/student" className="hover:text-brand-700 dark:hover:text-brand-300">Student portal</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-400">Accessibility</p>
            <div className="mt-3 flex flex-col gap-2 text-sm text-ink-600 dark:text-ink-300">
              <span>12 subtitle languages</span>
              <span>High-contrast caption controls</span>
              <span>Reduced-motion support</span>
              <span>Keyboard-first navigation</span>
            </div>
          </div>
        </div>
        <div className="container-page mt-10 flex flex-col gap-2 border-t border-ink-200/70 pt-5 text-xs text-ink-400 dark:border-ink-800/70 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} SignBridge. Inclusive learning, by design.</span>
          <span>ISL lexicon is a curated starter set — not a replacement for a human interpreter.</span>
        </div>
      </footer>
    </div>
  )
}
