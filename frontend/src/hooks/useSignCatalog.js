import { useEffect, useState } from 'react'
import api from '@/api/client'

let cache = null
let pending = null

async function fetchCatalog() {
  if (cache) return cache
  if (!pending) {
    pending = api
      .get('/sign-language/animations', { params: { language: 'isl' } })
      .then(({ data }) => {
        const map = new Map()
        for (const item of data.animations || []) map.set(item.gloss, item)
        cache = { ...data, map }
        return cache
      })
      .finally(() => {
        pending = null
      })
  }
  return pending
}

export default function useSignCatalog(enabled = true, language = 'isl') {
  const [catalog, setCatalog] = useState(language === 'isl' ? cache : null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    fetchCatalog()
      .then((data) => {
        if (alive) {
          setCatalog(data)
          setError('')
        }
      })
      .catch((err) => {
        if (alive) setError(err?.response?.data?.detail || 'The sign catalog could not be loaded. Unmapped words will appear as text cards.')
      })
    return () => {
      alive = false
    }
  }, [enabled])

  return { catalog, error }
}
