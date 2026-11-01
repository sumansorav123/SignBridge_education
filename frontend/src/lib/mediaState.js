/**
 * Pure helpers for merging camera/microphone state from presence and media
 * events. The teacher roster uses these so a student turning a device off is
 * reflected immediately without a page refresh.
 */

export function normaliseMediaFlags(source = {}) {
  const audio = source.audio_enabled ?? source.microphone_enabled ?? source.audio
  const video = source.video_enabled ?? source.camera_enabled ?? source.video
  return {
    audio_enabled: Boolean(audio),
    video_enabled: Boolean(video),
  }
}

export function mergeParticipantMedia(participants, message) {
  if (!message?.type) return participants || []
  if (message.type === 'presence') {
    return (message.participants || []).map((person) => ({
      ...person,
      ...normaliseMediaFlags(person),
    }))
  }
  if (message.type === 'participant-media' || message.type === 'teacher-media') {
    const connectionId =
      message.student?.connection_id || message.participant?.connection_id || message.connection_id
    if (!connectionId) return participants || []
    const flags = normaliseMediaFlags({ ...message, ...(message.student || {}) })
    let found = false
    const next = (participants || []).map((person) => {
      if (person.connection_id !== connectionId) return person
      found = true
      return { ...person, ...(message.student || {}), ...flags }
    })
    if (found) return next
    const person = message.student || message.participant
    return person ? [...next, { ...person, ...flags }] : next
  }
  return participants || []
}

export function countMedia(participants = []) {
  return participants.reduce(
    (counts, person) => {
      if (person.audio_enabled) counts.microphones += 1
      if (person.video_enabled) counts.cameras += 1
      return counts
    },
    { microphones: 0, cameras: 0 },
  )
}

export function mediaSummary(person) {
  if (!person) return 'No media state'
  const camera = person.video_enabled ? 'camera on' : 'camera off'
  const microphone = person.audio_enabled ? 'mic on' : 'mic off'
  return `${camera}, ${microphone}`
}
