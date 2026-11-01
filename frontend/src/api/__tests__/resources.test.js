import test from 'node:test'
import assert from 'node:assert/strict'
import { createResourceApi, requireResourceId } from '../resources.js'

function createClient() {
  const calls = []
  const client = {}
  for (const method of ['get', 'post', 'delete']) {
    client[method] = (...args) => {
      calls.push({ method, args })
      return Promise.resolve({ data: {} })
    }
  }
  return { client, calls }
}

test('required resource IDs reject absent, empty, null, and invalid values', () => {
  for (const value of [undefined, null, '', '  ', false, true, 0, -1, 'not-an-id', 1.5]) {
    assert.throws(() => requireResourceId(value, 'recording_id'), /recording_id is required/)
  }
  assert.equal(requireResourceId('12', 'recording_id'), 12)
})

test('lecture and recording requests place selected IDs in the backend-defined fields', async () => {
  const { client, calls } = createClient()
  const resourceApi = createResourceApi(client)
  const form = new FormData()
  form.set('lecture_id', '')

  await resourceApi.startLecture(15, 'Biology')
  await resourceApi.startRecording(27)
  await resourceApi.saveRecording(27, form)
  await resourceApi.stopLecture(27)

  assert.deepEqual(calls.map(({ method, args }) => [method, ...args]), [
    ['post', '/teacher/lectures/start', { classroom_id: 15, title: 'Biology' }],
    ['post', '/recordings/start', { lecture_id: 27 }],
    ['post', '/recordings/stop', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    }],
    ['post', '/teacher/lectures/stop', { lecture_id: 27 }],
  ])
  assert.equal(form.get('lecture_id'), '27')
})

test('recording detail, playback, transcript, and deletion use the selected recording path ID', async () => {
  const { client, calls } = createClient()
  const resourceApi = createResourceApi(client)
  await resourceApi.getRecording('31', { params: { include_signs: true } })
  await resourceApi.getRecordingPlaybackToken(31)
  await resourceApi.getRecordingTranscript(31, { params: { language: 'hi' } })
  await resourceApi.deleteRecording(31)

  assert.deepEqual(calls.map(({ method, args }) => [method, args[0]]), [
    ['get', '/recordings/31'],
    ['post', '/recordings/31/playback-token'],
    ['get', '/recordings/31/transcript'],
    ['delete', '/recordings/31'],
  ])
})

test('material requests carry selected classroom and material IDs using endpoint contracts', async () => {
  const { client, calls } = createClient()
  const resourceApi = createResourceApi(client)
  const form = new FormData()
  form.set('classroom_id', '')

  await resourceApi.listMaterials('9')
  await resourceApi.uploadMaterial(9, form)
  await resourceApi.downloadMaterial('44')
  await resourceApi.deleteMaterial(44)

  assert.deepEqual(calls.map(({ method, args }) => [method, args[0], args[1]]), [
    ['get', '/materials', { params: { classroom_id: 9 } }],
    ['post', '/materials', form],
    ['get', '/materials/44/download', { responseType: 'blob' }],
    ['delete', '/materials/44', undefined],
  ])
  assert.deepEqual(calls[1].args[2], {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  assert.equal(form.get('classroom_id'), '9')
})

test('invalid IDs prevent all related network requests', async () => {
  const { client, calls } = createClient()
  const resourceApi = createResourceApi(client)

  assert.throws(() => resourceApi.startLecture(undefined), /classroom_id is required/)
  assert.throws(() => resourceApi.getRecording(''), /recording_id is required/)
  assert.throws(() => resourceApi.getRecordingPlaybackToken(null), /recording_id is required/)
  assert.throws(() => resourceApi.getRecordingTranscript('undefined'), /recording_id is required/)
  assert.throws(() => resourceApi.downloadMaterial(undefined), /material_id is required/)
  assert.throws(() => resourceApi.listMaterials(''), /classroom_id is required/)
  assert.throws(() => resourceApi.uploadMaterial(null, new FormData()), /classroom_id is required/)
  assert.equal(calls.length, 0)
})

test('student recording requests rely on the authenticated session instead of a student ID parameter', async () => {
  const { client, calls } = createClient()
  await createResourceApi(client).listStudentRecordings()
  assert.deepEqual(calls, [{ method: 'get', args: ['/student/recordings'] }])
})
