import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Captions,
  Camera,
  CameraOff,
  Check,
  Hand,
  Languages,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Radio,
  RefreshCw,
  Square,
  Users,
  Video,
  VideoOff,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { Badge, EmptyState, FullPageLoader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Field'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import api, { errorMessage } from '@/api/client'
import { resources } from '@/api/resourceClient'
import JoinRequestsPanel from '@/components/classrooms/JoinRequestsPanel'
import { LANGUAGES, languageName } from '@/lib/languages'
import { countMedia, mediaSummary, mergeParticipantMedia } from '@/lib/mediaState'
import { createRecordingCapture } from '@/lib/recordingCapture'
import ClassroomMaterials from '@/components/classrooms/ClassroomMaterials'
import useClassroomSocket from '@/hooks/useClassroomSocket'
import useLocalMedia from '@/hooks/useLocalMedia'
import useSpeechRecognition from '@/hooks/useSpeechRecognition'
import useWebRTC from '@/hooks/useWebRTC'
import { reviewLabel } from '@/lib/islPose'

// Three.js is large; load it only when a deaf-mode student opens the avatar.
const IslAvatar = lazy(() => import('@/components/IslAvatar'))

function isSupportedMimeType(type) {
  return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)
}

function LiveClassroom({ role }) {
  const { classroomId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { success, error: toastError } = useToast()
  const classroomNumber = Number(classroomId)
  const socket = useClassroomSocket({ classroomId: classroomNumber })
  const media = useLocalMedia()
  const [classroom, setClassroom] = useState(null)
  const [lecture, setLecture] = useState(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [localVideoEnabled, setLocalVideoEnabled] = useState(true)
  const [localAudioEnabled, setLocalAudioEnabled] = useState(true)
  const [remoteStream, setRemoteStream] = useState(null)
  const [captions, setCaptions] = useState([])
  const [interim, setInterim] = useState('')
  const [manualCaption, setManualCaption] = useState('')
  const [captionError, setCaptionError] = useState('')
  const [preferences, setPreferences] = useState(null)
  const [participants, setParticipants] = useState([])
  const [recording, setRecording] = useState(false)
  const [recordingPaused, setRecordingPaused] = useState(false)
  const [savingRecording, setSavingRecording] = useState(false)
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const recorderRef = useRef(null)
  const recordingCaptureRef = useRef(null)
  const recorderChunksRef = useRef([])
  const recordingStartedAtRef = useRef(0)
  const recordingOffsetRef = useRef(0)
  const recordingPausedAtRef = useRef(0)
  const recordingPausedTotalRef = useRef(0)
  const captionStartedAtRef = useRef(Date.now())
  const captionOffsetRef = useRef(0)

  const onRemoteStream = useCallback((stream) => setRemoteStream(stream), [])
  const onPeerState = useCallback(() => {}, [])
  const rtc = useWebRTC({
    role,
    socket,
    localStream: media.stream,
    onRemoteStream,
    onPeerState,
  })

  const sourceLanguage = classroom?.source_language || 'en'
  const speechLanguage = useMemo(
    () => LANGUAGES.find((item) => item.code === sourceLanguage)?.speech || 'en-IN',
    [sourceLanguage],
  )

  const onInterim = useCallback((text) => setInterim(text), [])
  const onFinal = useCallback(
    (text, confidence) => {
      const start = Math.max(0, Date.now() - captionStartedAtRef.current + captionOffsetRef.current)
      socket.send({
        type: 'subtitle',
        text,
        source_language: sourceLanguage,
        is_final: true,
        start_ms: start,
        end_ms: start + 3000,
        confidence,
      })
      setInterim('')
    },
    [socket, sourceLanguage],
  )
  const onSpeechError = useCallback((message) => setCaptionError(message), [])
  const speech = useSpeechRecognition({
    language: speechLanguage,
    onInterim,
    onFinal,
    onError: onSpeechError,
  })

  useEffect(() => {
    let active = true
    async function loadRoom() {
      setPageLoading(true)
      setLoadError('')
      try {
        const [roomResponse, lectureResponse] = await Promise.all([
          role === 'teacher'
            ? api.get(`/teacher/classrooms/${classroomNumber}`)
            : api.get('/student/classrooms'),
          role === 'teacher'
            ? api.get('/teacher/lectures', {
                params: { classroom_id: classroomNumber, status: 'live' },
              })
            : Promise.resolve({ data: [] }),
        ])
        if (!active) return
        const room =
          role === 'teacher'
            ? roomResponse.data
            : roomResponse.data.find((item) => item.id === classroomNumber)
        if (!room) {
          setLoadError('You are not enrolled in this classroom.')
          return
        }
        setClassroom(room)
        setLecture(lectureResponse.data[0] || null)
      } catch (error) {
        if (active) setLoadError(errorMessage(error, 'Could not load this classroom.'))
      } finally {
        if (active) setPageLoading(false)
      }
    }
    if (!Number.isInteger(classroomNumber) || classroomNumber < 1) {
      setLoadError('The classroom link is invalid.')
      setPageLoading(false)
    } else {
      loadRoom()
    }
    return () => {
      active = false
    }
  }, [classroomNumber, role])

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = media.stream
    }
  }, [media.stream])

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
  }, [remoteStream])

  useEffect(
    () => () => {
      const recorder = recorderRef.current
      recorderRef.current = null
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          /* already stopped */
        }
      }
      recordingCaptureRef.current?.dispose()
      recordingCaptureRef.current = null
    },
    [],
  )

  useEffect(() => {
    if (role !== 'student') return undefined
    let active = true
    api.get('/student/preferences')
      .then(({ data }) => {
        if (active) setPreferences(data)
      })
      .catch((error) => {
        if (active) setCaptionError(errorMessage(error, 'Could not load your accessibility preferences.'))
      })
    return () => {
      active = false
    }
  }, [role])

  useEffect(() => {
    return socket.subscribe((message) => {
      if (message.type === 'ready') {
        if (message.preferences) setPreferences(message.preferences)
        setParticipants(mergeParticipantMedia([], { ...message, type: 'presence' }))
        if (message.lecture) setLecture((current) => current || message.lecture)
        if (message.recent_captions?.length) {
          setCaptions(message.recent_captions.slice(-30))
        }
        if (message.latest_caption) {
          setCaptions((current) => [...current.slice(-29), message.latest_caption])
        }
      } else if (message.type === 'presence') {
        setParticipants((current) => mergeParticipantMedia(current, message))
      } else if (message.type === 'participant-media' || message.type === 'teacher-media') {
        setParticipants((current) => mergeParticipantMedia(current, message))
      } else if (message.type === 'student-joined' && message.student) {
        setParticipants((current) =>
          mergeParticipantMedia(current, { type: 'participant-media', student: message.student }),
        )
      } else if (message.type === 'stream-unavailable') {
        setCaptionError(message.reason || 'The teacher is not connected yet.')
      } else if (message.type === 'lecture-started') {
        setLecture(message.lecture)
        captionStartedAtRef.current = Date.now()
        captionOffsetRef.current = 0
      } else if (message.type === 'lecture-ended') {
        setLecture((current) =>
          current ? { ...current, status: 'completed', ended_at: message.ended_at } : current,
        )
      } else if (message.type === 'subtitle') {
        setCaptions((current) => {
          if (message.partial) return current
          const next = [...current, message]
          return next.slice(-30)
        })
        if (message.partial) setInterim(message.translated_text || message.original_text || '')
        else setInterim('')
      } else if (message.type === 'caption-preview') {
        setInterim(message.text || '')
      } else if (message.type === 'subtitle-ack') {
        setCaptions((current) =>
          [...current, {
            ...message,
            original_text: message.text,
            translated_text: message.text,
            language: sourceLanguage,
            is_final: true,
          }].slice(-30),
        )
      } else if (message.type === 'preferences') {
        setPreferences(message.preferences)
      } else if (message.type === 'recording-state') {
        setLecture((current) => current ? { ...current, is_recording: message.recording } : current)
      } else if (message.type === 'error') {
        setCaptionError(message.message || 'The classroom could not process that update.')
      }
    })
  }, [socket, sourceLanguage])

  const currentCaption = captions[captions.length - 1]
  const teacherCount = participants.filter((person) => person.role === 'teacher').length
  const studentCount = participants.filter((person) => person.role === 'student').length
  const mediaCounts = countMedia(participants)
  const connected = socket.status === 'open'
  const rtcLabel =
    rtc.connectionState === 'connected'
      ? 'Media connected'
      : rtc.connectionState === 'connecting'
        ? 'Media connecting'
        : rtc.connectionState === 'reconnecting'
          ? 'Media reconnecting'
          : rtc.connectionState === 'failed'
            ? 'Media failed'
            : 'Media idle'
  const canReconnect = ['offline', 'error', 'closed', 'denied', 'unauthorized'].includes(socket.status)

  async function beginLecture() {
    try {
      const { data } = await resources.startLecture(classroom?.id)
      setLecture(data)
      captionStartedAtRef.current = Date.now()
      captionOffsetRef.current = 0
      if (media.stream) speech.start()
      success('Lecture started', 'Students in the classroom can now connect.')
    } catch (error) {
      toastError('Could not start lecture', errorMessage(error))
    }
  }

  async function startMedia() {
    const stream = await media.start()
    if (!stream) {
      toastError('Camera or microphone unavailable', media.error || 'Check browser permissions and try again.')
      return
    }
    setLocalVideoEnabled(true)
    setLocalAudioEnabled(true)
    socket.send({ type: 'media-state', audio_enabled: true, video_enabled: true })
    if (role === 'teacher' && lecture?.status === 'live') {
      captionStartedAtRef.current = Date.now() - (lecture.duration_seconds || 0) * 1000
      if (!speech.start()) {
        setCaptionError(speech.error || 'Speech recognition could not start. You can type captions below.')
      }
    }
  }

  function stopMedia() {
    if (role === 'teacher') speech.stop()
    if (recording) void stopRecording()
    media.stop()
    socket.send({ type: 'media-state', audio_enabled: false, video_enabled: false })
    setLocalVideoEnabled(true)
    setLocalAudioEnabled(true)
  }

  function toggleCamera() {
    const enabled = media.toggleVideo()
    setLocalVideoEnabled(enabled)
    socket.send({ type: 'media-state', video_enabled: enabled })
  }

  function toggleMicrophone() {
    const enabled = media.toggleAudio()
    setLocalAudioEnabled(enabled)
    socket.send({ type: 'media-state', audio_enabled: enabled })
  }

  async function toggleScreenShare() {
    if (media.sharingScreen) {
      media.stopScreenShare()
      return
    }
    const display = await media.startScreenShare()
    if (!display) {
      toastError('Screen sharing unavailable', media.error || 'Your browser blocked screen sharing.')
    }
  }

  async function sendManualCaption(event) {
    event.preventDefault()
    const text = manualCaption.trim()
    if (!text) return
    if (!lecture || lecture.status !== 'live') {
      setCaptionError('Start the lecture before publishing captions.')
      return
    }
    const start = Math.max(0, Date.now() - captionStartedAtRef.current + captionOffsetRef.current)
    const sent = socket.send({
      type: 'subtitle',
      text,
      source_language: sourceLanguage,
      is_final: true,
      start_ms: start,
      end_ms: start + 3000,
    })
    if (!sent) {
      setCaptionError('The live connection is not ready. Reconnect before sending this caption.')
      return
    }
    setManualCaption('')
    setCaptionError('')
  }

  async function startRecording() {
    if (!lecture || lecture.status !== 'live') {
      toastError('Start the lecture first', 'Recordings can only be made during a live lecture.')
      return
    }
    if (!media.stream) {
      toastError('Start your camera first', 'The recording captures the teacher video and audio.')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      toastError('Recording is not supported', 'Use a current version of Chrome, Edge, or Firefox.')
      return
    }
    let capture
    try {
      capture = createRecordingCapture(
        localVideoRef.current,
        media.stream.getAudioTracks(),
        {
          onFrameError: (frameError) => {
            const message = frameError instanceof Error
              ? frameError.message
              : 'The video frame could not be captured.'
            setCaptionError(message)
            toastError('Recording capture issue', message)
          },
        },
      )
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        .find(isSupportedMimeType)
      const recorder = new MediaRecorder(capture.stream, mimeType ? { mimeType } : undefined)
      await resources.startRecording(lecture.id)
      recorderChunksRef.current = []
      const lectureStartedAt = lecture.started_at ? Date.parse(lecture.started_at) : Number.NaN
      recordingOffsetRef.current = Number.isFinite(lectureStartedAt)
        ? Math.max(0, Date.now() - lectureStartedAt)
        : Math.max(0, captionOffsetRef.current)
      recordingStartedAtRef.current = Date.now()
      recordingPausedAtRef.current = 0
      recordingPausedTotalRef.current = 0
      recorder.ondataavailable = (event) => {
        if (event.data?.size) recorderChunksRef.current.push(event.data)
      }
      recorder.onerror = (event) => {
        const message = event?.error?.message || 'The browser recorder stopped unexpectedly.'
        setCaptionError(message)
        toastError('Recording error', message)
      }
      recorderRef.current = recorder
      recordingCaptureRef.current = capture
      recorder.start(1000)
      setRecording(true)
      setRecordingPaused(false)
      setLecture((current) => (current ? { ...current, is_recording: true } : current))
      setCaptionError('')
    } catch (error) {
      if (capture) {
        capture.dispose()
        if (recordingCaptureRef.current === capture) recordingCaptureRef.current = null
      }
      setLecture((current) => (current ? { ...current, is_recording: false } : current))
      toastError('Could not start recording', errorMessage(error, 'Your browser could not start a media recording.'))
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      recordingCaptureRef.current?.dispose()
      recordingCaptureRef.current = null
      setRecording(false)
      setRecordingPaused(false)
      setLecture((current) => (current ? { ...current, is_recording: false } : current))
      return
    }
    setSavingRecording(true)
    const elapsed = Date.now() - recordingStartedAtRef.current - recordingPausedTotalRef.current
    const duration = Math.max(0, Math.floor(elapsed / 1000))
    const offset = Math.max(0, Math.floor(recordingOffsetRef.current))
    const blob = await new Promise((resolve) => {
      recorder.addEventListener('stop', () => {
        resolve(new Blob(recorderChunksRef.current, { type: recorder.mimeType || 'video/webm' }))
      }, { once: true })
      recorder.stop()
    })
    recorderRef.current = null
    recordingCaptureRef.current?.dispose()
    recordingCaptureRef.current = null
    setRecording(false)
    setRecordingPaused(false)
    try {
      const file = new File([blob], `signbridge-lecture-${lecture.id}.webm`, {
        type: blob.type || 'video/webm',
      })
      const form = new FormData()
      form.append('lecture_id', String(lecture.id))
      form.append('duration_seconds', String(duration))
      form.append('start_offset_ms', String(offset))
      form.append('title', `${lecture.title} — recording`)
      form.append('file', file)
      await resources.saveRecording(lecture.id, form)
      success('Recording saved', 'The lecture video and transcript are available in Recordings.')
    } catch (error) {
      toastError('Recording upload failed', errorMessage(error, 'The recording could not be saved.'))
    } finally {
      setLecture((current) => (current ? { ...current, is_recording: false } : current))
      setSavingRecording(false)
    }
  }

  function toggleRecordingPause() {
    const recorder = recorderRef.current
    if (!recorder) return
    if (recorder.state === 'recording') {
      recorder.pause()
      recordingPausedAtRef.current = Date.now()
      setRecordingPaused(true)
    } else if (recorder.state === 'paused') {
      if (recordingPausedAtRef.current) {
        recordingPausedTotalRef.current += Date.now() - recordingPausedAtRef.current
        recordingPausedAtRef.current = 0
      }
      recorder.resume()
      setRecordingPaused(false)
    }
  }

  async function endLecture() {
    speech.stop()
    if (recording) await stopRecording()
    try {
      await resources.stopLecture(lecture.id)
      setLecture((current) => ({ ...current, status: 'completed' }))
      success('Lecture ended', 'Students can review its captions and any saved recording.')
    } catch (error) {
      toastError('Could not end lecture', errorMessage(error))
    }
  }

  async function updatePreferences(updates) {
    try {
      const { data } = await api.put('/student/preferences', updates)
      setPreferences(data)
      socket.send({ type: 'preferences', ...updates })
    } catch (error) {
      toastError('Preferences were not saved', errorMessage(error))
    }
  }

  if (pageLoading) return <FullPageLoader label="Connecting to your classroom…" />
  if (loadError) {
    return (
      <EmptyState
        icon={Video}
        title="Classroom unavailable"
        description={loadError}
        action={<Button as={Link} to={role === 'teacher' ? '/teacher/classrooms' : '/student/classrooms'} variant="brand">Back to classrooms</Button>}
      />
    )
  }

  const isLive = lecture?.status === 'live'
  const deafMode = role === 'student' && preferences?.learning_mode === 'deaf'
  const translatedCaption = currentCaption?.translated_text || currentCaption?.original_text || currentCaption?.text || ''
  const signInfo = currentCaption?.signs
  const signGlosses = signInfo?.glosses || []
  const videoStream = role === 'teacher' ? media.stream : remoteStream
  const subtitleStyle = preferences
    ? {
        fontSize: `${preferences.subtitle_font_size}px`,
        color: preferences.high_contrast ? '#FFFFFF' : preferences.subtitle_text_color,
        backgroundColor: preferences.high_contrast ? '#000000' : preferences.subtitle_background,
      }
    : undefined

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 rounded-3xl border border-ink-200/70 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/60 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={isLive ? 'rose' : 'slate'} dot>{isLive ? 'LIVE LECTURE' : 'CLASSROOM'}</Badge>
            <Badge tone={connected ? 'green' : 'amber'} dot>{connected ? 'Connected' : socket.status}</Badge>
            {role === 'teacher' && rtc.peerCount ? (
              <Badge tone={rtc.connectionState === 'connected' ? 'green' : rtc.connectionState === 'failed' ? 'rose' : 'amber'} dot>
                {rtcLabel} · {rtc.peerCount}
              </Badge>
            ) : null}
            {role === 'student' && rtc.connectionState !== 'idle' ? (
              <Badge tone={rtc.connectionState === 'connected' ? 'green' : rtc.connectionState === 'failed' ? 'rose' : 'amber'} dot>
                {rtcLabel}
              </Badge>
            ) : null}
          </div>
          <h1 className="font-display text-xl font-bold">{classroom?.name || 'Classroom'}</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            {lecture?.title || `${classroom?.subject || 'Class'} · ${user?.full_name || 'SignBridge'}`}
            {role === 'teacher' ? ` · ${studentCount} students connected` : ` · Teacher ${teacherCount ? 'online' : 'not connected yet'}`}
          </p>
        </div>
        {role === 'teacher' ? (
          <div className="flex flex-wrap gap-2">
            {!isLive ? <Button onClick={beginLecture} variant="brand" icon={Radio}>Start lecture</Button> : null}
            {isLive && !media.stream ? <Button onClick={startMedia} variant="brand" icon={Camera}>Start camera & mic</Button> : null}
            {media.stream ? (
              <>
                <Button onClick={toggleMicrophone} variant="ghost" icon={localAudioEnabled ? Mic : MicOff} aria-label="Toggle microphone" />
                <Button onClick={toggleCamera} variant="ghost" icon={localVideoEnabled ? Camera : CameraOff} aria-label="Toggle camera" />
                <Button onClick={toggleScreenShare} variant={media.sharingScreen ? 'violet' : 'ghost'} icon={media.sharingScreen ? MonitorOff : Monitor}>
                  {media.sharingScreen ? 'Stop sharing' : 'Share screen'}
                </Button>
                <Button onClick={stopMedia} variant="ghost" icon={VideoOff}>Stop media</Button>
              </>
            ) : null}
            {isLive && !recording ? <Button onClick={startRecording} variant="danger" icon={Radio}>Record</Button> : null}
            {recording ? (
              <>
                <Button onClick={toggleRecordingPause} variant="ghost">{recordingPaused ? 'Resume' : 'Pause'} recording</Button>
                <Button onClick={stopRecording} variant="danger" icon={Square} loading={savingRecording}>Save recording</Button>
              </>
            ) : null}
            {isLive ? <Button onClick={endLecture} variant="danger" icon={Square}>End lecture</Button> : null}
            {canReconnect ? <Button onClick={socket.reconnect} variant="ghost" icon={RefreshCw}>Reconnect</Button> : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink-500">LEARNING MODE</span>
            <Button
              onClick={() => updatePreferences({ learning_mode: deafMode ? 'normal' : 'deaf' })}
              variant={deafMode ? 'violet' : 'brand'}
              icon={deafMode ? Hand : Captions}
            >
              {deafMode ? 'DEAF MODE' : 'NORMAL MODE'}
            </Button>
            {canReconnect ? <Button onClick={socket.reconnect} variant="ghost" icon={RefreshCw}>Reconnect</Button> : null}
          </div>
        )}
      </header>
      {role === 'teacher' ? <JoinRequestsPanel classroomId={classroomNumber} /> : null}
      {socket.error || media.error || captionError ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" role="status">
          {socket.error || media.error || captionError}
        </div>
      ) : null}

      <div className={deafMode ? 'grid gap-5 xl:grid-cols-[1.25fr_1fr]' : 'grid gap-5 xl:grid-cols-[1.6fr_1fr]'}>
        <section className="card overflow-hidden">
          <div className="relative aspect-video bg-ink-950">
            <video
              ref={role === 'teacher' ? localVideoRef : remoteVideoRef}
              autoPlay
              playsInline
              muted={role === 'teacher'}
              className="h-full w-full object-contain"
            />
            {!videoStream ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
                {role === 'teacher' ? <Camera className="h-10 w-10 text-white/60" /> : <Radio className="h-10 w-10 text-white/60" />}
                <p className="font-semibold">{role === 'teacher' ? 'Camera preview will appear here' : rtc.teacherOnline ? 'Connecting to the teacher video…' : 'Waiting for the teacher to join'}</p>
                <p className="max-w-sm text-xs text-white/60">
                  {role === 'teacher' ? 'Start the lecture, then enable your camera and microphone.' : 'You remain in the same classroom while the teacher connects.'}
                </p>
              </div>
            ) : null}
            {recording ? <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"><span className="h-2 w-2 animate-pulse rounded-full bg-white" />{recordingPaused ? 'PAUSED' : 'RECORDING'}</div> : null}
            <div className="absolute bottom-4 left-4 rounded-full bg-ink-950/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
              {role === 'teacher' ? user?.full_name : classroom?.teacher_name || 'Teacher'}
            </div>
            {role === 'student' && media.stream ? (
              <div className="absolute right-4 top-4 overflow-hidden rounded-xl border border-white/30 bg-black/60 shadow-lg">
                <video ref={localVideoRef} autoPlay playsInline muted className="h-24 w-32 object-cover" />
                <p className="px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-white/80">You</p>
              </div>
            ) : null}
            {translatedCaption ? (
              <div className="absolute bottom-14 left-4 right-4 mx-auto max-h-[45%] max-w-3xl overflow-y-auto rounded-xl bg-black/75 px-4 py-3 text-center text-lg font-semibold leading-relaxed text-white backdrop-blur-sm" style={subtitleStyle} aria-live="polite">
                {translatedCaption}
                {currentCaption?.translated === false ? (
                  <span className="mt-1 block text-xs font-normal opacity-80">Original text · translation unavailable</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="card flex min-h-[310px] flex-col p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">Live captions</h2>
              <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                {role === 'teacher' ? 'Captions publish to each student’s selected language.' : `Showing ${languageName(preferences?.subtitle_language || sourceLanguage)} captions`}
              </p>
            </div>
            {role === 'student' ? (
              <Select
                className="w-full shrink-0 sm:w-auto"
                aria-label="Subtitle language"
                value={preferences?.subtitle_language || sourceLanguage}
                onChange={(event) => updatePreferences({ subtitle_language: event.target.value })}
              >
                {LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}
              </Select>
            ) : (
              <Badge tone={speech.listening ? 'green' : 'slate'}>{speech.listening ? 'Speech recognition on' : 'Captions ready'}</Badge>
            )}
          </div>

          <div className="my-4 flex-1 space-y-3 overflow-y-auto rounded-2xl bg-ink-50 p-4 dark:bg-ink-950/70" aria-live="polite">
            {captions.length ? captions.slice(-7).map((caption, index) => (
              <div key={`${caption.subtitle_id || caption.sequence || index}-${index}`} className="border-b border-ink-200/70 pb-2 last:border-0 dark:border-ink-800">
                <p className="text-sm leading-relaxed">{caption.translated_text || caption.original_text || caption.text}</p>
                {caption.translated === false ? (
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Original · translation unavailable</p>
                ) : caption.translated ? (
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Translated</p>
                ) : null}
                {preferences?.show_original && caption.original_text && caption.original_text !== caption.translated_text ? (
                  <p className="mt-1 text-xs text-ink-500">{caption.original_text}</p>
                ) : null}
                {caption.translation_error ? <p className="mt-1 text-xs text-amber-600">{caption.translation_error}</p> : null}
              </div>
            )) : <p className="py-8 text-center text-sm text-ink-400">{isLive ? 'Waiting for the next caption…' : 'Captions will appear here when the lecture starts.'}</p>}
            {interim ? <p className="text-sm italic text-ink-500">{interim}</p> : null}
          </div>

          {role === 'teacher' ? (
            <form onSubmit={sendManualCaption} className="flex min-w-0 gap-2">
              <Input
                className="min-w-0 flex-1"
                value={manualCaption}
                onChange={(event) => setManualCaption(event.target.value)}
                placeholder="Type a caption if speech recognition is unavailable"
                aria-label="Manual caption"
                maxLength={2000}
              />
              <Button type="submit" variant="brand" disabled={!manualCaption.trim() || !isLive} icon={Check}>Send</Button>
            </form>
          ) : null}
        </section>
      </div>

      <ClassroomMaterials classroomId={classroom?.id} role={role} />

      {role === 'teacher' ? (
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-brand-600" />
                <h2 className="font-display text-base font-semibold">People</h2>
              </div>
              <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                Live camera and microphone status reported by each participant.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="green">{mediaCounts.cameras} camera{mediaCounts.cameras === 1 ? '' : 's'} on</Badge>
              <Badge tone="violet">{mediaCounts.microphones} mic{mediaCounts.microphones === 1 ? '' : 's'} on</Badge>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {participants.map((person) => {
              const peerState = rtc.peerStates[person.connection_id]
              return (
                <div key={person.connection_id || `${person.user_id}-${person.role}`} className="rounded-2xl border border-ink-200/70 p-3 dark:border-ink-800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{person.full_name}</p>
                    <Badge tone={person.role === 'teacher' ? 'brand' : 'slate'}>{person.role}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{mediaSummary(person)}</p>
                  {person.role === 'student' ? (
                    <p className="mt-1 text-[11px] text-ink-400">
                      {peerState ? `Media: ${peerState}` : 'Media: not requested'}
                    </p>
                  ) : null}
                </div>
              )
            })}
            {!participants.length ? <p className="text-sm text-ink-400">No one is connected yet.</p> : null}
          </div>
        </section>
      ) : null}

      {deafMode ? (
        <section className="card p-5" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Hand className="h-5 w-5 text-violet-600 dark:text-violet-300" />
                <h2 className="font-display text-base font-semibold">ISL sign sequence</h2>
              </div>
              <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">Only catalogued signs are animated (experimental, not interpreter-reviewed); unsupported words remain text, never invented gestures.</p>
            </div>
            <Badge tone="violet">{signInfo?.coverage != null ? `${Math.round(signInfo.coverage * 100)}% mapped` : 'Waiting for caption'}</Badge>
          </div>
          <div className="mt-4">
            <Suspense fallback={<p className="py-8 text-center text-sm text-ink-500">Loading the 3D avatar…</p>}>
              <IslAvatar
                signs={signInfo}
                captionKey={currentCaption?.subtitle_id || currentCaption?.sequence || captions.length}
              />
            </Suspense>
          </div>
          {signGlosses.length ? (
            <div className="mt-4 flex flex-wrap gap-3">
              {signGlosses.map((item, index) => (
                <div key={`${item.gloss}-${index}`} className={`min-w-32 rounded-2xl border p-3 ${item.available ? 'border-violet-200 bg-violet-50 dark:border-violet-900/60 dark:bg-violet-950/30' : 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30'}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">{item.available ? reviewLabel(item.review_status || (item.verified ? 'interpreter_reviewed' : 'experimental')) : 'Text fallback'}</p>
                  <p className="mt-1 font-semibold">{item.label || item.gloss}</p>
                  {item.animation?.hands?.length ? <p className="mt-1 text-xs text-ink-500">{item.animation.hands.map((hand) => `${hand.handshape} hand · ${hand.location} · ${hand.movement}`).join(' / ')}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-ink-50 p-4 text-sm text-ink-500 dark:bg-ink-950/70 dark:text-ink-400">
              {signInfo?.fallback_message || 'Verified sign data will be shown when a caption is received. No random gestures are generated.'}
            </p>
          )}
          {signInfo?.fallback_message ? <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{signInfo.fallback_message}</p> : null}
        </section>
      ) : null}

      {role === 'student' ? (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-200/70 bg-white/60 p-4 dark:border-ink-800 dark:bg-ink-900/40">
          <Camera className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-semibold">Your camera & microphone</span>
          <span className="text-xs text-ink-500">
            {media.stream ? mediaSummary({ video_enabled: localVideoEnabled, audio_enabled: localAudioEnabled }) : 'Not shared with the teacher'}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {!media.stream ? (
              <Button onClick={startMedia} variant="brand" icon={Camera}>Enable camera & mic</Button>
            ) : (
              <>
                <Button onClick={toggleMicrophone} variant="ghost" icon={localAudioEnabled ? Mic : MicOff} aria-label="Toggle microphone" />
                <Button onClick={toggleCamera} variant="ghost" icon={localVideoEnabled ? Camera : CameraOff} aria-label="Toggle camera" />
                <Button onClick={stopMedia} variant="ghost" icon={VideoOff}>Stop</Button>
              </>
            )}
          </div>
          <p className="w-full text-xs text-ink-400">
            Your device status is shown to the teacher. Video from students is not streamed to the teacher in this version.
          </p>
        </section>
      ) : null}

      {role === 'student' ? (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-200/70 bg-white/60 p-4 dark:border-ink-800 dark:bg-ink-900/40">
          <Languages className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-semibold">Accessibility preferences</span>
          <label className="ml-auto flex items-center gap-2 text-xs text-ink-500">
            <input
              type="checkbox"
              checked={Boolean(preferences?.show_original)}
              onChange={(event) => updatePreferences({ show_original: event.target.checked })}
            />
            Show original captions
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-500">
            Font size
            <select
              className="select w-20"
              value={preferences?.subtitle_font_size || 24}
              onChange={(event) => updatePreferences({ subtitle_font_size: Number(event.target.value) })}
            >
              {[18, 22, 24, 30, 36].map((size) => <option key={size} value={size}>{size}px</option>)}
            </select>
          </label>
        </section>
      ) : null}

      {role === 'teacher' && !speech.supported ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">Browser speech recognition is unavailable. Use the manual caption field; captions are still sent through the same translation and sign pipeline.</p>
      ) : null}
    </div>
  )
}

export function TeacherClassroomDetail() {
  return <LiveClassroom role="teacher" />
}

export function StudentClassroomRoom() {
  return <LiveClassroom role="student" />
}

export default LiveClassroom
