import { useEffect, useState } from 'react'
import { getDenteApiUnavailableMessage, isDenteApiAvailable } from '../lib/api'
import { useAuth } from '../lib/useAuth'
import { Button, Card, Input } from '../ui/components'
import { AppLogo } from '../ui/AppLogo'

const APP_VERSION = 'v4.0.1'

export function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const apiUnavailable = !isDenteApiAvailable()

  useEffect(() => {
    if (apiUnavailable) {
      setErr(getDenteApiUnavailableMessage())
    }
  }, [apiUnavailable])

  async function onSubmit(e: React.FormEvent) {
    if (apiUnavailable) return
    e.preventDefault()
    setLoading(true)
    setErr(null)
    try {
      await login(username.trim(), password)
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <AppLogo size="md" className="mx-auto" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-900">Sign in to Dente</h1>
          <p className="mt-2 text-sm text-slate-500">Offline dental clinic manager · {APP_VERSION}</p>
        </div>

        <Card title="Login" subtitle="Use your clinic account credentials.">
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input
              label="Username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {err ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {err}
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading || apiUnavailable}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-4 text-xs text-slate-500">
            Default accounts: admin / admin and manager / manager. Change passwords from Settings
            (admin only). Forgotten passwords can only be reset from the database.
          </p>
        </Card>
      </div>
    </div>
  )
}
