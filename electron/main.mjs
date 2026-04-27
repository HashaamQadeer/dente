import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  appointmentsRepo,
  createDb,
  financeRepo,
  maintenanceRepo,
  medicalHistoryRepo,
  patientsRepo,
  proceduresRepo,
  treatmentPlansRepo,
} from './server/db.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#f7f8fb',
    title: 'Dente',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
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
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createDb()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('patients:list', () => patientsRepo.list())
ipcMain.handle('patients:search', (_evt, query) => patientsRepo.searchByName(query))
ipcMain.handle('patients:create', (_evt, payload) => patientsRepo.create(payload))
ipcMain.handle('patients:update', (_evt, id, payload) => patientsRepo.update(id, payload))
ipcMain.handle('patients:delete', (_evt, id) => patientsRepo.remove(id))

ipcMain.handle('procedures:listByPatient', (_evt, patientId) =>
  proceduresRepo.listByPatient(patientId),
)
ipcMain.handle('procedures:create', (_evt, patientId, payload) =>
  proceduresRepo.create(patientId, payload),
)
ipcMain.handle('procedures:update', (_evt, id, payload) => proceduresRepo.update(id, payload))
ipcMain.handle('procedures:delete', (_evt, id) => proceduresRepo.remove(id))

ipcMain.handle('appointments:listBetween', (_evt, fromDate, toDate) =>
  appointmentsRepo.listBetweenDates(fromDate, toDate),
)
ipcMain.handle('appointments:create', (_evt, payload) => appointmentsRepo.create(payload))
ipcMain.handle('appointments:update', (_evt, id, payload) => appointmentsRepo.update(id, payload))
ipcMain.handle('appointments:delete', (_evt, id) => appointmentsRepo.remove(id))

ipcMain.handle('medicalHistory:upsert', (_evt, patientId, payload) =>
  medicalHistoryRepo.upsert(patientId, payload),
)
ipcMain.handle('medicalHistory:get', (_evt, patientId) => medicalHistoryRepo.getByPatient(patientId))

ipcMain.handle('finance:summary', (_evt, period) => financeRepo.getSummary(period))
ipcMain.handle('finance:unpaid', () => financeRepo.getUnpaidBalances())

ipcMain.handle('treatmentPlans:create', (_evt, patientId, payload) =>
  treatmentPlansRepo.create(patientId, payload),
)
ipcMain.handle('treatmentPlans:listByPatient', (_evt, patientId) =>
  treatmentPlansRepo.listByPatient(patientId),
)
ipcMain.handle('treatmentPlans:getById', (_evt, planId) => treatmentPlansRepo.getById(planId))
ipcMain.handle('treatmentPlans:update', (_evt, planId, payload) =>
  treatmentPlansRepo.update(planId, payload),
)
ipcMain.handle('treatmentPlans:delete', (_evt, planId) => treatmentPlansRepo.remove(planId))
ipcMain.handle('treatmentSteps:add', (_evt, planId, payload) => treatmentPlansRepo.addStep(planId, payload))
ipcMain.handle('treatmentSteps:update', (_evt, stepId, payload) =>
  treatmentPlansRepo.updateStep(stepId, payload),
)
ipcMain.handle('treatmentSteps:delete', (_evt, stepId) => treatmentPlansRepo.removeStep(stepId))

ipcMain.handle('db:getInfo', () => maintenanceRepo.getDbInfo())
ipcMain.handle('db:createBackup', (_evt, reason) => maintenanceRepo.createBackup(reason))
ipcMain.handle('db:exportSnapshot', () => maintenanceRepo.exportSnapshot())
ipcMain.handle('db:listRecycleBin', (_evt, limit) => maintenanceRepo.listRecycleBin(limit))
ipcMain.handle('db:restoreRecycleBinItem', (_evt, recycleItemId) =>
  maintenanceRepo.restoreRecycleBinItem(recycleItemId),
)

