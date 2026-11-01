import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Copy, Radio, Users } from 'lucide-react'
import clsx from 'clsx'
import { Badge } from '@/components/ui/Misc'
import { languageName } from '@/lib/languages'

export default function ClassroomCard({ classroom, role = 'student', onCopyCode, onStart, busy = false }) {
  const isTeacher = role === 'teacher'
  const live = classroom.is_live
  return (
    <article className={clsx('card card-hover group relative overflow-hidden p-5', live && 'border-rose-300/70 dark:border-rose-900/70')}>
      {live ? (
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-rose-500/10 blur-2xl" />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/15 to-violet-500/15 text-brand-700 dark:text-brand-300">
          <BookOpen className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-2">
          {live ? <span className="badge-live"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" /> Live</span> : <Badge tone={classroom.status === 'archived' ? 'slate' : 'green'} dot>{classroom.status || 'active'}</Badge>}
        </div>
      </div>

      <h3 className="mt-4 truncate font-display text-lg font-semibold">{classroom.name}</h3>
      <p className="mt-0.5 text-xs font-medium text-brand-700 dark:text-brand-300">{classroom.subject}</p>
      {classroom.description ? <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{classroom.description}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isTeacher ? (
          <button
            type="button"
            onClick={() => onCopyCode?.(classroom.join_code)}
            className="chip font-mono transition hover:border-brand-300 hover:text-brand-700 dark:hover:text-brand-200"
            title="Copy join code"
          >
            <Copy className="h-3 w-3" /> {classroom.join_code}
          </button>
        ) : (
          <span className="chip font-mono">Teacher: {classroom.teacher_name || '—'}</span>
        )}
        <span className="chip"><Users className="h-3 w-3" /> {classroom.student_count} {isTeacher ? 'students' : 'learners'}</span>
        <span className="chip">{languageName(classroom.source_language)}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4 dark:border-ink-800">
        <span className="min-w-0 text-[11px] text-ink-400">{classroom.lecture_count} lectures · {classroom.recording_count} recordings</span>
        <div className="flex shrink-0 items-center gap-2">
          {isTeacher ? (
            live ? (
              <Link to={`/teacher/classrooms/${classroom.id}`} className="btn-brand px-3 py-1.5 text-xs">
                Resume live <Radio className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <button type="button" onClick={() => onStart?.(classroom)} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">
                Start class <Radio className="h-3.5 w-3.5" />
              </button>
            )
          ) : live ? (
            <Link to={`/student/classrooms/${classroom.id}`} className="btn-brand px-3 py-1.5 text-xs">
              Join live <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <Link to={`/student/classrooms/${classroom.id}`} className="btn-ghost px-3 py-1.5 text-xs">
              Open <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}
