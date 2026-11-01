import { useCallback, useEffect, useState } from 'react'
import { Check, Clock3, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Avatar, Badge, EmptyState, Spinner } from '@/components/ui/Misc'
import api, { errorMessage } from '@/api/client'
import { useToast } from '@/context/ToastContext'

export default function JoinRequestsPanel({ classroomId }) {
  const { success, error: toastError } = useToast()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [processingId, setProcessingId] = useState(null)

  const reload = useCallback(async () => {
    try {
      const path = classroomId
        ? `/teacher/classrooms/${classroomId}/join-requests`
        : '/teacher/join-requests'
      const { data } = await api.get(path)
      setRequests(data)
      setLoadError('')
    } catch (reason) {
      setLoadError(errorMessage(reason, 'Join requests could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [classroomId])

  useEffect(() => {
    reload()
    const timer = window.setInterval(reload, 10000)
    const onJoinRequest = (event) => {
      const request = event.detail?.request
      if (!request || (classroomId && request.classroom_id !== Number(classroomId))) return
      reload()
    }
    window.addEventListener('signbridge:join-request', onJoinRequest)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('signbridge:join-request', onJoinRequest)
    }
  }, [reload, classroomId])

  async function review(request, action) {
    setProcessingId(request.id)
    try {
      await api.post(`/classroom-join-requests/${request.id}/${action}`)
      setRequests((current) => current.filter((item) => item.id !== request.id))
      if (action === 'approve') {
        success('Student approved successfully.', `${request.student_name} can now enter ${request.classroom_name}.`)
      } else {
        success('Request rejected', `${request.student_name} was notified.`)
      }
    } catch (reason) {
      toastError(
        action === 'approve' ? 'Could not approve request' : 'Could not reject request',
        errorMessage(reason),
      )
      await reload()
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <section className="card mb-6 p-5 sm:p-6" aria-labelledby="join-requests-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="join-requests-title" className="font-display text-lg font-semibold">Classroom Join Requests</h2>
            {requests.length ? <Badge tone="amber">{requests.length} pending</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Review student requests before they enter a classroom.
          </p>
        </div>
        <button type="button" className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300" onClick={reload}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-ink-500"><Spinner /> Loading requests…</div>
      ) : loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <p>{loadError}</p>
          <button type="button" className="mt-2 font-semibold underline" onClick={reload}>Try again</button>
        </div>
      ) : requests.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {requests.map((request) => (
            <article key={request.id} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-ink-200/70 p-4 dark:border-ink-800 sm:flex-row sm:items-center">
              <Avatar name={request.student_name} size="md" tone="violet" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold">{request.student_name}</p>
                  <Badge tone="amber">Pending</Badge>
                </div>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">{request.student_email}</p>
                <p className="mt-1 truncate text-xs text-ink-600 dark:text-ink-300">
                  {request.classroom_name} · {request.teacher_name}
                </p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-400">
                  <Clock3 className="h-3 w-3" />
                  {new Date(request.requested_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-2 sm:flex-col">
                <Button
                  type="button"
                  variant="brand"
                  size="sm"
                  icon={Check}
                  loading={processingId === request.id}
                  disabled={processingId !== null}
                  onClick={() => review(request, 'approve')}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  icon={X}
                  disabled={processingId !== null}
                  onClick={() => review(request, 'reject')}
                >
                  Reject
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Check}
          title="No pending join requests"
          description="New requests appear here as soon as students submit a classroom code."
          className="border-0 bg-ink-50/70 py-8 dark:bg-ink-950/40"
        />
      )}
    </section>
  )
}
