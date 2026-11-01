export function requireResourceId(value, field) {
  const candidate = typeof value === 'string' ? value.trim() : value
  const validType = typeof candidate === 'string' || typeof candidate === 'number'
  const validString = typeof candidate !== 'string' || /^\d+$/.test(candidate)
  const parsed = validType && validString ? Number(candidate) : Number.NaN
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${field} is required and must be a positive integer.`)
  }
  return parsed
}

function setFormId(form, field, value) {
  if (!form || typeof form.set !== 'function') {
    throw new TypeError('A FormData payload is required.')
  }
  form.set(field, String(value))
}

export function createResourceApi(client) {
  return {
    startLecture(classroomId, title = null) {
      return client.post('/teacher/lectures/start', {
        classroom_id: requireResourceId(classroomId, 'classroom_id'),
        title,
      })
    },
    stopLecture(lectureId) {
      return client.post('/teacher/lectures/stop', {
        lecture_id: requireResourceId(lectureId, 'lecture_id'),
      })
    },
    startRecording(lectureId) {
      return client.post('/recordings/start', {
        lecture_id: requireResourceId(lectureId, 'lecture_id'),
      })
    },
    saveRecording(lectureId, form) {
      const validLectureId = requireResourceId(lectureId, 'lecture_id')
      setFormId(form, 'lecture_id', validLectureId)
      return client.post('/recordings/stop', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      })
    },
    getRecording(recordingId, config) {
      return client.get(
        `/recordings/${requireResourceId(recordingId, 'recording_id')}`,
        config,
      )
    },
    getRecordingPlaybackToken(recordingId) {
      return client.post(
        `/recordings/${requireResourceId(recordingId, 'recording_id')}/playback-token`,
      )
    },
    getRecordingTranscript(recordingId, config) {
      return client.get(
        `/recordings/${requireResourceId(recordingId, 'recording_id')}/transcript`,
        config,
      )
    },
    deleteRecording(recordingId) {
      return client.delete(`/recordings/${requireResourceId(recordingId, 'recording_id')}`)
    },
    listMaterials(classroomId) {
      return client.get('/materials', {
        params: { classroom_id: requireResourceId(classroomId, 'classroom_id') },
      })
    },
    uploadMaterial(classroomId, form) {
      const validClassroomId = requireResourceId(classroomId, 'classroom_id')
      setFormId(form, 'classroom_id', validClassroomId)
      return client.post('/materials', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    downloadMaterial(materialId) {
      return client.get(
        `/materials/${requireResourceId(materialId, 'material_id')}/download`,
        { responseType: 'blob' },
      )
    },
    deleteMaterial(materialId) {
      return client.delete(`/materials/${requireResourceId(materialId, 'material_id')}`)
    },
    listStudentRecordings() {
      return client.get('/student/recordings')
    },
  }
}
