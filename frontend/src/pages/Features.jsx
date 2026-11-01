import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Accessibility,
  Captions,
  Check,
  CheckCircle2,
  Clapperboard,
  Globe2,
  Hand,
  Languages,
  Mic,
  MonitorPlay,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Video,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/Misc'
import { LANGUAGES } from '@/lib/languages'

const GROUPS = [
  {
    icon: Video,
    eyebrow: 'Live classroom',
    title: 'Teach once, reach every student in the room.',
    body: 'A real WebRTC peer connection carries teacher video and audio to each enrolled student. The classroom WebSocket handles presence, caption delivery, preference updates and signaling.',
    points: ['Real camera and microphone via getUserMedia', 'Per-student WebRTC offers with ICE relay over the socket', 'Live participant presence and media state', 'Teacher offline recovery banner and reconnect'],
  },
  {
    icon: Languages,
    eyebrow: 'Multilingual captions',
    title: 'Twelve ways to read the same sentence.',
    body: 'Speech is captured in the teacher browser. Partial captions appear immediately in the source language; final captions are persisted and translated only for the languages students actually selected.',
    points: ['Browser Web Speech API with manual caption fallback', 'Provider chain: DeepL → Google → LibreTranslate → MyMemory', 'Original text toggle for bilingual learners', 'Honest untranslated state when no provider is configured'],
  },
  {
    icon: Hand,
    eyebrow: 'ISL avatar',
    title: 'A signed view that knows what it does not know.',
    body: 'Captions are converted into sign glosses with phrase lookup, function-word removal, time-fronting and wh-final ordering. A procedural Three.js humanoid animates verified entries — and shows word cards for everything else.',
    points: ['100-entry curated ISL starter lexicon', 'Per-gloss handshape, location, movement, palm and facial cues', 'Queued, replayable animation with adjustable speed', 'Clear fallback cards for unmapped words', 'GLB loader ready for a professionally produced avatar'],
  },
  {
    icon: Clapperboard,
    eyebrow: 'Recordings',
    title: 'Replay the lesson, not just the video.',
    body: 'Teachers can record with MediaRecorder, upload the file, and keep the lecture transcript attached. Students replay with translated transcripts and the same signed guidance.',
    points: ['Start, pause, resume and stop in the browser', 'Signed, expiring playback tokens', 'Transcript translation up to twelve languages', 'Download and delete controls scoped by role'],
  },
  {
    icon: Accessibility,
    eyebrow: 'Accessibility',
    title: 'Preferences that follow the learner.',
    body: 'Learning mode, caption language, font size, colours, contrast, avatar visibility and reduced motion are stored in MySQL/SQLite — not just local state — and applied instantly in the live room.',
    points: ['Normal ↔ deaf mode without a page reload', 'Caption text and background colours', 'High-contrast and reduced-motion options', 'Keyboard focus rings and labelled controls', 'Theme: light, dark or system'],
  },
  {
    icon: ShieldCheck,
    eyebrow: 'Security & data',
    title: 'The right people in the right room.',
    body: 'Separate teacher and student registration, role-checked endpoints, bcrypt password hashing, JWT access and refresh tokens, and validated file uploads.',
    points: ['Access tokens (30 min) and refresh tokens (14 days)', 'Token-version invalidation on sign-out', 'Enrollment-scoped classroom and recording access', 'Extension, size and signature checks on uploads', 'Environment-driven secrets and CORS'],
  },
]

const COMPARISON = [
  { feature: 'Live teacher video', teacher: true, student: true },
  { feature: 'Multilingual captions', teacher: true, student: true },
  { feature: '3D ISL avatar', teacher: false, student: true },
  { feature: 'Create classrooms & join codes', teacher: true, student: false },
  { feature: 'Start / stop lectures', teacher: true, student: false },
  { feature: 'Record and upload lessons', teacher: true, student: false },
  { feature: 'Replay recordings with transcript', teacher: true, student: true },
  { feature: 'Persist deaf-mode preferences', teacher: false, student: true },
  { feature: 'Upload learning materials', teacher: true, student: false },
  { feature: 'Download learning materials', teacher: true, student: true },
]

export default function Features() {
  return (
    <div>
      <section className="relative pb-16 pt-20">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem] bg-grid opacity-40 mask-fade-bottom" />
        <div className="container-page max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3.5 py-1.5 text-xs font-semibold text-violet-800 dark:border-violet-800/60 dark:bg-violet-950/50 dark:text-violet-200">
            <Sparkles className="h-3.5 w-3.5" /> Feature detail
          </div>
          <h1 className="display-title mt-5">Everything needed for one inclusive live lesson.</h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-600 dark:text-ink-300">
            SignBridge combines video, captions, translation, sign language and accessibility into a
            single classroom — with real endpoints behind every control.
          </p>
        </div>
      </section>

      <section className="pb-20">
        <div className="container-page space-y-6">
          {GROUPS.map((group, index) => (
            <div key={group.title} className="card overflow-hidden">
              <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
                <div className={`p-7 sm:p-9 ${index % 2 === 1 ? 'lg:order-2' : ''}`}>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
                    <group.icon className="h-3.5 w-3.5" /> {group.eyebrow}
                  </div>
                  <h2 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">{group.title}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{group.body}</p>
                  <ul className="mt-5 space-y-2.5">
                    {group.points.map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm text-ink-600 dark:text-ink-300">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`relative flex items-center justify-center overflow-hidden border-t border-ink-200/60 bg-gradient-to-br from-brand-500/5 via-transparent to-violet-500/10 p-8 dark:border-ink-800 lg:border-l lg:border-t-0 ${index % 2 === 1 ? 'lg:order-1 lg:border-l-0 lg:border-r' : ''}`}>
                  <FeatureVisual index={index} icon={group.icon} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-ink-200/60 bg-white/50 py-20 dark:border-ink-800/60 dark:bg-ink-900/40">
        <div className="container-page grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="section-eyebrow">Role capabilities</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Teacher and student, deliberately different.</h2>
            <p className="mt-4 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
              Teacher and student accounts are separate portals with role-checked API access. Shared
              classrooms keep both roles in the same live lesson.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {LANGUAGES.slice(0, 6).map((language) => (
                <span key={language.code} className="chip">{language.name}</span>
              ))}
              <span className="chip">+6 more</span>
            </div>
          </div>
          <div className="table-shell bg-white/80 dark:bg-ink-950/40">
            <table className="table">
              <thead>
                <tr>
                  <th>Capability</th>
                  <th className="text-center">Teacher</th>
                  <th className="text-center">Student</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.feature}>
                    <td className="font-medium">{row.feature}</td>
                    <td className="text-center">{row.teacher ? <Check className="mx-auto h-4 w-4 text-emerald-500" /> : <span className="text-ink-300 dark:text-ink-600">—</span>}</td>
                    <td className="text-center">{row.student ? <Check className="mx-auto h-4 w-4 text-emerald-500" /> : <span className="text-ink-300 dark:text-ink-600">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="section-eyebrow">Under the hood</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Optional services, honest fallbacks.</h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { icon: Mic, title: 'Speech recognition', body: 'Browser Web Speech API by default. Optional OpenAI Whisper or local faster-whisper for server transcription when configured.' },
              { icon: Globe2, title: 'Translation', body: 'A four-provider chain with per-caption caching. If no provider is reachable, the original text is shown with a clear untranslated flag.' },
              { icon: Upload, title: 'Storage', body: 'Recordings and materials are validated and stored on disk with scoped downloads. Playback uses short-lived signed URLs instead of public files.' },
            ].map((item) => (
              <div key={item.title} className="card p-6">
                <item.icon className="h-5 w-5 text-brand-600 dark:text-brand-300" />
                <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="container-page">
          <div className="relative overflow-hidden rounded-[2rem] bg-ink-950 p-8 text-white sm:p-12">
            <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
            <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div>
                <Badge tone="brand" className="border-brand-500/30 bg-brand-500/10 text-brand-200">Ready when you are</Badge>
                <h2 className="mt-4 font-display text-3xl font-bold tracking-tight">Try the complete flow.</h2>
                <p className="mt-2 text-sm text-white/60">Sign in with the seeded accounts, start a live lecture, and watch captions and signs arrive.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button as={Link} to="/login/teacher" variant="brand" icon={MonitorPlay}>Teacher sign in</Button>
                <Button as={Link} to="/login/student" variant="ghost" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" icon={Users}>Student sign in</Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function FeatureVisual({ index, icon: Icon }) {
  if (index === 0) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-ink-200/70 bg-ink-950 p-4 shadow-xl dark:border-ink-800">
        <div className="flex items-center justify-between">
          <Badge tone="rose" dot>live</Badge>
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/40">4 participants</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="col-span-2 flex h-24 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/30 to-violet-500/20">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">MS</span>
          </div>
          {['AP', 'PN', 'RS'].map((initials) => (
            <div key={initials} className="flex h-12 items-center justify-center rounded-lg bg-white/5 text-[10px] font-bold text-white/50">{initials}</div>
          ))}
          <div className="flex h-12 items-center justify-center rounded-lg border border-dashed border-white/15 text-[10px] text-white/30">+1</div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[9px] text-white/40"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> WebRTC connected</div>
      </div>
    )
  }
  if (index === 1) {
    return (
      <div className="w-full max-w-sm space-y-2">
        <div className="rounded-xl border border-ink-200/70 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-400">English · source</p>
          <p className="mt-1 text-xs font-medium">Water travels from the roots to the leaves.</p>
        </div>
        {[['Hindi', 'पानी जड़ों से पत्तियों तक जाता है।'], ['Tamil', 'நீர் வேர்களிலிருந்து இலைகளுக்கு செல்கிறது.'], ['Malayalam', 'വെള്ളം വേരുകളിൽ നിന്ന് ഇലകളിലേക്ക് പോകുന്നു.']].map(([language, text]) => (
          <div key={language} className="rounded-xl border border-ink-200/70 bg-white/70 p-3 dark:border-ink-800 dark:bg-ink-900/60">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">{language}</p>
            <p className="mt-1 text-[11px] leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
    )
  }
  if (index === 2) {
    return (
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-violet-200/70 bg-gradient-to-b from-violet-50 to-white p-5 dark:border-violet-900/60 dark:from-violet-950/40 dark:to-ink-900">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">ISL · verified sequence</span>
            <Hand className="h-4 w-4 text-violet-500" />
          </div>
          <div className="mt-5 flex items-end justify-center gap-1.5">
            {['WATER', 'ROOT', 'LEAF', 'GO'].map((gloss, i) => (
              <div key={gloss} className="flex flex-col items-center gap-1.5">
                <div className={`flex h-14 w-12 items-end justify-center rounded-xl border ${i === 2 ? 'border-violet-400 bg-violet-500/15' : 'border-ink-200/70 bg-white/60 dark:border-ink-700 dark:bg-ink-900/40'}`}>
                  <span className="mb-2 h-1.5 w-6 rounded-full bg-gradient-to-r from-brand-400 to-violet-500" />
                </div>
                <span className="font-mono text-[8px] font-semibold text-ink-500 dark:text-ink-400">{gloss}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-white/70 p-2.5 text-[10px] leading-relaxed text-ink-500 dark:bg-ink-950/40 dark:text-ink-400">
            Word card for <span className="font-semibold text-amber-600 dark:text-amber-300">“chlorophyll”</span> — no verified sign, so no gesture is invented.
          </div>
        </div>
      </div>
    )
  }
  if (index === 3) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-ink-200/70 bg-ink-950 p-4 dark:border-ink-800">
        <div className="flex aspect-video items-center justify-center rounded-xl bg-gradient-to-br from-ink-800 to-ink-950">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10"><Clapperboard className="h-5 w-5 text-white/60" /></span>
        </div>
        <div className="mt-3 flex items-center justify-between text-[10px] text-white/40">
          <span>Photosynthesis · 22m</span>
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-300">ready</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-2/3 rounded-full bg-brand-400" /></div>
        <p className="mt-2.5 line-clamp-2 text-[10px] leading-relaxed text-white/50">Plants use sunlight, water and carbon dioxide to make glucose and oxygen.</p>
      </div>
    )
  }
  if (index === 4) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-ink-200/70 bg-white p-4 shadow-lg dark:border-ink-800 dark:bg-ink-900">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-400">Captions</span>
          <span className="text-[9px] font-semibold text-brand-600 dark:text-brand-300">Deaf mode</span>
        </div>
        <div className="mt-3 rounded-xl bg-ink-950 p-3">
          <p className="text-xs font-semibold leading-relaxed text-white">The green substance in the leaves is called chlorophyll.</p>
          <p className="mt-1 text-[9px] text-white/40">Original · English</p>
        </div>
        <div className="mt-3 space-y-2 text-[10px]">
          <div className="flex items-center justify-between"><span className="text-ink-500">Font size</span><span className="font-mono font-semibold">30 px</span></div>
          <div className="h-1.5 rounded-full bg-ink-200 dark:bg-ink-800"><div className="h-full w-3/4 rounded-full bg-brand-500" /></div>
          <div className="flex items-center justify-between pt-1"><span className="text-ink-500">High contrast</span><span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-600 dark:text-emerald-300">On</span></div>
          <div className="flex items-center justify-between"><span className="text-ink-500">Reduced motion</span><span className="rounded bg-ink-100 px-1.5 py-0.5 text-ink-500 dark:bg-ink-800">Off</span></div>
        </div>
      </div>
    )
  }
  return (
    <div className="w-full max-w-sm rounded-2xl border border-ink-200/70 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" /> Access check passed</div>
      <div className="mt-4 space-y-2 font-mono text-[10px]">
        {[
          ['GET', '/api/student/classrooms', '200'],
          ['WS', '/ws/classroom/1', '101'],
          ['POST', '/api/recordings/8/playback-token', '200'],
          ['GET', '/api/recordings/8/stream?token=…', '200'],
        ].map(([method, path, status]) => (
          <div key={path} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50 px-2.5 py-1.5 dark:bg-ink-950/50">
            <span className="font-bold text-brand-600 dark:text-brand-300">{method}</span>
            <span className="min-w-0 flex-1 truncate text-ink-500 dark:text-ink-400">{path}</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-300">{status}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[9px] leading-relaxed text-ink-400">Role-scoped checks run on the API for every request — not just in the UI.</p>
    </div>
  )
}
