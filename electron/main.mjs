import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  clearSession,
  getSession,
  hashPassword,
  requireAdmin,
  requireSession,
  restoreSession,
  setSession,
  verifyPassword,
} from './server/auth.mjs'
import {
  appointmentsRepo,
  createDb,
  expensesRepo,
  financeRepo,
  medicalHistoryRepo,
  patientsRepo,
  proceduresRepo,
  treatmentPlansRepo,
  usersRepo,
} from './server/db.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow = null

function createWindow() {
  const appRoot = app.getAppPath()
  const preloadPath = path.join(__dirname, 'preload.cjs')
  const indexHtml = path.join(appRoot, 'dist', 'index.html')

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#f7f8fb',
    title: 'Dente v4',
    icon: path.join(appRoot, 'build', 'icon.png'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(indexHtml)
  }

  mainWindow.webContents.on('did-fail-load', (_evt, code, description, url) => {
    console.error('Failed to load page:', code, description, url)
  })

  mainWindow.webContents.on('preload-error', (_evt, failedPreloadPath, error) => {
    console.error('Preload failed to load:', failedPreloadPath, error)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  try {
    createDb()
    restoreSession(usersRepo)
    console.log('Database ready at', path.join(app.getPath('userData'), 'dente.sqlite'))
  } catch (err) {
    console.error('Database failed to start:', err)
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('auth:login', (_evt, username, password) => {
  const user = usersRepo.findByUsername(String(username ?? ''))
  if (!user || !verifyPassword(String(password ?? ''), user.password_hash)) {
    throw new Error('Invalid username or password.')
  }
  return setSession(user)
})

ipcMain.handle('auth:logout', () => {
  clearSession()
  return null
})

ipcMain.handle('auth:getSession', () => getSession())

ipcMain.handle('auth:listUsers', () => {
  requireAdmin()
  return usersRepo.list()
})

ipcMain.handle('auth:changePassword', (_evt, userId, newPassword) => {
  requireAdmin()
  const password = String(newPassword ?? '').trim()
  if (password.length < 4) {
    throw new Error('Password must be at least 4 characters.')
  }
  const user = usersRepo.findById(userId)
  if (!user) throw new Error('User not found.')
  return usersRepo.updatePassword(userId, hashPassword(password))
})

ipcMain.handle('patients:list', () => {
  requireSession()
  return patientsRepo.list()
})
ipcMain.handle('patients:search', (_evt, query) => {
  requireSession()
  return patientsRepo.searchByName(query)
})
ipcMain.handle('patients:create', (_evt, payload) => {
  requireSession()
  return patientsRepo.create(payload)
})
ipcMain.handle('patients:update', (_evt, id, payload) => {
  requireSession()
  return patientsRepo.update(id, payload)
})
ipcMain.handle('patients:delete', (_evt, id) => {
  requireAdmin()
  return patientsRepo.remove(id)
})

ipcMain.handle('procedures:listByPatient', (_evt, patientId) => {
  requireSession()
  return proceduresRepo.listByPatient(patientId)
})
ipcMain.handle('procedures:create', (_evt, patientId, payload) => {
  requireSession()
  return proceduresRepo.create(patientId, payload)
})
ipcMain.handle('procedures:update', (_evt, id, payload) => {
  requireSession()
  return proceduresRepo.update(id, payload)
})
ipcMain.handle('procedures:delete', (_evt, id) => {
  requireAdmin()
  return proceduresRepo.remove(id)
})

ipcMain.handle('appointments:listBetween', (_evt, fromDate, toDate) => {
  requireSession()
  return appointmentsRepo.listBetweenDates(fromDate, toDate)
})
ipcMain.handle('appointments:create', (_evt, payload) => {
  requireSession()
  return appointmentsRepo.create(payload)
})
ipcMain.handle('appointments:update', (_evt, id, payload) => {
  requireSession()
  return appointmentsRepo.update(id, payload)
})
ipcMain.handle('appointments:delete', (_evt, id) => {
  requireAdmin()
  return appointmentsRepo.remove(id)
})

ipcMain.handle('medicalHistory:get', (_evt, patientId) => {
  requireSession()
  return medicalHistoryRepo.get(patientId)
})
ipcMain.handle('medicalHistory:upsert', (_evt, patientId, payload) => {
  requireSession()
  return medicalHistoryRepo.upsert(patientId, payload)
})

ipcMain.handle('finance:summary', (_evt, period) => {
  requireAdmin()
  return financeRepo.getSummary(period)
})
ipcMain.handle('finance:unpaidBalances', () => {
  requireAdmin()
  return financeRepo.getUnpaidBalances()
})

ipcMain.handle('expenses:listBetween', (_evt, fromDate, toDate) => {
  requireAdmin()
  return expensesRepo.listBetween(fromDate, toDate)
})
ipcMain.handle('expenses:listByMonth', (_evt, yearMonth) => {
  requireAdmin()
  return expensesRepo.listByMonth(yearMonth)
})
ipcMain.handle('expenses:categoryBreakdown', (_evt, fromDate, toDate) => {
  requireAdmin()
  return expensesRepo.getCategoryBreakdown(fromDate, toDate)
})
ipcMain.handle('expenses:monthlyTotals', (_evt, year) => {
  requireAdmin()
  return expensesRepo.getMonthlyTotals(year)
})
ipcMain.handle('expenses:create', (_evt, payload) => {
  requireAdmin()
  return expensesRepo.create(payload)
})
ipcMain.handle('expenses:update', (_evt, id, payload) => {
  requireAdmin()
  return expensesRepo.update(id, payload)
})
ipcMain.handle('expenses:delete', (_evt, id) => {
  requireAdmin()
  return expensesRepo.remove(id)
})

ipcMain.handle('treatmentPlans:listByPatient', (_evt, patientId) => {
  requireSession()
  return treatmentPlansRepo.listByPatient(patientId)
})
ipcMain.handle('treatmentPlans:getById', (_evt, planId) => {
  requireSession()
  const plan = treatmentPlansRepo.getById(planId)
  if (!plan) throw new Error('Treatment plan not found.')
  return plan
})
ipcMain.handle('treatmentPlans:create', (_evt, patientId, payload) => {
  requireSession()
  return treatmentPlansRepo.create(patientId, payload)
})
ipcMain.handle('treatmentPlans:update', (_evt, planId, payload) => {
  requireSession()
  return treatmentPlansRepo.update(planId, payload)
})
ipcMain.handle('treatmentPlans:delete', (_evt, planId) => {
  requireAdmin()
  return treatmentPlansRepo.remove(planId)
})
ipcMain.handle('treatmentSteps:add', (_evt, planId, payload) => {
  requireSession()
  return treatmentPlansRepo.addStep(planId, payload)
})
ipcMain.handle('treatmentSteps:update', (_evt, stepId, payload) => {
  requireSession()
  return treatmentPlansRepo.updateStep(stepId, payload)
})
ipcMain.handle('treatmentSteps:delete', (_evt, stepId) => {
  requireAdmin()
  return treatmentPlansRepo.removeStep(stepId)
})
