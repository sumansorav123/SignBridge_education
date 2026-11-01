import { Link } from 'react-router-dom'
import { ArrowLeft, Compass } from 'lucide-react'
import Logo from '@/components/Logo'
import Button from '@/components/ui/Button'
import { useAuth } from '@/context/AuthContext'

export default function NotFound() {
  const { user } = useAuth()
  const home = user?.role === 'teacher' ? '/teacher' : user?.role === 'student' ? '/student' : '/'
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo className="mb-10" />
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-500/10 text-brand-700 dark:text-brand-300">
        <Compass className="h-7 w-7" />
      </div>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-brand-700 dark:text-brand-300">404 · Off the map</p>
      <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">This classroom does not exist.</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-500 dark:text-ink-400">
        The page may have moved, or the classroom may have been archived by its teacher. Your other lessons are still waiting.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button as={Link} to={home} variant="brand" icon={ArrowLeft}>Back to my portal</Button>
        <Button as={Link} to="/" variant="ghost">SignBridge home</Button>
      </div>
    </div>
  )
}
