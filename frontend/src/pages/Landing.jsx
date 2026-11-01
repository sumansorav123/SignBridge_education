import { Link } from 'react-router-dom'
import {
  Accessibility,
  ArrowRight,
  BookOpenCheck,
  Captions,
  CheckCircle2,
  Clapperboard,
  Globe2,
  Hand,
  Languages,
  MonitorPlay,
  Play,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  Volume2,
  Waves,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/Misc'
import { LANGUAGES } from '@/lib/languages'

const FEATURES = [
  {
    icon: Video,
    title: 'One shared live classroom',
    body: 'Real WebRTC teacher video reaches every enrolled student — deaf and hearing learners stay in the same room, not parallel tools.',
    tone: 'brand',
  },
  {
    icon: Languages,
    title: 'Captions in 12 languages',
    body: 'The teacher speaks once. Each student reads the caption in their chosen language, with the original line available on demand.',
    tone: 'violet',
  },
  {
    icon: Hand,
    title: 'Synchronized ISL avatar',
    body: 'Phrase-level gloss mapping drives a 3D avatar using a curated Indian Sign Language lexicon — never invented gestures.',
    tone: 'brand',
  },
  {
    icon: Clapperboard,
    title: 'Recordings with transcripts',
    body: 'Capture the lesson, store its transcript, and let students replay with translated captions and sign glosses later.',
    tone: 'violet',
  },
  {
    icon: Accessibility,
    title: 'Personal accessibility',
    body: 'Deaf mode, font size, caption colours, high contrast, reduced motion and avatar visibility persist to each student profile.',
    tone: 'brand',
  },
  {
    icon: ShieldCheck,
    title: 'Role-aware by default',
    body: 'Separate teacher and student sign-in, signed playback tokens, file validation and scoped classroom access on every request.',
    tone: 'violet',
  },
]

const STEPS = [
  {
    number: '01',
    title: 'The teacher starts a class',
    body: 'Open a classroom, share the join code, and go live. The browser captures the camera and microphone — no plugin required.',
    icon: MonitorPlay,
  },
  {
    number: '02',
    title: 'Speech becomes accessible text',
    body: 'Browser speech recognition streams captions to the teacher. Final captions are translated for each student and mapped to sign glosses.',
    icon: Captions,
  },
  {
    number: '03',
    title: 'Every learner chooses their view',
    body: 'Hearing mode shows video with optional captions. Deaf mode pins captions and the 3D ISL avatar beside the teacher, instantly.',
    icon: Hand,
  },
]

function HeroPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-brand-400/25 via-transparent to-violet-500/25 blur-2xl" />
      <div className="overflow-hidden rounded-[1.8rem] border border-white/10 bg-ink-950 shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/90" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" /> Live · Grade 10 Science
          </div>
          <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/70">SCI10A</span>
        </div>

        <div className="grid gap-3 p-3 sm:grid-cols-[1.5fr_1fr]">
          <div className="relative min-h-[230px] overflow-hidden rounded-2xl bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950 p-4">
            <div className="absolute inset-0 bg-grid opacity-40" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-black/30 px-2.5 py-1 text-[10px] font-semibold text-white/70 backdrop-blur">Teacher video · WebRTC</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/70"><Volume2 className="h-3.5 w-3.5" /></span>
              </div>
              <div className="relative mx-auto my-2 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-violet-600 shadow-glow">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-ink-950/80 text-2xl font-bold text-white/90">MS</div>
                <span className="absolute inset-0 animate-pulse-ring rounded-full border border-brand-300/40" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-300">Meera Sharma</p>
                <p className="mt-1 max-w-[26rem] rounded-xl bg-black/45 px-3 py-2 text-xs leading-relaxed text-white shadow-lg backdrop-blur">
                  Plants use sunlight, water and carbon dioxide to make glucose and oxygen.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="relative flex-1 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-violet-500/20 via-ink-900 to-ink-950 p-3">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-violet-200">ISL avatar</span>
                <Sparkles className="h-3.5 w-3.5 text-violet-300" />
              </div>
              <div className="mt-3 flex flex-col items-center">
                <div className="relative h-24 w-16">
                  <div className="absolute left-1/2 top-0 h-9 w-9 -translate-x-1/2 rounded-full bg-gradient-to-br from-brand-200 to-brand-400" />
                  <div className="absolute left-1/2 top-8 h-11 w-10 -translate-x-1/2 rounded-2xl bg-gradient-to-b from-violet-400 to-violet-700" />
                  <div className="absolute left-0 top-9 h-2 w-7 rotate-[-18deg] rounded-full bg-brand-300" />
                  <div className="absolute right-0 top-6 h-2 w-8 rotate-[32deg] rounded-full bg-brand-300" />
                  <div className="absolute left-2 top-[74px] h-8 w-2.5 rounded-full bg-ink-700" />
                  <div className="absolute right-2 top-[74px] h-8 w-2.5 rounded-full bg-ink-700" />
                </div>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {['PLANT', 'SUNLIGHT', 'WATER', 'GLUCOSE'].map((gloss) => (
                    <span key={gloss} className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-wide text-violet-100">{gloss}</span>
                  ))}
                </div>
              </div>
              <div className="absolute bottom-2.5 left-3 right-3 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[9px] text-white/60">
                Signed from a verified gloss sequence
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">
                <span>Live captions</span>
                <span className="flex items-center gap-1 text-brand-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-300" /> auto</span>
              </div>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-white">தாவரங்கள் சூரிய ஒளி, நீர் மற்றும் கார்பன் டை ஆக்சைடைப் பயன்படுத்துகின்றன.</p>
              <p className="mt-1.5 text-[10px] text-white/45">Original: Plants use sunlight, water and carbon dioxide.</p>
              <div className="mt-2.5 flex items-center gap-1.5">
                <span className="rounded bg-brand-400/15 px-1.5 py-0.5 text-[9px] font-semibold text-brand-200">Tamil</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-white/60">Google</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-5 -left-4 hidden items-center gap-2.5 rounded-2xl border border-white/60 bg-white/90 px-3.5 py-2.5 shadow-soft backdrop-blur dark:border-white/10 dark:bg-ink-900/90 sm:flex">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600"><CheckCircle2 className="h-4 w-4" /></span>
        <div>
          <p className="text-[11px] font-bold">Deaf mode on</p>
          <p className="text-[10px] text-ink-500 dark:text-ink-400">Avatar + captions pinned</p>
        </div>
      </div>
      <div className="absolute -right-4 -top-5 hidden items-center gap-2.5 rounded-2xl border border-white/60 bg-white/90 px-3.5 py-2.5 shadow-soft backdrop-blur dark:border-white/10 dark:bg-ink-900/90 sm:flex">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Waves className="h-4 w-4" /></span>
        <div>
          <p className="text-[11px] font-bold">Live translation</p>
          <p className="text-[10px] text-ink-500 dark:text-ink-400">12 subtitle languages</p>
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="overflow-hidden">
      <section className="relative pb-24 pt-16 sm:pt-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[780px] bg-grid opacity-50 mask-fade-bottom" />
        <div className="pointer-events-none absolute left-1/2 top-[-12rem] -z-10 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-brand-400/15 blur-[100px]" />
        <div className="container-page grid items-center gap-16 lg:grid-cols-[1fr_1.08fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50/80 px-3.5 py-1.5 text-xs font-semibold text-brand-800 dark:border-brand-800/60 dark:bg-brand-950/50 dark:text-brand-200">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" /></span>
              Inclusive by design · ISL avatar + 12 caption languages
            </div>
            <h1 className="display-title mt-6 text-balance">
              One classroom.
              <br />
              <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-violet-600 bg-clip-text text-transparent dark:from-brand-300 dark:via-brand-200 dark:to-violet-300">
                Every learner.
              </span>
              <br />
              Nothing lost.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-600 dark:text-ink-300 sm:text-lg">
              SignBridge brings deaf and hearing students into the same live lesson — with real teacher
              video, real-time captions in twelve languages, and a synchronized 3D Indian Sign Language
              avatar that never guesses.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button as={Link} to="/login/teacher" variant="brand" size="lg" icon={Play}>
                Start a live class
              </Button>
              <Button as={Link} to="/login/student" variant="ghost" size="lg" icon={ArrowRight}>
                Join as a student
              </Button>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-ink-500 dark:text-ink-400">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> No setup database for dev</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> WebRTC media</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Provider fallbacks</span>
            </div>

            <div className="mt-10 rounded-2xl border border-ink-200/70 bg-white/60 p-4 backdrop-blur dark:border-ink-800 dark:bg-ink-900/50">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">
                <Sparkles className="h-3 w-3 text-violet-500" /> Explore the seeded demo
              </div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div className="rounded-xl bg-ink-50 p-2.5 dark:bg-ink-950/60">
                  <p className="font-semibold">Teacher</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-500 dark:text-ink-400">teacher@signbridge.app</p>
                </div>
                <div className="rounded-xl bg-ink-50 p-2.5 dark:bg-ink-950/60">
                  <p className="font-semibold">Deaf student</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-500 dark:text-ink-400">aarav.deaf@signbridge.app</p>
                </div>
              </div>
              <p className="mt-2.5 text-[11px] text-ink-500 dark:text-ink-400">
                Password <span className="font-mono font-semibold text-ink-700 dark:text-ink-200">Learn@12345</span> · Join code <span className="font-mono font-semibold text-ink-700 dark:text-ink-200">SCI10A</span>
              </p>
            </div>
          </div>

          <div className="lg:pl-4">
            <HeroPreview />
          </div>
        </div>
      </section>

      <section className="border-y border-ink-200/60 bg-white/45 py-6 dark:border-ink-800/60 dark:bg-ink-900/30">
        <div className="container-page flex flex-wrap items-center justify-between gap-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
          <span>Built with</span>
          <span className="text-ink-500 dark:text-ink-400">FastAPI</span>
          <span className="text-ink-500 dark:text-ink-400">React</span>
          <span className="text-ink-500 dark:text-ink-400">WebRTC</span>
          <span className="text-ink-500 dark:text-ink-400">Web Speech</span>
          <span className="text-ink-500 dark:text-ink-400">Three.js</span>
          <span className="text-ink-500 dark:text-ink-400">MediaPipe</span>
          <span className="text-ink-500 dark:text-ink-400">MySQL · SQLite</span>
        </div>
      </section>

      <section className="py-24">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="section-eyebrow">The problem is not the student</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              A deaf learner should not have to choose between the lesson and the language.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-500 dark:text-ink-400">
              Live lessons carry tone, pacing and explanation in sound. Captions help — but they are
              often delayed, English-only, or detached from the teacher's video. Sign language is
              usually elsewhere. SignBridge puts all three in one synchronized view.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { icon: Captions, title: 'Captions that arrive with the lesson', body: 'Final captions are persisted per lecture with translations, so replay and review work from the same transcript.' },
              { icon: Hand, title: 'Signs that are accountable', body: 'Only verified lexicon entries are animated. Unmapped words become an explicit word card, never a fabricated gesture.' },
              { icon: Users, title: 'One room, two experiences', body: 'Deaf mode and hearing mode are preferences — not separate classes. Toggle instantly without reloading the live room.' },
            ].map((item) => (
              <div key={item.title} className="card p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-700 dark:text-brand-300">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-ink-950 py-24 text-white">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
        <div className="pointer-events-none absolute -right-20 top-0 h-[28rem] w-[28rem] rounded-full bg-violet-600/20 blur-[100px]" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-[28rem] w-[28rem] rounded-full bg-brand-500/20 blur-[100px]" />
        <div className="container-page relative">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand-300">What is inside</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Functional from the first classroom, not a walkthrough.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-white/60">
                Every control below is wired to the API. External services are optional — and when a
                provider is unavailable, SignBridge says so instead of inventing a result.
              </p>
            </div>
            <Button as={Link} to="/features" variant="brand" className="shrink-0">
              Explore all features <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="group rounded-3xl border border-white/10 bg-white/[0.04] p-6 transition hover:border-white/20 hover:bg-white/[0.07]">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${feature.tone === 'violet' ? 'bg-violet-500/15 text-violet-300' : 'bg-brand-500/15 text-brand-300'}`}>
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="container-page grid items-center gap-14 lg:grid-cols-2">
          <div>
            <p className="section-eyebrow">How a lesson flows</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">From spoken word to signed sentence.</h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-500 dark:text-ink-400">
              SignBridge is a pipeline, not a mock-up. The teacher's browser captures speech, the API
              persists the caption, translation providers fill each student's language, and the sign
              engine maps the text into glosses with explicit grammar rules.
            </p>
            <div className="mt-8 space-y-4">
              {STEPS.map((step, index) => (
                <div key={step.number} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink-950 text-white dark:bg-white dark:text-ink-950">
                      <step.icon className="h-5 w-5" />
                    </span>
                    {index < STEPS.length - 1 ? <span className="mt-2 h-full w-px bg-ink-200 dark:bg-ink-800" /> : null}
                  </div>
                  <div className="pb-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">Step {step.number}</p>
                    <h3 className="mt-1 text-base font-semibold">{step.title}</h3>
                    <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-500 dark:text-ink-400">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-5 -z-10 rounded-[2.5rem] bg-gradient-to-br from-brand-400/15 to-violet-500/15 blur-2xl" />
            <div className="card overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-ink-200/70 px-5 py-4 dark:border-ink-800">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-300"><Languages className="h-4 w-4" /></span>
                  <div>
                    <p className="text-sm font-semibold">Caption pipeline</p>
                    <p className="text-[11px] text-ink-400">Live · lecture #42</p>
                  </div>
                </div>
                <Badge tone="green" dot>live</Badge>
              </div>
              <div className="space-y-3 p-5">
                <div className="rounded-2xl border border-ink-200/70 bg-ink-50/60 p-3.5 dark:border-ink-800 dark:bg-ink-950/50">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Source · English</p>
                  <p className="mt-1.5 text-sm font-medium">“Chlorophyll captures the light energy that the plant needs.”</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ['Tamil', 'இலைகளில் உள்ள பச்சையம் ஒளி ஆற்றலைப் பிடிக்கிறது.'],
                    ['Hindi', 'क्लोरोफिल प्रकाश ऊर्जा को पकड़ता है।'],
                    ['Malayalam', 'ക്ലോറോഫിൽ പ്രകാശോർജ്ജം പിടിച്ചെടുക്കുന്നു.'],
                    ['Spanish', 'La clorofila captura la energía luminosa.'],
                  ].map(([label, text]) => (
                    <div key={label} className="rounded-xl border border-ink-200/60 bg-white/70 p-2.5 dark:border-ink-800 dark:bg-ink-900/50">
                      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">{label}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-ink-600 dark:text-ink-300">{text}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-violet-200/70 bg-violet-50/60 p-3.5 dark:border-violet-900/60 dark:bg-violet-950/30">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">ISL gloss sequence</p>
                    <span className="text-[10px] font-semibold text-violet-500">4 of 5 verified</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {['CHLOROPHYLL', 'LIGHT', 'ENERGY', 'PLANT', 'NEED'].map((gloss) => (
                      <span key={gloss} className="rounded-lg border border-violet-200 bg-white px-2 py-1 font-mono text-[10px] font-semibold text-violet-700 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-200">{gloss}</span>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-violet-600/80 dark:text-violet-300/70">
                    Function words removed · time-first · wh-final. No verified sign for “chlorophyll” → word card.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-ink-200/60 bg-white/50 py-16 dark:border-ink-800/60 dark:bg-ink-900/40">
        <div className="container-page">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="section-eyebrow">Read in your language</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">Twelve subtitle languages, one live source.</h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-ink-500 dark:text-ink-400">
              Each student picks a caption language in their profile. The teacher speaks once and the
              API delivers personalized captions per connection.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            {LANGUAGES.map((language) => (
              <span key={language.code} className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3.5 py-2 text-sm shadow-sm dark:border-ink-700 dark:bg-ink-900">
                <Globe2 className="h-3.5 w-3.5 text-brand-500" />
                <span className="font-medium">{language.name}</span>
                <span className="text-ink-400">{language.native}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="container-page">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-ink-950 via-ink-900 to-brand-950 p-8 text-white shadow-2xl sm:p-12">
            <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-violet-500/25 blur-3xl" />
            <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">
                  <BookOpenCheck className="h-3.5 w-3.5" /> Ready for a real lesson
                </div>
                <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">Open one room. Teach everyone.</h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60 sm:text-base">
                  Use the seeded demo, or register a new teacher and student account. Everything is
                  connected — classrooms, live captions, recordings, transcripts and accessibility preferences.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Button as={Link} to="/register/teacher" variant="brand" size="lg" className="justify-between">
                  Create a teacher account <ArrowRight className="h-4 w-4" />
                </Button>
                <Button as={Link} to="/register/student" variant="ghost" size="lg" className="justify-between border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                  Create a student account <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
