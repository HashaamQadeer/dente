import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dente', {
  patients: {
    list: () => ipcRenderer.invoke('patients:list'),
    searchByName: (query) => ipcRenderer.invoke('patients:search', query ?? ''),
    create: (payload) => ipcRenderer.invoke('patients:create', payload),
    update: (id, payload) => ipcRenderer.invoke('patients:update', id, payload),
    delete: (id) => ipcRenderer.invoke('patients:delete', id),
  },
  procedures: {
    listByPatient: (patientId) => ipcRenderer.invoke('procedures:listByPatient', patientId),
    create: (patientId, payload) => ipcRenderer.invoke('procedures:create', patientId, payload),
    update: (id, payload) => ipcRenderer.invoke('procedures:update', id, payload),
    delete: (id) => ipcRenderer.invoke('procedures:delete', id),
  },
  appointments: {
    listBetween: (fromDate, toDate) => ipcRenderer.invoke('appointments:listBetween', fromDate, toDate),
    create: (payload) => ipcRenderer.invoke('appointments:create', payload),
    update: (id, payload) => ipcRenderer.invoke('appointments:update', id, payload),
    delete: (id) => ipcRenderer.invoke('appointments:delete', id),
  },
})

