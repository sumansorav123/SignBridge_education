import { Link } from 'react-router-dom'
import { Clock, FileText, Play, Radio } from 'lucide-react'
import { Badge } from '@/components/ui/Misc'
import { formatDateTime, formatDuration, formatMs } from '@/lib/format'

export function LectureRow({ lecture, role = 'student' }) {
  const live = lecture.status === 'live'
  const target = role === 'teacher' ? `/teacher/classrooms/${lecture.classroom_id}` : `/student/classrooms/${lecture.classroom_id}`
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink-200/70 bg-white/60 p-3.5 transition hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/50">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${live ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'}`}>
        {live ? <Radio className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{lecture.title}</p>
        <p className="mt-0.5 text-[11px] text-ink-400">
          {formatDateTime(lecture.started_at)} · {live ? 'In progress' : formatDuration(lecture.duration_seconds, { compact: true })} · {lecture.subtitle_count} captions
        </p>
      </div>
      <div className="flex items-center gap-2">
        {live ? <Badge tone="rose" dot>live</Badge> : <Badge tone={lecture.status === 'completed' ? 'green' : 'slate'}>{lecture.status}</Badge>}
        <Link to={target} className="btn-quiet px-2 py-1.5 text-xs">Open</Link>
      </div>
    </div>
  )
}

export function RecordingRow({ recording, onPlay, role = 'student' }) {
  const duration = recording.duration_seconds ? formatDuration(recording.duration_seconds) : '—'
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink-200/70 bg-white/60 p-3.5 transition hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/50">
      <button
        type="button"
        onClick={() => onPlay?.(recording)}
        className="relative flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-950 text-white"
        aria-label={`Play ${recording.title}`}
      >
        <span className="absolute inset-0 bg-gradient-to-br from-brand-500/30 to-violet-500/20" />
        <Play className="relative h-4 w-4 fill-current" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{recording.title}</p>
        <p className="mt-0.5 text-[11px] text-ink-400">
          {formatDateTime(recording.recorded_at)} · {duration} · {recording.subtitle_count} caption lines
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden chip sm:inline-flex"><FileText className="h-3 w-3" /> Transcript</span>
        <Link to={role === 'teacher' ? `/teacher/recordings/${recording.id}` : `/student/recordings/${recording.id}`} className="btn-ghost px-3 py-1.5 text-xs">
          Open
        </Link>
      </div>
    </div>
  )
}

export function TranscriptRow({ subtitle, highlight = -1 }) {
  return (
    <div className="flex gap-3 rounded-xl px-2 py-2 transition hover:bg-ink-50 dark:hover:bg-ink-900/60">
      <span className="mt-0.5 w-11 shrink-0 font-mono text-[10px] text-ink-400">{formatMs(subtitle.start_ms)}</span>
      <div className="min-w-0">
        <p className={`text-sm leading-relaxed ${subtitle.sequence === highlight ? 'font-semibold text-brand-800 dark:text-brand-200' : ''}`}>{subtitle.text}</p>
        {subtitle.translations && Object.keys(subtitle.translations).length ? (
          <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{Object.values(subtitle.translations).join(' ')}</p>
        ) : null}
      </div>
    </div>
  )
}
