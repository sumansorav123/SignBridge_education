import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  canApplyAnswer,
  deriveConnectionState,
  enqueueCandidate,
  isDuplicateOffer,
  isPeerDead,
  nextPeerRetryDelay,
  parseCandidate,
  shouldRetryPeer,
} from '@/lib/webrtcSignaling'
import { iceServersFromViteEnv } from '@/lib/iceServers'

// STUN by default; TURN is added only when VITE_TURN_* variables are set.
// See frontend/.env.example and docs/DEPLOYMENT.md. TURN is untested until a
// real TURN server has been configured and exercised.
const ICE_SERVERS = iceServersFromViteEnv()

const DISCONNECT_GRACE_MS = 5000

/**
 * Classroom WebRTC mesh with bounded retries.
 *
 * The teacher sends one outbound stream to every requesting student. Students
 * answer. Every peer has an independent retry budget and exponential backoff;
 * dead peers are detached and removed instead of being retried forever.
 */
export default function useWebRTC({ role, socket, localStream, onRemoteStream, onPeerState }) {
  const peersRef = useRef(new Map())
  const pendingRequestsRef = useRef(new Map())
  const pendingIceRef = useRef(new Map())
  const teacherAttemptsRef = useRef(new Map())
  const studentAttemptsRef = useRef(new Map())
  // One pending retry timer per peer so a burst of failures can never stack
  // duplicate offers / request-stream calls.
  const retryTimersRef = useRef(new Map())
  const localStreamRef = useRef(localStream)
  const onRemoteRef = useRef(onRemoteStream)
  const onPeerRef = useRef(onPeerState)
  const roleRef = useRef(role)
  const socketRef = useRef(socket)
  const [teacherOnline, setTeacherOnline] = useState(null)
  const [peerStates, setPeerStates] = useState({})
  const [peerCount, setPeerCount] = useState(0)

  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  useEffect(() => {
    onRemoteRef.current = onRemoteStream
    onPeerRef.current = onPeerState
  }, [onRemoteStream, onPeerState])

  useEffect(() => {
    roleRef.current = role
    socketRef.current = socket
  }, [role, socket])

  const reportPeer = useCallback((connectionId, state) => {
    setPeerStates((current) => {
      if (!connectionId) return current
      const next = { ...current }
      if (state === 'closed') delete next[connectionId]
      else next[connectionId] = state
      return next
    })
    onPeerRef.current?.(connectionId, state)
  }, [])

  const sendSignal = useCallback((type, targetConnectionId, payload = {}) => {
    const activeSocket = socketRef.current
    if (!activeSocket?.send || !targetConnectionId) return false
    return activeSocket.send({ type, target_connection_id: targetConnectionId, ...payload })
  }, [])

  const clearPeerTimers = useCallback((entry) => {
    if (!entry) return
    window.clearTimeout(entry.retryTimer)
    window.clearTimeout(entry.disconnectTimer)
    entry.retryTimer = null
    entry.disconnectTimer = null
  }, [])

  const detachPeer = useCallback((entry) => {
    if (!entry?.pc) return
    const pc = entry.pc
    try {
      pc.onicecandidate = null
      pc.ontrack = null
      pc.onconnectionstatechange = null
      pc.oniceconnectionstatechange = null
      pc.onnegotiationneeded = null
      pc.ondatachannel = null
      pc.onaddstream = null
      pc.close()
    } catch {
      /* already closed */
    }
  }, [])

  const closePeer = useCallback(
    (connectionId, { notify = true } = {}) => {
      const entry = peersRef.current.get(connectionId)
      if (entry) clearPeerTimers(entry)
      detachPeer(entry)
      peersRef.current.delete(connectionId)
      pendingIceRef.current.delete(connectionId)
      if (notify) {
        // An explicit close (peer left) cancels any queued reconnect for it.
        window.clearTimeout(retryTimersRef.current.get(connectionId))
        retryTimersRef.current.delete(connectionId)
      }
      setPeerCount(peersRef.current.size)
      if (notify) reportPeer(connectionId, 'closed')
      if (!peersRef.current.size) onRemoteRef.current?.(null)
    },
    [clearPeerTimers, detachPeer, reportPeer],
  )

  const transferPendingIce = useCallback((connectionId, entry) => {
    const queued = pendingIceRef.current.get(connectionId)
    if (queued?.length) {
      entry.iceQueue = enqueueCandidate(entry.iceQueue, queued[0])
      for (const candidate of queued.slice(1)) {
        entry.iceQueue = enqueueCandidate(entry.iceQueue, candidate)
      }
      pendingIceRef.current.delete(connectionId)
    }
  }, [])

  const flushIce = useCallback(async (connectionId) => {
    const entry = peersRef.current.get(connectionId)
    if (!entry?.pc?.remoteDescription) return
    const queued = entry.iceQueue || []
    entry.iceQueue = []
    for (const candidate of queued) {
      const key = `${candidate.sdpMid ?? ''}|${candidate.sdpMLineIndex ?? ''}|${candidate.candidate}`
      if (entry.seenCandidates.has(key)) continue
      try {
        await entry.pc.addIceCandidate(candidate)
        entry.seenCandidates.add(key)
      } catch {
        /* candidates can legitimately fail after a renegotiation */
      }
    }
  }, [])

  const replaceTracks = useCallback((entry, stream) => {
    if (!entry?.pc || !stream) return
    const pc = entry.pc
    const senders = pc.getSenders()
    for (const track of stream.getTracks()) {
      const sender = senders.find((item) => item.track?.kind === track.kind)
      if (sender) {
        sender.replaceTrack(track).catch(() => {
          /* the peer may have closed between frames */
        })
      } else {
        try {
          pc.addTrack(track, stream)
        } catch {
          /* ignore a closing peer */
        }
      }
    }
  }, [])

  const retryStudentConnection = useCallback(
    (teacherConnectionId, attempt = 0) => {
      const nextAttemptNumber = attempt + 1
      if (!shouldRetryPeer(attempt)) {
        studentAttemptsRef.current.delete(teacherConnectionId)
        reportPeer(teacherConnectionId, 'failed')
        return
      }
      studentAttemptsRef.current.set(teacherConnectionId, nextAttemptNumber)
      reportPeer(teacherConnectionId, 'reconnecting')
      window.clearTimeout(retryTimersRef.current.get(teacherConnectionId))
      retryTimersRef.current.set(
        teacherConnectionId,
        window.setTimeout(() => {
          retryTimersRef.current.delete(teacherConnectionId)
          if (!peersRef.current.has(teacherConnectionId) && roleRef.current === 'student') {
            socketRef.current?.send({ type: 'request-stream' })
          }
        }, nextPeerRetryDelay(nextAttemptNumber)),
      )
    },
    [reportPeer],
  )

  const schedulePeerRetry = useCallback(
    (connectionId) => {
      const entry = peersRef.current.get(connectionId)
      if (!entry) return
      clearPeerTimers(entry)
      const attempt = (entry.retryAttempt || 0) + 1
      entry.retryAttempt = attempt
      if (entry.role === 'teacher') teacherAttemptsRef.current.set(connectionId, attempt)
      else studentAttemptsRef.current.set(connectionId, attempt)
      if (!shouldRetryPeer(attempt - 1)) {
        reportPeer(connectionId, 'failed')
        closePeer(connectionId, { notify: false })
        setPeerStates((current) => ({ ...current, [connectionId]: 'failed' }))
        return
      }
      reportPeer(connectionId, 'reconnecting')
      const delay = nextPeerRetryDelay(attempt)
      entry.retryTimer = window.setTimeout(() => {
        if (roleRef.current === 'teacher') {
          const student = entry.student
          closePeer(connectionId, { notify: false })
          if (student && localStreamRef.current) createTeacherPeerRef.current?.(student, { force: true })
        } else {
          closePeer(connectionId, { notify: false })
          retryStudentConnection(connectionId, attempt)
        }
      }, delay)
    },
    [clearPeerTimers, closePeer, reportPeer, retryStudentConnection],
  )

  const createTeacherPeer = useCallback(
    async (student, { force = false } = {}) => {
      const stream = localStreamRef.current
      if (!stream || !student?.connection_id) {
        if (student?.connection_id) pendingRequestsRef.current.set(student.connection_id, student)
        return null
      }
      const connectionId = student.connection_id
      const existing = peersRef.current.get(connectionId)
      if (existing && !force) {
        if (!isPeerDead(existing.pc.connectionState) && existing.pc.signalingState !== 'closed') {
          return existing
        }
        closePeer(connectionId, { notify: false })
      } else if (existing) {
        closePeer(connectionId, { notify: false })
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      const entry = {
        pc,
        role: 'teacher',
        student,
        name: student.full_name || 'Student',
        iceQueue: [],
        seenCandidates: new Set(),
        remoteSdp: null,
        answerSdp: null,
        retryAttempt: teacherAttemptsRef.current.get(connectionId) || 0,
      }
      peersRef.current.set(connectionId, entry)
      transferPendingIce(connectionId, entry)
      setPeerCount(peersRef.current.size)
      reportPeer(connectionId, 'connecting')

      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal('webrtc-ice', connectionId, {
            candidate: JSON.stringify(event.candidate),
          })
        }
      }
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        reportPeer(connectionId, state)
        if (state === 'connected') {
          entry.retryAttempt = 0
          teacherAttemptsRef.current.delete(connectionId)
          window.clearTimeout(entry.disconnectTimer)
        } else if (state === 'disconnected') {
          window.clearTimeout(entry.disconnectTimer)
          entry.disconnectTimer = window.setTimeout(() => {
            if (pc.connectionState === 'disconnected') schedulePeerRetry(connectionId)
          }, DISCONNECT_GRACE_MS)
        } else if (state === 'failed') {
          schedulePeerRetry(connectionId)
        } else if (state === 'closed') {
          closePeer(connectionId, { notify: false })
        }
      }
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          try {
            pc.restartIce()
          } catch {
            schedulePeerRetry(connectionId)
          }
        }
      }

      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        sendSignal('webrtc-offer', connectionId, { sdp: offer.sdp })
        return entry
      } catch {
        const attempt = (entry.retryAttempt || 0) + 1
        closePeer(connectionId, { notify: false })
        if (shouldRetryPeer(attempt - 1)) {
          teacherAttemptsRef.current.set(connectionId, attempt)
          reportPeer(connectionId, 'reconnecting')
          window.clearTimeout(retryTimersRef.current.get(connectionId))
          retryTimersRef.current.set(
            connectionId,
            window.setTimeout(() => {
              retryTimersRef.current.delete(connectionId)
              createTeacherPeerRef.current?.(student, { force: true })
            }, nextPeerRetryDelay(attempt)),
          )
        } else {
          teacherAttemptsRef.current.delete(connectionId)
          reportPeer(connectionId, 'failed')
        }
        return null
      }
    },
    [closePeer, reportPeer, schedulePeerRetry, sendSignal, transferPendingIce],
  )

  const createTeacherPeerRef = useRef(createTeacherPeer)
  useEffect(() => {
    createTeacherPeerRef.current = createTeacherPeer
  }, [createTeacherPeer])

  const ensureStudentPeer = useCallback(
    async (teacherConnectionId) => {
      if (!teacherConnectionId) return null
      const existing = peersRef.current.get(teacherConnectionId)
      if (existing?.pc && existing.pc.signalingState !== 'closed') return existing
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      const entry = {
        pc,
        role: 'student',
        teacherConnectionId,
        iceQueue: [],
        seenCandidates: new Set(),
        remoteSdp: null,
        // Seed from the shared budget so a retry that recreates the peer does
        // not reset the attempt counter and loop forever.
        retryAttempt: studentAttemptsRef.current.get(teacherConnectionId) || 0,
      }
      peersRef.current.set(teacherConnectionId, entry)
      transferPendingIce(teacherConnectionId, entry)
      setPeerCount(peersRef.current.size)
      reportPeer(teacherConnectionId, 'connecting')

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal('webrtc-ice', teacherConnectionId, {
            candidate: JSON.stringify(event.candidate),
          })
        }
      }
      pc.ontrack = (event) => {
        if (event.streams?.[0]) onRemoteRef.current?.(event.streams[0])
        else if (event.track) onRemoteRef.current?.(new MediaStream([event.track]))
      }
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        reportPeer(teacherConnectionId, state)
        if (state === 'connected') {
          entry.retryAttempt = 0
          window.clearTimeout(entry.disconnectTimer)
        } else if (state === 'disconnected') {
          window.clearTimeout(entry.disconnectTimer)
          entry.disconnectTimer = window.setTimeout(() => {
            if (pc.connectionState === 'disconnected') schedulePeerRetry(teacherConnectionId)
          }, DISCONNECT_GRACE_MS)
        } else if (state === 'failed') {
          schedulePeerRetry(teacherConnectionId)
        } else if (state === 'closed') {
          closePeer(teacherConnectionId, { notify: false })
        }
      }
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          try {
            pc.restartIce()
          } catch {
            schedulePeerRetry(teacherConnectionId)
          }
        }
      }
      return entry
    },
    [closePeer, reportPeer, schedulePeerRetry, sendSignal, transferPendingIce],
  )

  const requestStream = useCallback(() => {
    if (roleRef.current !== 'student') return false
    return socketRef.current?.send({ type: 'request-stream' }) || false
  }, [])

  // Create peers for students that asked before the teacher enabled a camera.
  useEffect(() => {
    localStreamRef.current = localStream
    if (role !== 'teacher') return
    if (localStream) {
      const pending = [...pendingRequestsRef.current.values()]
      pendingRequestsRef.current.clear()
      pending.forEach((student) => createTeacherPeer(student))
      for (const entry of peersRef.current.values()) replaceTracks(entry, localStream)
    }
  }, [role, localStream, createTeacherPeer, replaceTracks])

  useEffect(() => {
    if (!socket?.subscribe) return undefined
    const unsubscribe = socket.subscribe(async (message) => {
      if (role === 'teacher') {
        if (message.type === 'student-request-stream' && message.student?.connection_id) {
          await createTeacherPeer(message.student)
          return
        }
        if (message.type === 'webrtc-answer') {
          const entry = peersRef.current.get(message.from_connection_id)
          if (!entry?.pc) return
          if (!canApplyAnswer(entry.pc.signalingState)) return
          if (entry.answerSdp && entry.answerSdp === message.sdp) return
          try {
            await entry.pc.setRemoteDescription({ type: 'answer', sdp: message.sdp })
            entry.answerSdp = message.sdp
            entry.retryAttempt = 0
            await flushIce(message.from_connection_id)
          } catch {
            schedulePeerRetry(message.from_connection_id)
          }
          return
        }
        if (message.type === 'webrtc-ice') {
          await receiveIce(message)
          return
        }
        if (message.type === 'presence') {
          const students = (message.participants || []).filter((item) => item.role === 'student')
          const ids = new Set(students.map((item) => item.connection_id))
          for (const connectionId of [...peersRef.current.keys()]) {
            if (!ids.has(connectionId)) {
              teacherAttemptsRef.current.delete(connectionId)
              pendingRequestsRef.current.delete(connectionId)
              closePeer(connectionId)
            }
          }
          for (const student of students) {
            if (!peersRef.current.has(student.connection_id)) {
              pendingRequestsRef.current.set(student.connection_id, student)
            }
          }
          if (localStreamRef.current) {
            const waiting = [...pendingRequestsRef.current.values()]
            pendingRequestsRef.current.clear()
            waiting.forEach((student) => createTeacherPeer(student))
          }
        }
        return
      }

      if (message.type === 'webrtc-offer') {
        const teacherConnectionId = message.from_connection_id
        if (!teacherConnectionId || !message.sdp) return
        const existing = peersRef.current.get(teacherConnectionId)
        if (existing && isDuplicateOffer(existing, message.sdp)) return
        if (existing) closePeer(teacherConnectionId, { notify: false })
        const entry = await ensureStudentPeer(teacherConnectionId)
        if (!entry?.pc) return
        try {
          await entry.pc.setRemoteDescription({ type: 'offer', sdp: message.sdp })
          entry.remoteSdp = message.sdp
          const answer = await entry.pc.createAnswer()
          await entry.pc.setLocalDescription(answer)
          sendSignal('webrtc-answer', teacherConnectionId, { sdp: answer.sdp })
          await flushIce(teacherConnectionId)
        } catch {
          closePeer(teacherConnectionId, { notify: false })
          retryStudentConnection(teacherConnectionId, 0)
        }
        return
      }
      if (message.type === 'webrtc-ice') {
        await receiveIce(message)
        return
      }
      if (message.type === 'ready') {
        const hasTeacher = (message.participants || []).some((item) => item.role === 'teacher')
        setTeacherOnline(hasTeacher)
        if (hasTeacher) requestStream()
        return
      }
      if (message.type === 'presence') {
        const hasTeacher = (message.participants || []).some((item) => item.role === 'teacher')
        setTeacherOnline(hasTeacher)
        if (!hasTeacher) {
          studentAttemptsRef.current.clear()
          for (const connectionId of [...peersRef.current.keys()]) closePeer(connectionId)
          onRemoteRef.current?.(null)
        }
        return
      }
      if (message.type === 'teacher-joined') {
        setTeacherOnline(true)
        requestStream()
        return
      }
      if (message.type === 'teacher-offline' || message.type === 'teacher-left') {
        setTeacherOnline(false)
        studentAttemptsRef.current.clear()
        for (const connectionId of [...peersRef.current.keys()]) closePeer(connectionId)
        onRemoteRef.current?.(null)
      }
    })

    async function receiveIce(message) {
      const connectionId = message.from_connection_id
      const candidate = parseCandidate(message.candidate)
      if (!connectionId || !candidate) return
      const entry = peersRef.current.get(connectionId)
      if (!entry) {
        pendingIceRef.current.set(
          connectionId,
          enqueueCandidate(pendingIceRef.current.get(connectionId), candidate),
        )
        return
      }
      const key = `${candidate.sdpMid ?? ''}|${candidate.sdpMLineIndex ?? ''}|${candidate.candidate}`
      if (entry.seenCandidates.has(key)) return
      if (!entry.pc.remoteDescription) {
        entry.iceQueue = enqueueCandidate(entry.iceQueue, candidate)
        return
      }
      try {
        await entry.pc.addIceCandidate(candidate)
        entry.seenCandidates.add(key)
      } catch {
        /* ignore candidates for a closing peer */
      }
    }

    return unsubscribe
  }, [
    role,
    socket,
    createTeacherPeer,
    ensureStudentPeer,
    closePeer,
    flushIce,
    requestStream,
    retryStudentConnection,
    schedulePeerRetry,
    sendSignal,
  ])

  useEffect(
    () => () => {
      for (const connectionId of [...peersRef.current.keys()]) closePeer(connectionId, { notify: false })
      for (const timer of retryTimersRef.current.values()) window.clearTimeout(timer)
      retryTimersRef.current.clear()
      pendingRequestsRef.current.clear()
      pendingIceRef.current.clear()
    },
    [closePeer],
  )

  const connectionState = useMemo(() => deriveConnectionState(peerStates), [peerStates])

  return {
    teacherOnline,
    peerCount,
    peerStates,
    connectionState,
    requestStream,
    reconnectPeer: (connectionId) => {
      const entry = peersRef.current.get(connectionId)
      if (!entry) return
      if (role === 'teacher' && entry.student) {
        createTeacherPeer(entry.student, { force: true })
      } else {
        closePeer(connectionId)
        retryStudentConnection(connectionId, 0)
      }
    },
  }
}
