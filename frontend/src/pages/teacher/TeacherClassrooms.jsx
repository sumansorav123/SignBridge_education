import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, BookOpen, Copy, Plus, Radio, RotateCcw, Search, Users } from 'lucide-react'
import clsx from 'clsx'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ClassroomCard from '@/components/dashboard/ClassroomCard'
import { Badge, EmptyState, FullPageLoader } from '@/components/ui/Misc'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { useToast } from '@/context/ToastContext'
import api, { errorMessage } from '@/api/client'
import { LANGUAGES } from '@/lib/languages'
import { formatDate } from '@/lib/format'

const BLANK = { name: '', subject: '', description: '', source_language: 'en' }

export default function TeacherClassrooms() {
  const navigate = useNavigate()
  const { success, error: toastError } = useToast()
  const [classrooms, setClassrooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [startRoom, setStartRoom] = useState(null)
  const [lectureTitle, setLectureTitle] = useState('')
  const [starting, setStarting] = useState(false)

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const { data } = await api.get('/teacher/classrooms', { params: { include_archived: includeArchived } })
      setClassrooms(data)
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load your classrooms.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeArchived])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return classrooms
    return classrooms.filter((room) =>
      [room.name, room.subject, room.join_code, room.description].filter(Boolean).some((value) => value.toLowerCase().includes(needle)),
    )
  }, [classrooms, query])

  const active = filtered.filter((room) => room.status !== 'archived')
  const archived = filtered.filter((room) => room.status === 'archived')

  async function createClassroom(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const { data } = await api.post('/teacher/classrooms', {
        ...form,
        description: form.description.trim() || null,
      })
      success('Classroom created', `Share join code ${data.join_code} with your students.`)
      setCreateOpen(false)
      setForm(BLANK)
      await load()
    } catch (err) {
      toastError('Could not create classroom', errorMessage(err))
    } finally {
      setSaving(false)
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

  async function archive(room) {
    if (!window.confirm(`Archive “${room.name}”? Students keep their recordings and materials.`)) return
    setBusyId(room.id)
    try {
      await api.delete(`/teacher/classrooms/${room.id}`)
      success('Classroom archived', 'Existing recordings, lectures and materials are retained.')
      await load()
    } catch (err) {
      toastError('Could not archive classroom', errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function restore(room) {
    setBusyId(room.id)
    try {
      await api.post(`/teacher/classrooms/${room.id}/restore`)
      success('Classroom restored', `${room.name} is active again.`)
      await load()
    } catch (err) {
      toastError('Could not restore classroom', errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function startLecture(event) {
    event?.preventDefault()
    if (!startRoom) return
    setStarting(true)
    try {
      const { data } = await api.post('/teacher/lectures/start', {
        classroom_id: startRoom.id,
        title: lectureTitle.trim() || null,
      })
      setStartRoom(null)
      setLectureTitle('')
      success('Lecture started', 'Allow camera and microphone access in the live room.')
      navigate(`/teacher/classrooms/${data.classroom_id}`)
    } catch (err) {
      toastError('Could not start the lecture', errorMessage(err))
    } finally {
      setStarting(false)
    }
  }

  if (loading) return <FullPageLoader label="Loading your classrooms…" />

  return (
    <div>
      <PageHeader
        eyebrow="Your teaching spaces"
        title="Classrooms"
        description="Create a room, share its join code, and keep every lecture, transcript, recording and material in one place."
        actions={<Button onClick={() => setCreateOpen(true)} variant="brand" icon={Plus}>New classroom</Button>}
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-11"
            placeholder="Search by name, subject or join code…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search classrooms"
          />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-500 dark:text-ink-400">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />
          Show archived
        </label>
      </div>

      {loadError ? (
        <EmptyState icon={BookOpen} title="Classrooms could not load" description={loadError} action={<Button onClick={load} variant="brand">Try again</Button>} />
      ) : active.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {active.map((room) => (
            <div key={room.id} className="relative">
              <ClassroomCard
                classroom={room}
                role="teacher"
                onCopyCode={copyCode}
                onStart={(selected) => { setStartRoom(selected); setLectureTitle('') }}
              />
              <button
                type="button"
                onClick={() => archive(room)}
                disabled={busyId === room.id || room.is_live}
                title={room.is_live ? 'End the live lecture before archiving' : 'Archive classroom'}
                className="absolute right-3 top-[52px] rounded-lg p-1.5 text-ink-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-rose-950/40"
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={BookOpen}
          title={query ? 'No classrooms match your search' : 'Create your first classroom'}
          description={query ? 'Try a different name, subject or join code.' : 'A classroom holds your roster, live lectures, transcripts, recordings and shared materials.'}
          action={query ? <Button variant="ghost" onClick={() => setQuery('')}>Clear search</Button> : <Button variant="brand" icon={Plus} onClick={() => setCreateOpen(true)}>New classroom</Button>}
        />
      )}

      {archived.length ? (
        <section className="mt-10">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold">Archived classrooms</h2>
            <Badge tone="slate">{archived.length}</Badge>
          </div>
          <div className="table-shell bg-white/60 dark:bg-ink-900/40">
            <table className="table">
              <thead><tr><th>Classroom</th><th>Subject</th><th>Students</th><th>Created</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {archived.map((room) => (
                  <tr key={room.id}>
                    <td><span className="font-semibold">{room.name}</span><span className="ml-2 font-mono text-[10px] text-ink-400">{room.join_code}</span></td>
                    <td>{room.subject}</td>
                    <td>{room.student_count}</td>
                    <td>{formatDate(room.created_at)}</td>
                    <td className="text-right">
                      <button type="button" onClick={() => restore(room)} disabled={busyId === room.id} className={clsx('btn-quiet px-2 py-1 text-xs', busyId === room.id && 'opacity-50')}>
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <MiniStat icon={BookOpen} label="Active rooms" value={active.filter((room) => room.status !== 'archived').length} />
        <MiniStat icon={Radio} label="Live now" value={active.filter((room) => room.is_live).length} />
        <MiniStat icon={Users} label="Students reached" value={active.reduce((sum, room) => sum + (room.student_count || 0), 0)} />
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a classroom"
        description="Only the classroom name and subject are required. You can change these later."
        footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button><Button variant="brand" loading={saving} onClick={createClassroom} disabled={!form.name.trim() || !form.subject.trim()}>Create classroom</Button></>}
      >
        <form onSubmit={createClassroom} className="space-y-4">
          <Input label="Classroom name" required placeholder="e.g. Science 10A" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          <Input label="Subject" required placeholder="e.g. Biology" value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} />
          <Select label="Spoken source language" value={form.source_language} onChange={(event) => setForm((current) => ({ ...current, source_language: event.target.value }))} hint="Used for speech recognition and as the original caption language.">
            {LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.name} · {language.native}</option>)}
          </Select>
          <Textarea label="Description (optional)" rows={3} placeholder="What will this class cover?" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
        </form>
      </Modal>

      <Modal
        open={Boolean(startRoom)}
        onClose={() => setStartRoom(null)}
        title="Start a live lecture"
        description={startRoom ? `${startRoom.name} · ${startRoom.join_code}` : undefined}
        footer={<><Button variant="ghost" onClick={() => setStartRoom(null)}>Cancel</Button><Button variant="brand" loading={starting} onClick={startLecture} icon={Radio}>Go live</Button></>}
      >
        <form onSubmit={startLecture} className="space-y-4">
          <Input label="Lecture title (optional)" placeholder="e.g. Cell structure and function" value={lectureTitle} onChange={(event) => setLectureTitle(event.target.value)} />
          <div className="rounded-2xl border border-ink-200/70 bg-ink-50/60 p-4 text-xs leading-relaxed text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400">
            <p className="font-semibold text-ink-700 dark:text-ink-200">Going live will</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>open your camera and microphone,</li>
              <li>notify students already waiting in the room,</li>
              <li>start a transcript every caption is added to,</li>
              <li>let you record the lecture from the live room.</li>
            </ul>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-300"><Icon className="h-4 w-4" /></span>
      <div><p className="text-lg font-bold">{value}</p><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">{label}</p></div>
    </div>
  )
}
