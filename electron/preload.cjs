const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dente', {
  auth: {
    login: (username, password) => ipcRenderer.invoke('auth:login', username, password),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
    listUsers: () => ipcRenderer.invoke('auth:listUsers'),
    changePassword: (userId, newPassword) =>
      ipcRenderer.invoke('auth:changePassword', userId, newPassword),
  },
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
  upsertMedicalHistory: (patientId, data) =>
    ipcRenderer.invoke('medicalHistory:upsert', patientId, data),
  getMedicalHistory: (patientId) => ipcRenderer.invoke('medicalHistory:get', patientId),
  getFinancialSummary: (period) => ipcRenderer.invoke('finance:summary', period),
  getUnpaidBalances: () => ipcRenderer.invoke('finance:unpaidBalances'),
  expenses: {
    listBetween: (fromDate, toDate) => ipcRenderer.invoke('expenses:listBetween', fromDate, toDate),
    listByMonth: (yearMonth) => ipcRenderer.invoke('expenses:listByMonth', yearMonth),
    categoryBreakdown: (fromDate, toDate) =>
      ipcRenderer.invoke('expenses:categoryBreakdown', fromDate, toDate),
    monthlyTotals: (year) => ipcRenderer.invoke('expenses:monthlyTotals', year),
    create: (payload) => ipcRenderer.invoke('expenses:create', payload),
    update: (id, payload) => ipcRenderer.invoke('expenses:update', id, payload),
    delete: (id) => ipcRenderer.invoke('expenses:delete', id),
  },
  createTreatmentPlan: (patientId, data) =>
    ipcRenderer.invoke('treatmentPlans:create', patientId, data),
  getTreatmentPlans: (patientId) => ipcRenderer.invoke('treatmentPlans:listByPatient', patientId),
  getTreatmentPlanById: (planId) => ipcRenderer.invoke('treatmentPlans:getById', planId),
  updateTreatmentPlan: (planId, data) => ipcRenderer.invoke('treatmentPlans:update', planId, data),
  deleteTreatmentPlan: (planId) => ipcRenderer.invoke('treatmentPlans:delete', planId),
  addTreatmentStep: (planId, data) => ipcRenderer.invoke('treatmentSteps:add', planId, data),
  updateTreatmentStep: (stepId, data) => ipcRenderer.invoke('treatmentSteps:update', stepId, data),
  deleteTreatmentStep: (stepId) => ipcRenderer.invoke('treatmentSteps:delete', stepId),
})
