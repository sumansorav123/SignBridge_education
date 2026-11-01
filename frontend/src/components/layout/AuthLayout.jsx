import { Link } from 'react-router-dom'
import { ArrowLeft, Captions, Hand, Sparkles, Users } from 'lucide-react'
import Logo from '@/components/Logo'
import ThemeToggle from '@/components/ThemeToggle'

export default function AuthLayout({ children, role = 'student' }) {
  const isTeacher = role === 'teacher'
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
        <div className="pointer-events-none absolute -right-24 top-1/4 h-80 w-80 rounded-full bg-violet-600/25 blur-[110px]" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-brand-500/25 blur-[110px]" />

        <div className="relative">
          <Logo />
        </div>

        <div className="relative max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/80">
            <Sparkles className="h-3.5 w-3.5 text-brand-300" />
            {isTeacher ? 'Teacher studio' : 'Inclusive learning'}
          </div>
          <h2 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight">
            {isTeacher ? 'Speak once. Reach every learner in the room.' : 'Follow the lesson, not a delayed transcript.'}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/55">
            {isTeacher
              ? 'Start a live class, publish captions in real time, keep a transcript, and let each student read in their own language.'
              : 'Join the same live class as everyone else — with teacher video, live multilingual captions and a synchronized ISL avatar.'}
          </p>

          <div className="mt-8 grid gap-3">
            {(isTeacher
              ? [
                  { icon: Users, title: 'One roster, one room', body: 'Share a join code; enrolled students appear in the live classroom.' },
                  { icon: Captions, title: 'Captions that persist', body: 'Every final caption becomes part of the lecture transcript.' },
                  { icon: Hand, title: 'Signs with a boundary', body: 'Verified lexicon only. Unmapped words become word cards.' },
                ]
              : [
                  { icon: Hand, title: 'Deaf mode, instantly', body: 'Captions and the 3D ISL avatar without reloading the lesson.' },
                  { icon: Captions, title: 'Your caption language', body: 'Choose from twelve languages and keep the original line visible.' },
                  { icon: Users, title: 'Same class as peers', body: 'Real teacher video over WebRTC — not a separate recording.' },
                ]
            ).map((item) => (
              <div key={item.title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
                  <item.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-white">{item.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-white/45">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-between text-[11px] text-white/35">
          <span>SignBridge · Inclusive learning platform</span>
          <span>ISL starter lexicon</span>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-2 px-5 py-5 sm:gap-4 sm:px-8">
          <div className="lg:hidden">
            <Logo className="auth-mobile-logo" />
          </div>
          <Link to="/" className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 text-[11px] font-semibold text-ink-500 transition hover:text-ink-800 dark:text-ink-400 dark:hover:text-white sm:gap-1.5 sm:text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to home
          </Link>
          <ThemeToggle className="shrink-0" />
        </header>

        <main className="flex flex-1 items-center justify-center px-5 pb-12 sm:px-8">
          <div className="w-full max-w-[30rem]">{children}</div>
        </main>

        <footer className="px-5 pb-6 text-center text-[11px] text-ink-400 dark:text-ink-500 sm:px-8">
          {isTeacher ? 'Teacher accounts can create classrooms and go live.' : 'Student accounts can join classes with a join code.'}
        </footer>
      </div>
    </div>
  )
}
