import { useEffect, useState } from 'react'
import type { UserAccount } from '../dente-api'
import { getDenteApi } from '../lib/api'
import { useAuth } from '../lib/useAuth'
import { Button, Card, Input, Modal } from '../ui/components'

export function SettingsPage() {
  const { isAdmin, user } = useAuth()
  const [accounts, setAccounts] = useState<UserAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [passwords, setPasswords] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setErr(null)
      try {
        const data = await getDenteApi().auth.listUsers()
        if (!cancelled) setAccounts(data)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load users.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  async function savePassword(account: UserAccount) {
    const next = (passwords[account.id] ?? '').trim()
    if (next.length < 4) {
      setErr('Password must be at least 4 characters.')
      return
    }
    setErr(null)
    setSuccess(null)
    try {
      await getDenteApi().auth.changePassword(account.id, next)
      setPasswords((prev) => ({ ...prev, [account.id]: '' }))
      setSuccess(`Password updated for ${account.username}.`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update password.')
    }
  }

  if (!isAdmin) {
    return (
      <Card title="Settings" subtitle="Account management">
        <p className="text-sm text-slate-700">
          Only administrators can manage passwords. Contact your admin if you need a password change.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card
        title="User passwords"
        subtitle="Set passwords for clinic accounts. Passwords cannot be recovered from the app — reset requires editing the local database."
      >
        {loading ? <div className="text-sm text-slate-500">Loading accounts…</div> : null}
        {err ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {err}
          </div>
        ) : null}
        {success ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {success}
          </div>
        ) : null}

        <div className="space-y-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-900">{account.username}</div>
                  <div className="text-xs capitalize text-slate-500">{account.role}</div>
                </div>
                {user?.id === account.id ? (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                    You
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] flex-1">
                  <Input
                    label="New password"
                    type="password"
                    value={passwords[account.id] ?? ''}
                    onChange={(e) =>
                      setPasswords((prev) => ({ ...prev, [account.id]: e.target.value }))
                    }
                    hint="Minimum 4 characters"
                  />
                </div>
                <Button onClick={() => savePassword(account)}>Update password</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Password reset (offline)" subtitle="Emergency recovery only">
        <p className="text-sm text-slate-700">
          If an admin password is lost, stop the app and delete the <code>users</code> table from
          the local SQLite database at your Electron user data folder. On next launch, default
          accounts (admin/admin, manager/manager) will be recreated.
        </p>
      </Card>
    </div>
  )
}

export function SettingsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Modal title="Settings" open={open} onClose={onClose}>
      <SettingsPage />
    </Modal>
  )
}
