import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  ChevronDown,
  Clapperboard,
  GraduationCap,
  Hand,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Settings,
  Sparkles,
  Users,
  Video,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import Logo from '@/components/Logo'
import ThemeToggle from '@/components/ThemeToggle'
import { Avatar } from '@/components/ui/Misc'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import useJoinRequestNotifications from '@/hooks/useJoinRequestNotifications'
import api from '@/api/client'

const TEACHER_NAV = [
  { to: '/teacher', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/teacher/classrooms', label: 'Classrooms', icon: BookOpen },
  { to: '/teacher/join-requests', label: 'Join requests', icon: MessageSquareText },
  { to: '/teacher/lectures', label: 'Lectures', icon: Video },
  { to: '/teacher/recordings', label: 'Recordings', icon: Clapperboard },
  { to: '/teacher/students', label: 'Students', icon: Users },
  { to: '/teacher/settings', label: 'Settings', icon: Settings },
]

const STUDENT_NAV = [
  { to: '/student', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/student/classrooms', label: 'My classrooms', icon: BookOpen },
  { to: '/student/recordings', label: 'Recordings', icon: Clapperboard },
  { to: '/student/practice', label: 'Sign practice', icon: Hand },
  { to: '/student/settings', label: 'Settings', icon: Settings },
]

const TITLES = [
  ['/teacher/classrooms/', 'Classroom workspace'],
  ['/teacher/join-requests', 'Classroom Join Requests'],
  ['/teacher/classrooms', 'Classrooms'],
  ['/teacher/lectures', 'Lectures'],
  ['/teacher/recordings', 'Recordings'],
  ['/teacher/students', 'Students'],
  ['/teacher/settings', 'Settings'],
  ['/teacher/live/', 'Live classroom'],
  ['/teacher', 'Teaching overview'],
  ['/student/classrooms/', 'Live classroom'],
  ['/student/join-requests/', 'Waiting for Teacher Approval'],
  ['/student/classrooms', 'My classrooms'],
  ['/student/recordings/', 'Recording player'],
  ['/student/recordings', 'Recordings'],
  ['/student/practice', 'Sign practice'],
  ['/student/settings', 'Settings'],
  ['/student', 'Learning overview'],
]

function titleFor(pathname) {
  const entry = TITLES.find(([prefix]) => pathname.startsWith(prefix))
  return entry?.[1] || 'SignBridge'
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const { success, error: toastError } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingRequestCount, setPendingRequestCount] = useState(0)
  const menuRef = useRef(null)
  const isTeacher = user?.role === 'teacher'
  const nav = isTeacher ? TEACHER_NAV : STUDENT_NAV
  useJoinRequestNotifications(user?.id)

  useEffect(() => {
    if (!isTeacher) {
      setPendingRequestCount(0)
      return undefined
    }
    let active = true
    async function refreshPendingCount() {
      try {
        const { data } = await api.get('/teacher/join-requests')
        if (active) setPendingRequestCount(data.length)
      } catch (error) {
        console.error('Could not refresh the classroom join-request count.', error)
      }
    }
    refreshPendingCount()
    const timer = window.setInterval(refreshPendingCount, 10000)
    window.addEventListener('signbridge:join-request', refreshPendingCount)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('signbridge:join-request', refreshPendingCount)
    }
  }, [isTeacher])

  useEffect(() => {
    if (isTeacher) return undefined
    function onJoinRequest(event) {
      if (event.detail?.type === 'join_request_rejected') {
        toastError(
          'Join request declined',
          'Your request to join this classroom was declined by the teacher.',
        )
      }
    }
    window.addEventListener('signbridge:join-request', onJoinRequest)
    return () => window.removeEventListener('signbridge:join-request', onJoinRequest)
  }, [isTeacher, toastError])

  useEffect(() => {
    setMobileOpen(false)
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    function onClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function signOut() {
    await logout()
    success('Signed out', 'Your session has been closed securely.')
    navigate(isTeacher ? '/login/teacher' : '/login/student', { replace: true })
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-[76px] items-center justify-between px-5">
        <Logo />
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-xl p-2 text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800 lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mx-4 mb-5 rounded-2xl border border-ink-200/70 bg-gradient-to-br from-brand-500/10 via-transparent to-violet-500/10 p-3.5 dark:border-ink-800">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700 dark:text-brand-300">
          {isTeacher ? <Sparkles className="h-3 w-3" /> : <Hand className="h-3 w-3" />}
          {isTeacher ? 'Teacher studio' : 'Inclusive classroom'}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
          {isTeacher
            ? 'Speak once. Captions and ISL signs reach every learner.'
            : 'Video, captions and ISL signs — together in one live lesson.'}
        </p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6" aria-label="Portal navigation">
        {nav.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-ink-950 text-white shadow-soft dark:bg-white dark:text-ink-950'
                    : 'text-ink-600 hover:bg-white hover:text-ink-950 dark:text-ink-400 dark:hover:bg-ink-900 dark:hover:text-white',
                )
              }
            >
              <Icon className="h-[18px] w-[18px] opacity-80" />
              {item.label}
              {isTeacher && item.to === '/teacher/join-requests' && pendingRequestCount ? (
                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
                </span>
              ) : null}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-ink-200/70 p-4 dark:border-ink-800/70">
        <Link
          to={isTeacher ? '/teacher/classrooms' : '/student/classrooms'}
          className="flex items-center gap-3 rounded-2xl border border-ink-200/70 bg-white/60 px-3 py-2.5 text-xs transition hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-300">
            {isTeacher ? <GraduationCap className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
          </span>
          <span>
            <span className="block font-semibold">{isTeacher ? 'Start a live class' : 'Join a class'}</span>
            <span className="mt-0.5 block text-ink-400">{isTeacher ? 'Open a classroom' : 'Use a join code'}</span>
          </span>
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen">
      <div className="fixed inset-y-0 left-0 z-40 hidden w-[270px] border-r border-ink-200/70 bg-white/65 backdrop-blur-xl dark:border-ink-800/70 dark:bg-ink-950/80 lg:block">
        {sidebar}
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-[min(290px,calc(100vw-2rem))] border-r border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-950">{sidebar}</aside>
        </div>
      ) : null}

      <div className="lg:pl-[270px]">
        <header className="sticky top-0 z-30 border-b border-ink-200/60 bg-white/70 backdrop-blur-xl dark:border-ink-800/60 dark:bg-ink-950/70">
          <div className="flex h-[76px] items-center justify-between gap-3 px-4 sm:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-xl border border-ink-200 bg-white p-2 text-ink-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">
                  {isTeacher ? 'Teacher portal' : 'Student portal'}
                </p>
                <p className="truncate font-display text-base font-semibold">{titleFor(location.pathname)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300 sm:inline-flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                API connected
              </span>
              <ThemeToggle />
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((value) => !value)}
                  className="flex items-center gap-2 rounded-2xl border border-transparent p-1 pr-2 transition hover:border-ink-200 hover:bg-white dark:hover:border-ink-700 dark:hover:bg-ink-900"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <Avatar name={user?.full_name} size="sm" tone={isTeacher ? 'violet' : 'brand'} />
                  <span className="hidden max-w-[150px] truncate text-sm font-semibold sm:block">{user?.full_name}</span>
                  <ChevronDown className={clsx('h-4 w-4 text-ink-400 transition', menuOpen && 'rotate-180')} />
                </button>
                {menuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl dark:border-ink-800 dark:bg-ink-900"
                  >
                    <div className="border-b border-ink-100 px-4 py-3.5 dark:border-ink-800">
                      <p className="truncate text-sm font-semibold">{user?.full_name}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-400">{user?.email}</p>
                      <span className="mt-2 inline-flex rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                        {user?.role}
                      </span>
                    </div>
                    <Link
                      to={isTeacher ? '/teacher/settings' : '/student/settings'}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800"
                      role="menuitem"
                    >
                      <Settings className="h-4 w-4" /> Profile & settings
                    </Link>
                    <button
                      type="button"
                      onClick={signOut}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                      role="menuitem"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-7 sm:px-7 lg:px-9">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
