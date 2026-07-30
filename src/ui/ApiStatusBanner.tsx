import { useEffect, useState } from 'react'
import { getDenteApi, getDenteApiUnavailableMessage, isDenteApiAvailable } from '../lib/api'

export function ApiStatusBanner() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!isDenteApiAvailable()) {
        setError(getDenteApiUnavailableMessage())
        return
      }
      try {
        await getDenteApi().patients.list()
        if (!cancelled) setError(null)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load data from the local database.')
        }
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  if (!error) return null

  return (
    <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      {error}
    </div>
  )
}
