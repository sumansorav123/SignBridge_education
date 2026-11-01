import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, Check, GraduationCap, Sparkles } from 'lucide-react'
import AuthLayout from '@/components/layout/AuthLayout'
import Button from '@/components/ui/Button'
import { Input, PasswordInput, Select } from '@/components/ui/Field'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { errorMessage } from '@/api/client'

const EMPTY = {
  full_name: '',
  email: '',
  password: '',
  confirm: '',
  institution: '',
  department: '',
  subject_specialty: '',
  years_experience: '',
  school: '',
  grade_level: '',
}

export default function Register({ role = 'student' }) {
  const { user, register } = useAuth()
  const { success } = useToast()
  const navigate = useNavigate()
  const isTeacher = role === 'teacher'
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const passwordChecks = useMemo(
    () => [
      { label: 'At least 8 characters', valid: form.password.length >= 8 },
      { label: 'Contains a letter', valid: /[A-Za-z]/.test(form.password) },
      { label: 'Contains a number', valid: /\d/.test(form.password) },
    ],
    [form.password],
  )

  if (user) {
    return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />
  }

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function onSubmit(event) {
    event.preventDefault()
    setError('')
    if (!passwordChecks.every((check) => check.valid)) {
      setError('Choose a password with at least 8 characters, including a letter and a number.')
      return
    }
    if (form.password !== form.confirm) {
      setError('The two passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const payload = {
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        role,
      }
      if (isTeacher) {
        payload.teacher_profile = {
          institution: form.institution.trim() || null,
          department: form.department.trim() || null,
          subject_specialty: form.subject_specialty.trim() || null,
          years_experience: form.years_experience === '' ? null : Number(form.years_experience),
        }
      } else {
        payload.student_profile = {
          school: form.school.trim() || null,
          grade_level: form.grade_level.trim() || null,
        }
      }
      await register(payload)
      success('Account created', isTeacher ? 'Your teaching studio is ready.' : 'Your inclusive classroom access is ready.')
      navigate(isTeacher ? '/teacher' : '/student', { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Could not create your account.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout role={role}>
      <div className="mb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-700 dark:text-violet-300">
          {isTeacher ? <GraduationCap className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
        </div>
        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight">Create a {role} account</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
          {isTeacher
            ? 'Set up your teaching profile. You can create classrooms immediately after signing in.'
            : 'Set up your learner profile. Your accessibility choices can be changed at any time.'}
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
          label="Full name"
          placeholder="e.g. Meera Sharma"
          autoComplete="name"
          value={form.full_name}
          onChange={(event) => update('full_name', event.target.value)}
          required
        />
        <Input
          label="Email address"
          type="email"
          placeholder="you@school.edu"
          autoComplete="email"
          value={form.email}
          onChange={(event) => update('email', event.target.value)}
          required
        />

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <PasswordInput
            className="min-w-0"
            label="Password"
            autoComplete="new-password"
            placeholder="Create a password"
            value={form.password}
            onChange={(event) => update('password', event.target.value)}
            required
          />
          <PasswordInput
            className="min-w-0"
            label="Confirm password"
            autoComplete="new-password"
            placeholder="Repeat password"
            value={form.confirm}
            onChange={(event) => update('confirm', event.target.value)}
            required
          />
        </div>

        <div className="grid gap-1.5 rounded-2xl border border-ink-200/70 bg-ink-50/60 p-3 dark:border-ink-800 dark:bg-ink-950/40 sm:grid-cols-3">
          {passwordChecks.map((check) => (
            <span key={check.label} className={`inline-flex items-center gap-1.5 text-[11px] ${check.valid ? 'text-emerald-600 dark:text-emerald-300' : 'text-ink-400'}`}>
              <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${check.valid ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink-300 dark:border-ink-600'}`}>
                {check.valid ? <Check className="h-2 w-2" /> : null}
              </span>
              {check.label}
            </span>
          ))}
        </div>

        <div className="rounded-2xl border border-ink-200/70 p-4 dark:border-ink-800">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">
            {isTeacher ? 'Teaching profile (optional)' : 'Learner profile (optional)'}
          </p>
          {isTeacher ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Institution"
                placeholder="Sunrise Inclusive School"
                value={form.institution}
                onChange={(event) => update('institution', event.target.value)}
              />
              <Input
                label="Department"
                placeholder="Science"
                value={form.department}
                onChange={(event) => update('department', event.target.value)}
              />
              <Input
                label="Subject specialty"
                placeholder="Science & Mathematics"
                value={form.subject_specialty}
                onChange={(event) => update('subject_specialty', event.target.value)}
              />
              <Input
                label="Years of experience"
                type="number"
                min="0"
                max="70"
                placeholder="9"
                value={form.years_experience}
                onChange={(event) => update('years_experience', event.target.value)}
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="School"
                placeholder="Sunrise Inclusive School"
                value={form.school}
                onChange={(event) => update('school', event.target.value)}
              />
              <Select
                label="Grade level"
                placeholder="Select grade"
                value={form.grade_level}
                onChange={(event) => update('grade_level', event.target.value)}
              >
                {['Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 'College'].map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <Button type="submit" variant="brand" size="lg" loading={loading} className="w-full justify-between">
          Create account <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-400 dark:text-ink-500">
        By creating an account you agree to use SignBridge responsibly. Sign content is a starter
        lexicon and should be verified by a certified interpreter for high-stakes use.
      </p>

      <p className="mt-5 text-center text-sm text-ink-500 dark:text-ink-400">
        Already have an account?{' '}
        <Link to={`/login/${role}`} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">Sign in</Link>
      </p>
      <p className="mt-2 text-center text-sm text-ink-500 dark:text-ink-400">
        {isTeacher ? 'Need a student account?' : 'Are you teaching?'}{' '}
        <Link to={`/register/${isTeacher ? 'student' : 'teacher'}`} className="font-semibold text-ink-800 hover:underline dark:text-ink-100">
          Register as {isTeacher ? 'a student' : 'a teacher'}
        </Link>
      </p>
    </AuthLayout>
  )
}
