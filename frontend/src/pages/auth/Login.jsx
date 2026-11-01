import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, GraduationCap, Sparkles } from 'lucide-react'
import AuthLayout from '@/components/layout/AuthLayout'
import Button from '@/components/ui/Button'
import { Input, PasswordInput } from '@/components/ui/Field'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { errorMessage } from '@/api/client'

// Demo credentials are shown only in dev builds, or when a build explicitly sets
// VITE_SHOW_DEMO_LOGIN=true. Production builds never include the button.
const SHOW_DEMO =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_LOGIN === 'true'

const DEMO = {
  teacher: { email: 'teacher@signbridge.app', password: 'Learn@12345' },
  student: { email: 'aarav.deaf@signbridge.app', password: 'Learn@12345' },
}

export default function Login({ role = 'student' }) {
  const { user, login } = useAuth()
  const { success } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const isTeacher = role === 'teacher'
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) {
    return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />
  }

  function fillDemo() {
    setForm(DEMO[role])
    setError('')
  }

  async function onSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login({ ...form, role })
      success('Welcome back', `Signed in to the ${role} portal.`)
      const from = location.state?.from
      const destination = from && from.startsWith(`/${role}`) ? from : isTeacher ? '/teacher' : '/student'
      navigate(destination, { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Could not sign you in.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout role={role}>
      <div className="mb-7">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-700 dark:text-brand-300">
          {isTeacher ? <GraduationCap className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
        </div>
        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight">{isTeacher ? 'Teacher sign in' : 'Student sign in'}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
          {isTeacher
            ? 'Open your teaching studio, start a live lecture and publish captions.'
            : 'Join your live classroom with video, multilingual captions and ISL signs.'}
        </p>
      </div>

      {error ? (
        <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder={isTeacher ? 'teacher@school.edu' : 'student@school.edu'}
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          required
        />
        <PasswordInput
          label="Password"
          autoComplete="current-password"
          placeholder="Your password"
          value={form.password}
          onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          required
        />
        <Button type="submit" variant="brand" size="lg" loading={loading} className="w-full justify-between">
          Sign in to {isTeacher ? 'teacher portal' : 'classroom'} <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      {SHOW_DEMO ? (
        <button
          type="button"
          onClick={fillDemo}
          className="mt-3 w-full rounded-2xl border border-dashed border-ink-300 px-4 py-2.5 text-left text-xs text-ink-500 transition hover:border-brand-400 hover:text-brand-700 dark:border-ink-700 dark:text-ink-400 dark:hover:text-brand-300"
        >
          <span className="font-semibold text-ink-700 dark:text-ink-200">Use demo {role} account</span>
          <span className="mt-0.5 block font-mono text-[11px]">{DEMO[role].email} · Learn@12345</span>
        </button>
      ) : null}

      <div className="mt-7 space-y-3 text-sm">
        <p className="text-ink-500 dark:text-ink-400">
          New to SignBridge?{' '}
          <Link to={`/register/${role}`} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
            Create a {role} account
          </Link>
        </p>
        <p className="text-ink-500 dark:text-ink-400">
          {isTeacher ? 'Looking for the student portal?' : 'Are you a teacher?'}{' '}
          <Link to={isTeacher ? '/login/student' : '/login/teacher'} className="font-semibold text-ink-800 hover:underline dark:text-ink-100">
            Sign in as {isTeacher ? 'a student' : 'a teacher'}
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
