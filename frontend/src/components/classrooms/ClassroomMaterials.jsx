import { useCallback, useEffect, useState } from 'react'
import { Download, FileText, Upload } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/context/ToastContext'
import { errorMessage } from '@/api/client'
import { resources } from '@/api/resourceClient'

export default function ClassroomMaterials({ classroomId, role }) {
  const { success, error: toastError } = useToast()
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [downloadingId, setDownloadingId] = useState(null)

  const loadMaterials = useCallback(async (isActive = () => true) => {
    setLoading(true)
    setLoadError('')
    try {
      const { data } = await resources.listMaterials(classroomId)
      if (isActive()) setMaterials(data)
    } catch (error) {
      if (isActive()) setLoadError(errorMessage(error, 'Could not load classroom materials.'))
    } finally {
      if (isActive()) setLoading(false)
    }
  }, [classroomId])

  useEffect(() => {
    let active = true
    void loadMaterials(() => active)
    return () => {
      active = false
    }
  }, [loadMaterials])

  async function upload(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    if (!title.trim() || !file) {
      toastError('Material details required', 'Enter a title and select a learning material file.')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.set('title', title.trim())
      form.set('file', file)
      await resources.uploadMaterial(classroomId, form)
      setTitle('')
      setFile(null)
      formElement.reset()
      success('Material shared', 'Students enrolled in this classroom can access the file.')
      await loadMaterials()
    } catch (error) {
      toastError('Could not upload material', errorMessage(error))
    } finally {
      setUploading(false)
    }
  }

  async function download(material) {
    setDownloadingId(material.id)
    try {
      const { data } = await resources.downloadMaterial(material.id)
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = material.original_filename || material.title || 'learning-material'
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      toastError('Could not download material', errorMessage(error))
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-600" />
            <h2 className="font-display text-base font-semibold">Learning materials</h2>
          </div>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            Materials shared with this classroom.
          </p>
        </div>
        {loading ? <span className="text-xs text-ink-500">Loading…</span> : null}
      </div>

      {loadError ? (
        <p className="mt-4 text-sm text-rose-600 dark:text-rose-300" role="alert">{loadError}</p>
      ) : materials.length ? (
        <ul className="mt-4 divide-y divide-ink-200/70 dark:divide-ink-800">
          {materials.map((material) => (
            <li key={material.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{material.title}</p>
                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                  {material.original_filename}
                  {material.description ? ` · ${material.description}` : ''}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                icon={Download}
                loading={downloadingId === material.id}
                disabled={downloadingId !== null && downloadingId !== material.id}
                onClick={() => download(material)}
              >
                Download
              </Button>
            </li>
          ))}
        </ul>
      ) : !loading ? (
        <p className="mt-4 text-sm text-ink-500 dark:text-ink-400">No learning materials have been shared yet.</p>
      ) : null}

      {role === 'teacher' ? (
        <form onSubmit={upload} className="mt-5 grid gap-3 border-t border-ink-200/70 pt-5 dark:border-ink-800 sm:grid-cols-[1fr_1.2fr_auto] sm:items-end">
          <label className="block">
            <span className="label">Material title</span>
            <input
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
            />
          </label>
          <label className="block">
            <span className="label">File</span>
            <input
              className="input"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              required
            />
          </label>
          <Button type="submit" variant="brand" icon={Upload} loading={uploading} disabled={!title.trim() || !file}>
            Share material
          </Button>
        </form>
      ) : null}
    </section>
  )
}
