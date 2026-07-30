import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/** @type {{ id: number, username: string, role: 'admin' | 'manager' } | null} */
let currentSession = null

function sessionFilePath() {
  return path.join(app.getPath('userData'), 'session.json')
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const test = crypto.scryptSync(password, salt, 64).toString('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'))
  } catch {
    return false
  }
}

function persistSession() {
  const file = sessionFilePath()
  if (!currentSession) {
    try {
      fs.unlinkSync(file)
    } catch {
      // no saved session
    }
    return
  }
  fs.writeFileSync(file, JSON.stringify(currentSession), 'utf8')
}

export function restoreSession(usersRepo) {
  try {
    const raw = fs.readFileSync(sessionFilePath(), 'utf8')
    const saved = JSON.parse(raw)
    const user = usersRepo.findById(saved.id)
    if (!user || user.username !== saved.username || user.role !== saved.role) {
      clearSession()
      return null
    }
    currentSession = { id: user.id, username: user.username, role: user.role }
    return currentSession
  } catch {
    currentSession = null
    return null
  }
}

export function setSession(user) {
  currentSession = user ? { id: user.id, username: user.username, role: user.role } : null
  persistSession()
  return currentSession
}

export function getSession() {
  return currentSession
}

export function requireSession() {
  if (!currentSession) {
    throw new Error('Not authenticated. Please log in.')
  }
  return currentSession
}

export function requireAdmin() {
  const session = requireSession()
  if (session.role !== 'admin') {
    throw new Error('Access denied. Admin privileges required.')
  }
  return session
}

export function clearSession() {
  currentSession = null
  persistSession()
}
