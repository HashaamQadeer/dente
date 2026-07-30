import { createContext } from 'react'
import type { AuthUser } from '../dente-api'

export type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  isAdmin: boolean
  isManager: boolean
  roleLabel: string
  canDelete: boolean
  canViewFinance: boolean
  promptDeleteDenied: () => void
  promptFinanceDenied: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
