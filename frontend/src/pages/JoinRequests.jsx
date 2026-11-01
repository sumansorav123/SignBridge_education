import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Clock3, XCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Badge, FullPageLoader } from '@/components/ui/Misc'
import api, { errorMessage } from '@/api/client'
import { useToast } from '@/context/ToastContext'
import JoinRequestsPanel from '@/components/classrooms/JoinRequestsPanel'

export function StudentJoinRequestWaiting() {
  const { requestId } = useParams()
  const navigate = useNavigate()
  const { error: toastError } = useToast()
  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [cancelling, setCancelling] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/student/join-requests')
      const current = data.find((item) => item.id === Number(requestId))
      if (!current) {
        setPageError('This classroom join request could not be found.')
        return
      }
      setPageError('')
      setRequest(current)
      if (current.status === 'approved') {
        navigate(`/student/classrooms/${current.classroom_id}`, { replace: true })
      }
    } catch (reason) {
      setPageError(errorMessage(reason, 'Your request status could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [navigate, requestId])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 4000)
    const onJoinRequest = (event) => {
      const notified = event.detail?.request
      if (notified?.id !== Number(requestId)) return
      setRequest(notified)
      if (notified.status === 'approved') {
        navigate(`/student/classrooms/${notified.classroom_id}`, { replace: true })
      }
    }
    window.addEventListener('signbridge:join-request', onJoinRequest)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('signbridge:join-request', onJoinRequest)
    }
  }, [refresh, requestId, navigate])

  async function cancelRequest() {
    if (!request) return
    setCancelling(true)
    try {
      const { data } = await api.post(`/classroom-join-requests/${request.id}/cancel`)
      setRequest(data)
    } catch (reason) {
      toastError('Could not cancel request', errorMessage(reason))
      await refresh()
    } finally {
      setCancelling(false)
    }
  }

  if (loading) return <FullPageLoader label="Checking your approval request…" />

  if (!request) {
    return (
      <section className="card mx-auto max-w-2xl p-6 text-center sm:p-10">
        <XCircle className="mx-auto h-10 w-10 text-rose-500" />
        <h1 className="mt-4 font-display text-2xl font-bold">Request unavailable</h1>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">{pageError || 'We could not find this join request.'}</p>
        <Button as={Link} to="/student/classrooms" variant="brand" className="mt-6">Back to classrooms</Button>
      </section>
    )
  }

  const pending = request.status === 'pending'
  const rejected = request.status === 'rejected'
  const cancelled = request.status === 'cancelled'
  return (
    <section className="card mx-auto max-w-2xl overflow-hidden p-6 text-center sm:p-10">
      {pending ? (
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-500/10 text-brand-700 dark:text-brand-300">
          <Clock3 className="h-9 w-9" />
          <span className="absolute inset-0 animate-ping rounded-full border border-brand-400/40" />
        </div>
      ) : rejected ? (
        <XCircle className="mx-auto h-12 w-12 text-rose-500" />
      ) : (
        <CheckCircle2 className="mx-auto h-12 w-12 text-ink-400" />
      )}
      <Badge tone={pending ? 'amber' : rejected ? 'rose' : 'slate'} className="mt-5">
        {request.status}
      </Badge>
      <h1 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
        {pending ? 'Waiting for Teacher Approval' : rejected ? 'Request declined' : 'Request cancelled'}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
        {pending
          ? 'Your request has been sent to the teacher. Please wait for approval.'
          : rejected
            ? 'Your request to join this classroom was declined by the teacher.'
            : 'You cancelled this request before the teacher reviewed it.'}
      </p>
      <div className="mx-auto mt-6 max-w-md rounded-2xl border border-ink-200/70 bg-ink-50/70 p-4 text-left dark:border-ink-800 dark:bg-ink-950/50">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Classroom</p>
        <p className="mt-1 font-semibold">{request.classroom_name}</p>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Teacher: {request.teacher_name}</p>
        <p className="mt-2 text-xs text-ink-400">Requested {new Date(request.requested_at).toLocaleString()}</p>
      </div>
      {pageError ? <p className="mt-4 text-sm text-rose-600 dark:text-rose-300">{pageError}</p> : null}
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {pending ? (
          <Button onClick={cancelRequest} variant="ghost" loading={cancelling}>Cancel request</Button>
        ) : null}
        {(rejected || cancelled) ? (
          <Button as={Link} to="/student/classrooms" variant="brand">Return to classrooms</Button>
        ) : null}
        <Button as={Link} to="/student" variant="quiet" icon={ArrowLeft}>Student dashboard</Button>
      </div>
    </section>
  )
}

export function TeacherJoinRequestsPage() {
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300">Classroom access</p>
        <h1 className="mt-1 font-display text-2xl font-bold">Join requests</h1>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">Approve or decline students waiting to enter your classrooms.</p>
      </div>
      <JoinRequestsPanel />
    </div>
  )
}
