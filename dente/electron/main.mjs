import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { appointmentsRepo, createDb, patientsRepo, proceduresRepo } from './server/db.mjs'

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

