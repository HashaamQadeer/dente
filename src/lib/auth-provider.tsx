import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { UserRole } from '../dente-api'
import { getDenteApi } from './api'
import { AuthContext, type AuthContextValue } from './auth-context'

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthContextValue['user']>(null)
  const [loading, setLoading] = useState(true)

  const refreshSession = useCallback(async () => {
    const session = await getDenteApi().auth.getSession()
    setUser(session)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const session = await getDenteApi().auth.getSession()
        if (!cancelled) setUser(session)
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const session = await getDenteApi().auth.login(username, password)
    setUser(session)
  }, [])

  const logout = useCallback(async () => {
    await getDenteApi().auth.logout()
    setUser(null)
  }, [])

  const promptDeleteDenied = useCallback(() => {
    window.alert('Access denied. Only administrators can delete records.')
  }, [])

  const promptFinanceDenied = useCallback(() => {
    window.alert('Access denied. Finance data is only available to administrators.')
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const role = user?.role as UserRole | undefined
    const isAdmin = role === 'admin'
    const isManager = role === 'manager'
    return {
      user,
      loading,
      login,
      logout,
      refreshSession,
      isAdmin,
      isManager,
      roleLabel: isAdmin ? 'Admin' : isManager ? 'Manager' : '',
      canDelete: isAdmin,
      canViewFinance: isAdmin,
      promptDeleteDenied,
      promptFinanceDenied,
    }
  }, [user, loading, login, logout, refreshSession, promptDeleteDenied, promptFinanceDenied])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
