import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  CalendarDays,
  ClipboardCopy,
  Clock3,
  GraduationCap,
  Radio,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
  Video,
} from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/dashboard/StatCard'
import ActivityChart from '@/components/dashboard/ActivityChart'
import ClassroomCard from '@/components/dashboard/ClassroomCard'
import { LectureRow, RecordingRow } from '@/components/dashboard/Rows'
import JoinRequestsPanel from '@/components/classrooms/JoinRequestsPanel'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { EmptyState, FullPageLoader, Badge } from '@/components/ui/Misc'
import { Input } from '@/components/ui/Field'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import api, { errorMessage } from '@/api/client'
import { formatDate, formatDuration, greeting } from '@/lib/format'

export default function TeacherDashboard() {
  const { user } = useAuth()
  const { success, error: toastError } = useToast()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [startOpen, setStartOpen] = useState(false)
  const [startForm, setStartForm] = useState({ classroom_id: '', title: '' })
  const [starting, setStarting] = useState(false)

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const response = await api.get('/teacher/dashboard')
      setData(response.data)
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load your teaching overview.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const activeClassrooms = data?.classrooms?.filter((room) => room.status !== 'archived') || []

  function openStart(classroom) {
    setStartForm({ classroom_id: String(classroom?.id || activeClassrooms[0]?.id || ''), title: '' })
    setStartOpen(true)
  }

  async function startLecture(event) {
    event.preventDefault()
    if (!startForm.classroom_id) return
    setStarting(true)
    try {
      const { data: lecture } = await api.post('/teacher/lectures/start', {
        classroom_id: Number(startForm.classroom_id),
        title: startForm.title.trim() || null,
      })
      success('Lecture started', 'Your live classroom is ready. Allow camera and microphone access.')
      setStartOpen(false)
      navigate(`/teacher/classrooms/${lecture.classroom_id}`)
    } catch (err) {
      toastError('Could not start the lecture', errorMessage(err))
    } finally {
      setStarting(false)
    }
  }

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code)
      success('Join code copied', `Students can join with ${code}.`)
    } catch {
      toastError('Copy failed', `The join code is ${code}.`)
    }
  }

  const liveRoom = useMemo(() => activeClassrooms.find((room) => room.is_live), [activeClassrooms])

  if (loading) return <FullPageLoader label="Loading your teaching studio…" />

  if (loadError) {
    return (
      <EmptyState
        icon={Video}
        title="The teaching overview could not load"
        description={loadError}
        action={<Button onClick={load} variant="brand">Try again</Button>}
      />
    )
  }

  const stats = data?.stats || {}

  return (
    <div>
      <PageHeader
        eyebrow={`${greeting()}, ${user?.full_name?.split(' ')[0] || 'teacher'}`}
        title="Your teaching studio"
        description={`${formatDate(new Date())} · Start a live lesson, check your classrooms, and keep every learner in the room.`}
        actions={
          <>
            {liveRoom ? (
              <Button as={Link} to={`/teacher/classrooms/${liveRoom.id}`} variant="brand" icon={Radio}>
                Resume live class
              </Button>
            ) : (
              <Button onClick={() => openStart()} variant="brand" icon={Radio} disabled={!activeClassrooms.length}>
                Start a class
              </Button>
            )}
            <Button as={Link} to="/teacher/classrooms" variant="ghost" icon={BookOpen}>
              Classrooms
            </Button>
          </>
        }
      />

      <JoinRequestsPanel />

      {liveRoom ? (
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900/60 dark:bg-rose-950/30 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-300">
              <Radio className="h-5 w-5" />
              <span className="absolute inset-0 animate-pulse-ring rounded-xl border border-rose-400/40" />
            </span>
            <div>
              <p className="text-sm font-semibold text-rose-900 dark:text-rose-100">{liveRoom.name} is live now</p>
              <p className="text-xs text-rose-700/70 dark:text-rose-200/60">Students can join with code {liveRoom.join_code}. Captions and ISL signs are active.</p>
            </div>
          </div>
          <Button as={Link} to={`/teacher/classrooms/${liveRoom.id}`} variant="danger" size="sm">Return to live room</Button>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BookOpen} label="Active classrooms" value={stats.active_classrooms ?? activeClassrooms.length} hint={`${stats.live_classrooms ?? 0} live right now`} tone="brand" />
        <StatCard icon={Users} label="Students reached" value={stats.total_students ?? 0} hint="Across active classrooms" tone="violet" />
        <StatCard icon={GraduationCap} label="Completed lectures" value={stats.completed_lectures ?? 0} hint={`${stats.total_materials ?? 0} materials shared`} tone="emerald" />
        <StatCard icon={Clock3} label="Recorded hours" value={`${(stats.total_recorded_hours ?? 0).toFixed(1)}h`} hint={`${stats.total_recordings ?? 0} recordings saved`} tone="amber" />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <section className="card p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Classrooms</h2>
              <p className="mt-0.5 text-xs text-ink-400">Your shared rooms and their join codes</p>
            </div>
            <Button as={Link} to="/teacher/classrooms" variant="quiet" size="sm">View all</Button>
          </div>

          {activeClassrooms.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {activeClassrooms.slice(0, 4).map((classroom) => (
                <ClassroomCard key={classroom.id} classroom={classroom} role="teacher" onCopyCode={copyCode} onStart={openStart} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BookOpen}
              title="No classrooms yet"
              description="Create your first inclusive classroom, share the join code, and start a live lecture."
              action={<Button as={Link} to="/teacher/classrooms" variant="brand">Create a classroom</Button>}
            />
          )}
        </section>

        <div className="space-y-6">
          <section className="card p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">Teaching activity</h2>
                <p className="mt-0.5 text-xs text-ink-400">Lectures over the last week</p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-300">
                <TrendingUp className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-4">
              <ActivityChart data={data?.activity || []} dataKey="lectures" label="Lectures" />
            </div>
          </section>

          <section className="card p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-300">
                <Sparkles className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-sm font-semibold">A quick accessibility check</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                  Your classroom source language is used for speech recognition. Each student's caption language and learning mode are already loaded from their profile.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="brand">Source: English</Badge>
                  <Badge tone="violet">12 caption languages</Badge>
                  <Badge tone="green">ISL avatar ready</Badge>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Recent lectures</h2>
              <p className="mt-0.5 text-xs text-ink-400">Transcripts and recordings stay attached to each lecture</p>
            </div>
            <Button as={Link} to="/teacher/lectures" variant="quiet" size="sm">All lectures</Button>
          </div>
          {data?.recent_lectures?.length ? (
            <div className="space-y-2.5">
              {data.recent_lectures.slice(0, 5).map((lecture) => (
                <LectureRow key={lecture.id} lecture={lecture} role="teacher" />
              ))}
            </div>
          ) : (
            <EmptyState icon={Clock3} title="No lectures yet" description="Start a live class to create your first lecture and transcript." />
          )}
        </section>

        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Recent recordings</h2>
              <p className="mt-0.5 text-xs text-ink-400">Replayable lessons with transcripts</p>
            </div>
            <Button as={Link} to="/teacher/recordings" variant="quiet" size="sm">View all</Button>
          </div>
          {data?.recent_recordings?.length ? (
            <div className="space-y-2.5">
              {data.recent_recordings.slice(0, 3).map((recording) => (
                <RecordingRow key={recording.id} recording={recording} role="teacher" onPlay={() => navigate(`/teacher/recordings/${recording.id}`)} />
              ))}
            </div>
          ) : (
            <EmptyState icon={Video} title="No recordings yet" description="Record a live lecture to give students a captioned replay." />
          )}
        </section>
      </div>

      <section className="mt-6 card flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
            <ClipboardCopy className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Share a join code</p>
            <p className="text-xs text-ink-500 dark:text-ink-400">Students enrol instantly from their dashboard.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeClassrooms.slice(0, 3).map((classroom) => (
            <button key={classroom.id} type="button" onClick={() => copyCode(classroom.join_code)} className="chip font-mono transition hover:border-brand-300">
              {classroom.join_code} <span className="font-sans font-normal text-ink-400">· {classroom.name}</span>
            </button>
          ))}
          {!activeClassrooms.length ? <span className="text-xs text-ink-400">Create a classroom to get a code.</span> : null}
        </div>
      </section>

      <Modal
        open={startOpen}
        onClose={() => setStartOpen(false)}
        title="Start a live lecture"
        description="Your browser will ask for camera and microphone access. Students in this classroom will see you live."
        footer={
          <>
            <Button variant="ghost" onClick={() => setStartOpen(false)}>Cancel</Button>
            <Button variant="brand" loading={starting} onClick={startLecture} disabled={!startForm.classroom_id} icon={Radio}>
              Go live
            </Button>
          </>
        }
      >
        <form onSubmit={startLecture} className="space-y-4">
          <label className="block">
            <span className="label">Classroom</span>
            <select
              className="select"
              value={startForm.classroom_id}
              onChange={(event) => setStartForm((current) => ({ ...current, classroom_id: event.target.value }))}
            >
              <option value="">Select a classroom</option>
              {activeClassrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>{classroom.name} · {classroom.join_code}</option>
              ))}
            </select>
          </label>
          <Input
            label="Lecture title (optional)"
            placeholder="e.g. Photosynthesis — how plants make food"
            value={startForm.title}
            onChange={(event) => setStartForm((current) => ({ ...current, title: event.target.value }))}
          />
          <div className="rounded-2xl border border-ink-200/70 bg-ink-50/60 p-3.5 text-xs leading-relaxed text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400">
            <p className="font-semibold text-ink-700 dark:text-ink-200">Before you go live</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>Use Chrome or Edge for browser speech recognition, or type captions manually.</li>
              <li>Allow camera and microphone access when prompted.</li>
              <li>Students join the same room with the classroom join code.</li>
            </ul>
          </div>
        </form>
      </Modal>
    </div>
  )
}
