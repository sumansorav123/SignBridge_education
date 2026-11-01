import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpenCheck,
  Code2,
  Database,
  Hand,
  HeartHandshake,
  Languages,
  Layers3,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import Button from '@/components/ui/Button'

const PRINCIPLES = [
  {
    icon: HeartHandshake,
    title: 'Inclusion is the architecture',
    body: 'Deaf mode is not an add-on screen. It is a persisted student preference that changes the same live classroom layout immediately, without a reload or a separate class link.',
  },
  {
    icon: Hand,
    title: 'Honest sign language',
    body: 'Animations come from a curated ISL starter lexicon. If a word has no verified sign, SignBridge displays a word card. Generating a plausible-looking gesture would be worse than showing none.',
  },
  {
    icon: Languages,
    title: 'Language is personal',
    body: 'Students read captions in one of twelve languages while the teacher speaks once. The original line can stay visible for bilingual learners.',
  },
  {
    icon: ShieldCheck,
    title: 'Access is enforced, not implied',
    body: 'Separate roles, short-lived playback tokens, scoped classroom checks and file validation keep recordings and rosters in the right hands.',
  },
]

const STACK = [
  { icon: Layers3, label: 'Frontend', value: 'React 19 · Vite · Tailwind · React Router · Axios · Lucide' },
  { icon: Code2, label: 'Backend', value: 'FastAPI · SQLAlchemy 2 · Pydantic · JWT · WebSockets' },
  { icon: Database, label: 'Data', value: 'MySQL in production · SQLite for zero-setup development · Alembic migrations' },
  { icon: Sparkles, label: 'Media & AI', value: 'WebRTC · Web Speech API · optional Whisper · Three.js · MediaPipe' },
]

export default function About() {
  return (
    <div>
      <section className="relative pb-20 pt-20">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-grid opacity-40 mask-fade-bottom" />
        <div className="container-page">
          <div className="max-w-3xl">
            <p className="section-eyebrow">About SignBridge</p>
            <h1 className="display-title mt-4 text-balance">
              An inclusive classroom should not require a second classroom.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-600 dark:text-ink-300">
              SignBridge is a full-stack learning platform built around one belief: a deaf student
              should be able to attend the same live lesson as their hearing peers — with the same
              teacher, the same timing and the same explanations — without being routed to a separate
              tool or a delayed transcript.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              { label: 'One live room', value: 'Teacher video + captions + avatar' },
              { label: 'Twelve languages', value: 'Personal caption language per student' },
              { label: '100 curated signs', value: 'ISL starter lexicon, fallback by design' },
            ].map((item) => (
              <div key={item.label} className="card p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">{item.label}</p>
                <p className="mt-2 font-display text-xl font-semibold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-ink-200/60 bg-white/50 py-20 dark:border-ink-800/60 dark:bg-ink-900/40">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="section-eyebrow">Design principles</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">What we optimized for.</h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {PRINCIPLES.map((principle) => (
              <div key={principle.title} className="card p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-700 dark:text-brand-300">
                  <principle.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{principle.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{principle.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container-page grid gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="section-eyebrow">How it is built</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">A working pipeline, end to end.</h2>
            <p className="mt-4 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
              The live classroom is a WebSocket hub. Presence, caption distribution, preference changes
              and WebRTC signaling all travel over the same authenticated socket. Final captions are
              stored as subtitles, translated per language, and mapped to sign glosses before delivery.
              The recording flow uses MediaRecorder in the teacher's browser and a validated upload
              endpoint, with signed playback tokens for students.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
              Translation providers are pluggable: DeepL, Google, LibreTranslate and MyMemory are tried
              in order for the automatic chain. If none is configured, the app returns the original text
              with an explicit untranslated flag. Nothing is fabricated. Browser speech recognition
              handles live captions; optional Whisper support provides server-side transcription when a
              key or local model is configured.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button as={Link} to="/features" variant="primary" icon={ArrowRight}>
                See feature detail
              </Button>
              <Button as={Link} to="/register/student" variant="ghost">
                Create a learner account
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {STACK.map((item) => (
              <div key={item.label} className="flex items-start gap-4 rounded-2xl border border-ink-200/70 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-300">
                  <item.icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">{item.label}</p>
                  <p className="mt-1 text-sm font-medium leading-relaxed">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="container-page">
          <div className="rounded-[2rem] border border-amber-200/70 bg-amber-50/70 p-8 dark:border-amber-900/50 dark:bg-amber-950/30 sm:p-10">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <BookOpenCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-xl font-bold">A responsible prototype, clearly labelled.</h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-amber-900/75 dark:text-amber-100/70">
                  The ISL lexicon is intentionally small and built from handshape–location–movement
                  descriptions. It must be reviewed by certified Indian Sign Language interpreters before
                  high-stakes classroom use. The avatar is a visual aid, not a replacement for a human
                  interpreter. Translation quality depends on the configured provider and is reported
                  honestly in the interface.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-ink-200/60 py-16 dark:border-ink-800/60">
        <div className="container-page flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-700 dark:text-brand-300"><Users className="h-5 w-5" /></span>
            <div>
              <p className="font-semibold">Bring SignBridge to a real classroom</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Start with the seeded demo, then register your own accounts.</p>
            </div>
          </div>
          <Button as={Link} to="/login/teacher" variant="brand" icon={ArrowRight}>Open the teacher portal</Button>
        </div>
      </section>
    </div>
  )
}
