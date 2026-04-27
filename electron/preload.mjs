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
  upsertMedicalHistory: (patientId, data) => ipcRenderer.invoke('medicalHistory:upsert', patientId, data),
  getMedicalHistory: (patientId) => ipcRenderer.invoke('medicalHistory:get', patientId),
  getFinancialSummary: (period) => ipcRenderer.invoke('finance:summary', period),
  getUnpaidBalances: () => ipcRenderer.invoke('finance:unpaid'),
  createTreatmentPlan: (patientId, data) => ipcRenderer.invoke('treatmentPlans:create', patientId, data),
  getTreatmentPlans: (patientId) => ipcRenderer.invoke('treatmentPlans:listByPatient', patientId),
  getTreatmentPlanById: (planId) => ipcRenderer.invoke('treatmentPlans:getById', planId),
  updateTreatmentPlan: (planId, data) => ipcRenderer.invoke('treatmentPlans:update', planId, data),
  deleteTreatmentPlan: (planId) => ipcRenderer.invoke('treatmentPlans:delete', planId),
  addTreatmentStep: (planId, data) => ipcRenderer.invoke('treatmentSteps:add', planId, data),
  updateTreatmentStep: (stepId, data) => ipcRenderer.invoke('treatmentSteps:update', stepId, data),
  deleteTreatmentStep: (stepId) => ipcRenderer.invoke('treatmentSteps:delete', stepId),
  db: {
    getInfo: () => ipcRenderer.invoke('db:getInfo'),
    createBackup: (reason) => ipcRenderer.invoke('db:createBackup', reason),
    exportSnapshot: () => ipcRenderer.invoke('db:exportSnapshot'),
    listRecycleBin: (limit) => ipcRenderer.invoke('db:listRecycleBin', limit),
    restoreRecycleBinItem: (recycleItemId) => ipcRenderer.invoke('db:restoreRecycleBinItem', recycleItemId),
  },
})

