import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'

const HandTrackingDemo = lazy(() => import('@/components/HandTrackingDemo'))
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowUpRight,
  BookOpen,
  Check,
  Clock3,
  Download,
  GraduationCap,
  Hand,
  Languages,
  Play,
  Plus,
  Radio,
  Search,
  Settings as SettingsIcon,
  Users,
  Video,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import { Badge, EmptyState, FullPageLoader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Field'
import StatCard from '@/components/dashboard/StatCard'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import api, { errorMessage } from '@/api/client'
import { resources } from '@/api/resourceClient'
import { apiUrl } from '@/api/config'
import { LANGUAGES, languageName } from '@/lib/languages'
import { formatDate, formatDuration } from '@/lib/format'

function useResource(loader) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function reload() {
    setLoading(true)
    setError('')
    try {
      setData(await loader())
    } catch (reason) {
      setError(errorMessage(reason, 'The information could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // The loader is deliberately supplied as a page-level operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { data, setData, loading, error, reload }
}

function PageLoadError({ title, message, retry }) {
  return (
    <EmptyState
      icon={Video}
      title={title}
      description={message}
      action={<Button onClick={retry} variant="brand">Try again</Button>}
    />
  )
}

function RecordingCard({ recording, href }) {
  return (
    <Link to={href} className="card group flex flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:border-brand-300">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-700 dark:text-brand-300">
          <Video className="h-5 w-5" />
        </span>
        <Badge tone={recording.status === 'ready' ? 'green' : 'amber'}>{recording.status}</Badge>
      </div>
      <div>
        <h3 className="line-clamp-2 font-semibold">{recording.title}</h3>
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
          {recording.classroom_name || 'Classroom'} · {formatDate(recording.recorded_at)}
        </p>
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-ink-200/70 pt-3 text-xs text-ink-500 dark:border-ink-800">
        <span>{formatDuration(recording.duration_seconds)}</span>
        <span>{recording.subtitle_count || 0} captions</span>
        <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </Link>
  )
}

export function StudentDashboard() {
  const { user } = useAuth()
  const { success, error: toastError } = useToast()
  const resource = useResource(async () => (await api.get('/student/dashboard')).data)
  const reloadRef = useRef(resource.reload)
  reloadRef.current = resource.reload
  const [savingMode, setSavingMode] = useState(false)
  const data = resource.data

  useEffect(() => {
    function onJoinRequest(event) {
      const request = event.detail?.request
      if (
        event.detail?.type === 'join_request_approved'
        && Number(request?.student_id) === Number(user?.id)
      ) {
        void reloadRef.current()
      }
    }
    window.addEventListener('signbridge:join-request', onJoinRequest)
    return () => window.removeEventListener('signbridge:join-request', onJoinRequest)
  }, [user?.id])

  async function switchMode() {
    const current = data?.preferences?.learning_mode || 'normal'
    setSavingMode(true)
    try {
      const { data: preferences } = await api.put('/student/preferences', {
        learning_mode: current === 'deaf' ? 'normal' : 'deaf',
      })
      resource.setData((currentData) => ({ ...currentData, preferences }))
      success('Learning mode updated', `You are now using ${preferences.learning_mode.toUpperCase()} MODE.`)
    } catch (error) {
      toastError('Could not update learning mode', errorMessage(error))
    } finally {
      setSavingMode(false)
    }
  }

  if (resource.loading) return <FullPageLoader label="Loading your learning overview…" />
  if (resource.error) return <PageLoadError title="Your overview could not load" message={resource.error} retry={resource.reload} />

  const preferences = data?.preferences
  const deafMode = preferences?.learning_mode === 'deaf'
  const stats = data?.stats || {}
  return (
    <div>
      <PageHeader
        eyebrow={`Welcome back, ${user?.full_name?.split(' ')[0] || 'learner'}`}
        title="Your learning space"
        description="Join your classes, choose how you learn, and revisit recordings and captions."
        actions={<Button as={Link} to="/student/classrooms" variant="brand" icon={Plus}>Join a classroom</Button>}
      />

      <section className="mb-6 flex flex-col gap-5 rounded-3xl border border-brand-200 bg-gradient-to-r from-brand-50 via-white to-violet-50 p-5 dark:border-brand-900/70 dark:from-brand-950/40 dark:via-ink-900 dark:to-violet-950/30 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-700 dark:text-violet-300">
            <Hand className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300">Learning mode</p>
            <h2 className="mt-1 font-display text-lg font-semibold">{deafMode ? 'Deaf mode is active' : 'Normal mode is active'}</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-500 dark:text-ink-400">
              {deafMode ? 'Live captions and verified ISL sign information are shown together.' : 'Watch the teacher and use captions or sign support whenever you need it.'}
            </p>
          </div>
        </div>
        <Button onClick={switchMode} loading={savingMode} variant={deafMode ? 'violet' : 'brand'} icon={deafMode ? Languages : Hand}>
          Switch to {deafMode ? 'NORMAL' : 'DEAF'} MODE
        </Button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BookOpen} label="My classrooms" value={stats.total_classes ?? data?.classrooms?.length ?? 0} hint="Classes you are enrolled in" tone="brand" />
        <StatCard icon={Radio} label="Live classrooms" value={data?.classrooms?.filter((room) => room.is_live).length || 0} hint="Join a lecture in progress" tone="violet" />
        <StatCard icon={Clock3} label="Learning hours" value={`${Number(stats.learning_hours || 0).toFixed(1)}h`} hint="Time spent in lectures" tone="emerald" />
        <StatCard icon={Video} label="Recordings" value={stats.recordings_available ?? data?.recordings?.length ?? 0} hint="Available to revisit" tone="amber" />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="font-display text-lg font-semibold">My classrooms</h2><p className="mt-1 text-xs text-ink-500">Both learning modes share the same classes.</p></div>
            <Button as={Link} to="/student/classrooms" variant="quiet" size="sm">View all</Button>
          </div>
          {data?.classrooms?.length ? (
            <div className="space-y-3">
              {data.classrooms.slice(0, 5).map((room) => (
                <Link key={room.id} to={`/student/classrooms/${room.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-ink-200/70 p-4 transition hover:border-brand-300 dark:border-ink-800">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-300"><BookOpen className="h-4 w-4" /></span>
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{room.name}</p><p className="mt-0.5 truncate text-xs text-ink-500">{room.subject} · {room.teacher_name || 'Teacher'}</p></div>
                  </div>
                  {room.is_live ? <Badge tone="rose" dot>Live</Badge> : <ArrowUpRight className="h-4 w-4 text-ink-400" />}
                </Link>
              ))}
            </div>
          ) : <EmptyState icon={BookOpen} title="No classrooms yet" description="Join a classroom with the code shared by your teacher." action={<Button as={Link} to="/student/classrooms" variant="brand">Join classroom</Button>} />}
        </section>

        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="font-display text-lg font-semibold">Recent recordings</h2><p className="mt-1 text-xs text-ink-500">Replay lessons and transcripts.</p></div>
            <Button as={Link} to="/student/recordings" variant="quiet" size="sm">View all</Button>
          </div>
          {data?.recordings?.length ? (
            <div className="space-y-3">{data.recordings.slice(0, 4).map((item) => (
              <Link key={item.id} to={`/student/recordings/${item.id}`} className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-ink-50 dark:hover:bg-ink-800/60">
                <Play className="h-4 w-4 text-brand-600" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="text-xs text-ink-500">{item.classroom_name} · {formatDuration(item.duration_seconds)}</p></div>
              </Link>
            ))}</div>
          ) : <p className="rounded-2xl bg-ink-50 p-4 text-sm text-ink-500 dark:bg-ink-950">Recordings shared by your teacher will appear here.</p>}
        </section>
      </div>
    </div>
  )
}

export function StudentClassrooms() {
  const { user } = useAuth()
  const { success, error: toastError } = useToast()
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinRequests, setJoinRequests] = useState([])
  const [joinRequestsError, setJoinRequestsError] = useState('')
  const resource = useResource(async () => (await api.get('/student/classrooms')).data)
  const reloadClassroomsRef = useRef(resource.reload)
  reloadClassroomsRef.current = resource.reload

  useEffect(() => {
    let active = true
    async function loadRequests() {
      try {
        const { data } = await api.get('/student/join-requests')
        if (active) {
          setJoinRequests(data.filter((item) => item.status === 'pending'))
          setJoinRequestsError('')
        }
      } catch (reason) {
        if (active) setJoinRequestsError(errorMessage(reason, 'Pending requests could not be loaded.'))
      }
    }
    function onJoinRequest(event) {
      loadRequests()
      const request = event.detail?.request
      if (
        event.detail?.type === 'join_request_approved'
        && Number(request?.student_id) === Number(user?.id)
      ) {
        void reloadClassroomsRef.current()
      }
    }
    loadRequests()
    const timer = window.setInterval(loadRequests, 10000)
    window.addEventListener('signbridge:join-request', onJoinRequest)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('signbridge:join-request', onJoinRequest)
    }
  }, [user?.id])

  async function join(event) {
    event.preventDefault()
    setJoining(true)
    try {
      const { data } = await api.post('/student/classrooms/join', { join_code: joinCode.trim().toUpperCase() })
      success('Request sent', `Your request to join ${data.classroom_name} is waiting for teacher approval.`)
      navigate(`/student/join-requests/${data.id}`)
    } catch (error) {
      toastError('Could not join classroom', errorMessage(error))
    } finally {
      setJoining(false)
    }
  }

  if (resource.loading) return <FullPageLoader label="Loading your classrooms…" />
  if (resource.error) return <PageLoadError title="Classrooms could not load" message={resource.error} retry={resource.reload} />
  return (
    <div>
      <PageHeader eyebrow="Your inclusive learning spaces" title="My classrooms" description="Join a class with your teacher’s code or continue learning in an enrolled classroom." />
      {joinRequests.length ? (
        <section className="card mb-5 p-5" aria-labelledby="student-pending-requests-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="student-pending-requests-title" className="font-display text-base font-semibold">Waiting for Teacher Approval</h2>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Your request has been sent to the teacher. Please wait for approval.</p>
            </div>
            <Badge tone="amber">{joinRequests.length} pending</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {joinRequests.map((request) => (
              <Link key={request.id} to={`/student/join-requests/${request.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-ink-200/70 p-4 hover:border-brand-300 dark:border-ink-800">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{request.classroom_name}</span>
                  <span className="mt-1 block truncate text-xs text-ink-500">Teacher: {request.teacher_name}</span>
                </span>
                <Badge tone="amber">Pending</Badge>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {joinRequestsError ? <p className="mb-4 text-sm text-rose-600 dark:text-rose-300">{joinRequestsError}</p> : null}
      <form onSubmit={join} className="mb-6 flex flex-col gap-3 rounded-3xl border border-brand-200 bg-brand-50/60 p-5 dark:border-brand-900/60 dark:bg-brand-950/20 sm:flex-row sm:items-end">
        <Input className="min-w-0 flex-1" label="Classroom join code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="e.g. SCI10A" maxLength={12} required />
        <Button type="submit" variant="brand" loading={joining} icon={Plus} disabled={joinCode.trim().length < 4}>Join classroom</Button>
      </form>
      {resource.data?.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resource.data.map((room) => (
            <Link key={room.id} to={`/student/classrooms/${room.id}`} className="card group p-5 transition hover:-translate-y-0.5 hover:border-brand-300">
              <div className="flex items-start justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-700 dark:text-brand-300"><BookOpen className="h-5 w-5" /></span>{room.is_live ? <Badge tone="rose" dot>Live</Badge> : <Badge>{room.subject}</Badge>}</div>
              <h2 className="mt-4 font-display text-lg font-semibold">{room.name}</h2>
              <p className="mt-1 text-sm text-ink-500">{room.subject} · {room.teacher_name || 'Teacher'}</p>
              <div className="mt-4 flex items-center justify-between border-t border-ink-200/70 pt-3 text-xs text-ink-500 dark:border-ink-800"><span>{room.student_count} learners</span><span className="flex items-center gap-1 text-brand-700 dark:text-brand-300">Open room <ArrowUpRight className="h-3.5 w-3.5" /></span></div>
            </Link>
          ))}
        </div>
      ) : <EmptyState icon={BookOpen} title="No classes joined yet" description="Enter the join code provided by your teacher to access your shared classroom." />}
    </div>
  )
}

export function StudentRecordings() {
  const resource = useResource(async () => (await resources.listStudentRecordings()).data)
  if (resource.loading) return <FullPageLoader label="Loading recordings…" />
  if (resource.error) return <PageLoadError title="Recordings could not load" message={resource.error} retry={resource.reload} />
  return (
    <div>
      <PageHeader eyebrow="Review and learn again" title="Recorded lectures" description="Replay authorized classroom recordings and read the synchronized transcript." />
      {resource.data?.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{resource.data.map((recording) => <RecordingCard key={recording.id} recording={recording} href={`/student/recordings/${recording.id}`} />)}</div> : <EmptyState icon={Video} title="No recordings available" description="Your teachers’ saved lectures will appear here when shared with your classroom." />}
    </div>
  )
}

function RecordingPlayer({ role }) {
  const { recordingId } = useParams()
  const { success, error: toastError } = useToast()
  const [recording, setRecording] = useState(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [language, setLanguage] = useState('')
  const [transcript, setTranscript] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [translating, setTranslating] = useState(false)
  const [showSigns, setShowSigns] = useState(true)
  const videoRef = useRef(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setPageError('')
      try {
        const [detailResponse, tokenResponse] = await Promise.all([
          resources.getRecording(recordingId, {
            params: { include_signs: true, sign_language: 'isl' },
          }),
          resources.getRecordingPlaybackToken(recordingId),
        ])
        if (!active) return
        setRecording(detailResponse.data)
        setTranscript(detailResponse.data.transcript || [])
        setLanguage(detailResponse.data.transcript_language || 'en')
        setVideoUrl(apiUrl(tokenResponse.data.url))
      } catch (error) {
        if (active) setPageError(errorMessage(error, 'This recording is unavailable.'))
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [recordingId])

  async function changeLanguage(nextLanguage) {
    setLanguage(nextLanguage)
    if (nextLanguage === recording?.transcript_language) {
      setTranscript(recording?.transcript || [])
      return
    }
    setTranslating(true)
    try {
      const { data } = await resources.getRecordingTranscript(recordingId, {
        params: { language: nextLanguage, translate: true, include_signs: true, sign_language: 'isl' },
      })
      setTranscript(data.subtitles || [])
      if (data.translated_count === 0 && data.provider === null && nextLanguage !== data.source_language) {
        toastError('Translation unavailable', 'No translation provider is configured. The source transcript is shown where no translation exists.')
      } else {
        success('Transcript updated', `Showing ${languageName(nextLanguage)} captions.`)
      }
    } catch (error) {
      toastError('Could not translate transcript', errorMessage(error))
    } finally {
      setTranslating(false)
    }
  }

  if (loading) return <FullPageLoader label="Preparing lecture playback…" />
  if (pageError) return <PageLoadError title="Recording unavailable" message={pageError} retry={() => window.location.reload()} />
  const offsetMs = recording?.start_offset_ms || 0
  const lectureTimeMs = currentTime * 1000 + offsetMs
  const activeSubtitle = transcript.find(
    (item) => lectureTimeMs >= item.start_ms && lectureTimeMs <= item.end_ms,
  )
  const activeSigns = activeSubtitle?.signs
  const downloadUrl = videoUrl ? `${videoUrl}${videoUrl.includes('?') ? '&' : '?'}download=true` : ''
  return (
    <div>
      <PageHeader
        eyebrow={recording?.classroom_name || 'Recorded lecture'}
        title={recording?.title || 'Lecture recording'}
        description={`${formatDate(recording?.recorded_at)} · ${formatDuration(recording?.duration_seconds)} · ${recording?.subtitle_count || transcript.length} captions${offsetMs ? ` · starts at ${formatDuration(Math.floor(offsetMs / 1000))}` : ''}`}
        actions={(
          <div className="flex flex-wrap gap-2">
            {downloadUrl ? <Button as="a" href={downloadUrl} download variant="ghost" icon={Download}>Download</Button> : null}
            <Button as={Link} to={role === 'teacher' ? '/teacher/recordings' : '/student/recordings'} variant="ghost">Back to recordings</Button>
          </div>
        )}
      />
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <section className="card overflow-hidden">
          <div className="relative bg-ink-950">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              className="aspect-video w-full"
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            />
            {activeSubtitle ? <div className="pointer-events-none absolute bottom-16 left-4 right-4 rounded-xl bg-black/75 px-4 py-3 text-center text-lg font-semibold text-white">{activeSubtitle.translations?.[language] || activeSubtitle.text}</div> : null}
          </div>
        </section>
        <section className="card flex max-h-[640px] flex-col p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-display text-lg font-semibold">Transcript</h2><p className="mt-1 text-xs text-ink-500">{translating ? 'Translating…' : `${transcript.length} caption segments`}</p></div>
            <Select aria-label="Transcript language" value={language} onChange={(event) => changeLanguage(event.target.value)}>
              {LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </Select>
          </div>
          <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
            {transcript.length ? transcript.map((item) => {
              const translated = item.translations?.[language]
              const text = translated || item.text
              const active = lectureTimeMs >= item.start_ms && lectureTimeMs <= item.end_ms
              return (
                <button key={`${item.id || item.sequence}-${item.start_ms}`} type="button" className={`w-full rounded-xl p-3 text-left text-sm transition hover:bg-brand-50 dark:hover:bg-brand-950/30 ${active ? 'bg-brand-50 ring-1 ring-brand-200 dark:bg-brand-950/30 dark:ring-brand-900' : ''}`} onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, (item.start_ms - offsetMs) / 1000) }}>
                  <span className="mr-2 text-[10px] font-semibold text-brand-700 dark:text-brand-300">{formatDuration(Math.floor(item.start_ms / 1000))}</span>{text}
                  {!translated && language !== recording?.transcript_language ? <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-600">source</span> : null}
                </button>
              )
            }) : <p className="rounded-2xl bg-ink-50 p-4 text-sm text-ink-500 dark:bg-ink-950">No transcript segments are available for this recording.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}

export function StudentRecordingPlayer() {
  return <RecordingPlayer role="student" />
}

export function TeacherRecordingDetail() {
  return <RecordingPlayer role="teacher" />
}

export function TeacherLectures() {
  const navigate = useNavigate()
  const { success, error: toastError } = useToast()
  const resource = useResource(async () => (await api.get('/teacher/lectures')).data)
  const [stoppingId, setStoppingId] = useState(null)
  const lectures = resource.data || []

  async function stopLecture(lecture) {
    setStoppingId(lecture.id)
    try {
      await resources.stopLecture(lecture.id)
      success('Lecture ended', 'The lecture was saved to your history.')
      await resource.reload()
    } catch (error) {
      toastError('Could not stop lecture', errorMessage(error))
    } finally {
      setStoppingId(null)
    }
  }

  if (resource.loading) return <FullPageLoader label="Loading lectures…" />
  if (resource.error) return <PageLoadError title="Lectures could not load" message={resource.error} retry={resource.reload} />
  return (
    <div>
      <PageHeader eyebrow="Teaching history" title="Lectures" description="See live and completed lectures across your classrooms." actions={<Button as={Link} to="/teacher/classrooms" variant="brand">Open classrooms</Button>} />
      {lectures.length ? (
        <div className="space-y-3">
          {lectures.map((lecture) => (
            <article key={lecture.id} className="card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-300"><Video className="h-4 w-4" /></span>
                <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{lecture.title}</h2><Badge tone={lecture.status === 'live' ? 'rose' : 'green'} dot>{lecture.status}</Badge></div><p className="mt-1 text-xs text-ink-500">{lecture.classroom_name} · {formatDate(lecture.started_at)} · {lecture.subtitle_count} captions</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                {lecture.status === 'live' ? <Button onClick={() => navigate(`/teacher/classrooms/${lecture.classroom_id}`)} variant="brand" icon={Radio}>Return to class</Button> : null}
                {lecture.status === 'live' ? <Button onClick={() => stopLecture(lecture)} variant="danger" loading={stoppingId === lecture.id}>End lecture</Button> : null}
                {lecture.recording_count ? <Button as={Link} to="/teacher/recordings" variant="ghost">View recording</Button> : null}
              </div>
            </article>
          ))}
        </div>
      ) : <EmptyState icon={Video} title="No lectures yet" description="Start a lecture from one of your classrooms to see it here." action={<Button as={Link} to="/teacher/classrooms" variant="brand">View classrooms</Button>} />}
    </div>
  )
}

export function TeacherRecordings() {
  const { success, error: toastError } = useToast()
  const resource = useResource(async () => (await api.get('/recordings')).data)
  const [deletingId, setDeletingId] = useState(null)

  async function remove(recording) {
    if (!window.confirm(`Delete “${recording.title}”? This permanently deletes its video file.`)) return
    setDeletingId(recording.id)
    try {
      await resources.deleteRecording(recording.id)
      success('Recording deleted', 'The recording and its stored video were removed.')
      await resource.reload()
    } catch (error) {
      toastError('Could not delete recording', errorMessage(error))
    } finally {
      setDeletingId(null)
    }
  }

  if (resource.loading) return <FullPageLoader label="Loading recordings…" />
  if (resource.error) return <PageLoadError title="Recordings could not load" message={resource.error} retry={resource.reload} />
  return (
    <div>
      <PageHeader eyebrow="Saved teaching sessions" title="Recordings" description="Replay your saved lectures and inspect their transcripts." />
      {resource.data?.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resource.data.map((recording) => (
            <div key={recording.id} className="space-y-2">
              <RecordingCard recording={recording} href={`/teacher/recordings/${recording.id}`} />
              <button type="button" disabled={deletingId === recording.id} onClick={() => remove(recording)} className="px-2 text-xs font-medium text-rose-600 hover:underline disabled:opacity-50">
                {deletingId === recording.id ? 'Deleting…' : 'Delete recording'}
              </button>
            </div>
          ))}
        </div>
      ) : <EmptyState icon={Video} title="No recordings saved" description="Start and record a live classroom, then save the recording to keep it here." action={<Button as={Link} to="/teacher/classrooms" variant="brand">Open a classroom</Button>} />}
    </div>
  )
}

export function TeacherStudents() {
  const resource = useResource(async () => (await api.get('/teacher/students')).data)
  const [query, setQuery] = useState('')
  const students = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (resource.data || []).filter((student) =>
      !needle || [student.full_name, student.email, student.classroom_name].some((value) => value?.toLowerCase().includes(needle)),
    )
  }, [resource.data, query])
  if (resource.loading) return <FullPageLoader label="Loading your students…" />
  if (resource.error) return <PageLoadError title="Student roster could not load" message={resource.error} retry={resource.reload} />
  return (
    <div>
      <PageHeader eyebrow="Learners across your rooms" title="Students" description="Review enrollment, preferred learning mode, and participation across classrooms." />
      <div className="relative mb-5 max-w-md"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" /><input className="input pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students or classrooms" aria-label="Search students" /></div>
      {students.length ? (
        <div className="overflow-hidden rounded-3xl border border-ink-200/70 bg-white/70 dark:border-ink-800 dark:bg-ink-900/60">
          <div className="hidden grid-cols-[1.3fr_1fr_0.8fr_0.8fr_0.9fr] gap-3 border-b border-ink-200 px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-400 dark:border-ink-800 md:grid"><span>Student</span><span>Classroom</span><span>Mode</span><span>Language</span><span>Participation</span></div>
          {students.map((student) => (
            <div key={`${student.id}-${student.classroom_id}`} className="grid gap-2 border-b border-ink-200/70 p-4 last:border-0 dark:border-ink-800 md:grid-cols-[1.3fr_1fr_0.8fr_0.8fr_0.9fr] md:items-center md:gap-3 md:px-5">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{student.full_name}</p><p className="truncate text-xs text-ink-500">{student.email}</p></div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 md:contents">
                <div className="min-w-0"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400 md:hidden">Classroom</span><span className="text-sm">{student.classroom_name}</span></div>
                <div><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400 md:hidden">Mode</span><Badge tone={student.learning_mode === 'deaf' ? 'violet' : 'brand'}>{student.learning_mode}</Badge></div>
                <div><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400 md:hidden">Language</span><span className="text-sm">{languageName(student.subtitle_language)}</span></div>
                <div><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400 md:hidden">Participation</span><span className="text-xs text-ink-500">{student.lectures_attended || 0} lectures · {student.minutes_attended || 0} min</span></div>
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyState icon={Users} title={query ? 'No students match' : 'No enrolled students'} description={query ? 'Try another student name or classroom.' : 'Students appear here after they join one of your classrooms.'} />}
    </div>
  )
}

export function SignPractice() {
  const { error: toastError } = useToast()
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  async function convert(event) {
    event.preventDefault()
    setSubmitting(true)
    try {
      const { data } = await api.post('/accessibility/sign-language/convert', { text: text.trim(), language: 'isl' })
      setResult(data)
    } catch (error) {
      toastError('Sign lookup unavailable', errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <div>
      <PageHeader eyebrow="Practice with the curated catalog" title="ISL sign practice" description="Check which words map to catalogued signs. Unsupported words are clearly marked rather than assigned invented gestures." />
      <form onSubmit={convert} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
        <Input className="min-w-0 flex-1" label="Word or phrase" value={text} onChange={(event) => setText(event.target.value)} placeholder="Try a short greeting or classroom phrase" maxLength={5000} required />
        <Button type="submit" variant="brand" loading={submitting} icon={Hand}>Look up signs</Button>
      </form>
      {result ? (
        <section className="mt-5 card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg font-semibold">Mapped sign sequence</h2><p className="mt-1 text-xs text-ink-500">{result.grammar_note || 'Catalog-backed mapping only.'}</p></div><Badge tone={result.has_fallback ? 'amber' : 'green'}>{Math.round((result.coverage || 0) * 100)}% mapped · {Math.round((result.verified_coverage || 0) * 100)}% interpreter-reviewed</Badge></div>
          {result.glosses?.length ? <div className="mt-4 flex flex-wrap gap-3">{result.glosses.map((item, index) => <div key={`${item.gloss}-${index}`} className={`min-w-36 rounded-2xl border p-4 ${item.available ? 'border-violet-200 bg-violet-50 dark:border-violet-900/60 dark:bg-violet-950/30' : 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30'}`}><p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">{item.available ? (item.verified ? 'Interpreter-reviewed sign' : 'Experimental sign') : 'Text only'}</p><p className="mt-1 font-semibold">{item.label}</p><p className="mt-1 text-xs text-ink-500">{item.available ? item.animation?.hands?.map((hand) => `${hand.handshape} at ${hand.location}, ${hand.movement}`).join('; ') : 'No sign available; shown as text.'}</p></div>)}</div> : <p className="mt-4 text-sm text-ink-500">No signable tokens were found.</p>}
          {result.fallback_message ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{result.fallback_message}</p> : null}
        </section>
      ) : null}
      <div className="mt-5">
        <Suspense fallback={<p className="text-sm text-ink-500">Loading hand tracking…</p>}>
          <HandTrackingDemo />
        </Suspense>
      </div>
    </div>
  )
}

export function Settings({ role }) {
  const { user, updateProfile } = useAuth()
  const { success, error: toastError } = useToast()
  const [name, setName] = useState(user?.full_name || '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [preferences, setPreferences] = useState(null)
  const [loading, setLoading] = useState(role === 'student')

  useEffect(() => {
    if (role !== 'student') return undefined
    let active = true
    api.get('/student/preferences')
      .then(({ data }) => { if (active) setPreferences(data) })
      .catch((error) => { if (active) toastError('Could not load preferences', errorMessage(error)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [role])

  async function saveName(event) {
    event.preventDefault()
    setProfileSaving(true)
    try {
      await updateProfile({ full_name: name.trim() })
      success('Profile updated', 'Your display name has been saved.')
    } catch (error) {
      toastError('Could not update profile', errorMessage(error))
    } finally {
      setProfileSaving(false)
    }
  }

  async function updatePreference(updates) {
    try {
      const { data } = await api.put('/student/preferences', updates)
      setPreferences(data)
      success('Accessibility setting saved', 'Your preference will be used in future live classes.')
    } catch (error) {
      toastError('Could not save setting', errorMessage(error))
    }
  }

  if (loading) return <FullPageLoader label="Loading accessibility settings…" />
  return (
    <div>
      <PageHeader eyebrow="Your account" title="Settings" description="Manage your profile and classroom accessibility preferences." />
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={saveName} className="card space-y-4 p-5">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-300"><GraduationCap className="h-5 w-5" /></span><div><h2 className="font-display text-lg font-semibold">Profile</h2><p className="text-xs text-ink-500">Account details for SignBridge.</p></div></div>
          <Input label="Full name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} />
          <Input label="Email address" value={user?.email || ''} disabled />
          <Button type="submit" variant="brand" loading={profileSaving}>Save profile</Button>
        </form>
        {role === 'student' ? (
          <section className="card space-y-4 p-5">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-300"><SettingsIcon className="h-5 w-5" /></span><div><h2 className="font-display text-lg font-semibold">Accessibility</h2><p className="text-xs text-ink-500">These settings are saved to your account.</p></div></div>
            <Select label="Learning mode" value={preferences?.learning_mode || 'normal'} onChange={(event) => updatePreference({ learning_mode: event.target.value })}><option value="normal">Normal mode</option><option value="deaf">Deaf mode</option></Select>
            <Select label="Subtitle language" value={preferences?.subtitle_language || 'en'} onChange={(event) => updatePreference({ subtitle_language: event.target.value })}>{LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}</Select>
            <Select label="Caption size" value={preferences?.subtitle_font_size || 24} onChange={(event) => updatePreference({ subtitle_font_size: Number(event.target.value) })}>{[18, 22, 24, 30, 36].map((size) => <option key={size} value={size}>{size}px</option>)}</Select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(preferences?.show_original)} onChange={(event) => updatePreference({ show_original: event.target.checked })} />Show original captions alongside translation</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(preferences?.high_contrast)} onChange={(event) => updatePreference({ high_contrast: event.target.checked })} />Use high-contrast captions</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(preferences?.avatar_enabled)} onChange={(event) => updatePreference({ avatar_enabled: event.target.checked })} />Show sign-language support</label>
          </section>
        ) : (
          <section className="card p-5"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><Check className="h-5 w-5" /></span><div><h2 className="font-display text-lg font-semibold">Teacher account</h2><p className="text-xs text-ink-500">Your classrooms and recordings are protected by your account.</p></div></div><p className="mt-5 rounded-2xl bg-ink-50 p-4 text-sm leading-relaxed text-ink-600 dark:bg-ink-950 dark:text-ink-300">Share classroom join codes only with your enrolled learners. Recordings are accessible to students enrolled in their classroom.</p></section>
        )}
      </div>
    </div>
  )
}
