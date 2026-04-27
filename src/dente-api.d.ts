export type Patient = {
  id: number
  full_name: string
  dob: string
  gender: string
  address: string | null
  phone: string | null
  email: string | null
  created_at: string
  updated_at: string
}

export type PatientCreateUpdate = Omit<Patient, 'id' | 'created_at' | 'updated_at'> & {
  address?: string | null
  phone?: string | null
  email?: string | null
}

export type Procedure = {
  id: number
  patient_id: number
  procedure_name: string
  procedure_date: string
  cost: number
  paid: number
  balance: number
  created_at: string
  updated_at: string
}

export type ProcedureCreateUpdate = Omit<Procedure, 'id' | 'patient_id' | 'created_at' | 'updated_at'>

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

export type Appointment = {
  id: number
  patient_id: number
  appointment_date: string
  start_time: string
  end_time: string | null
  reason: string | null
  notes: string | null
  status: AppointmentStatus
  created_at: string
  updated_at: string
}

export type AppointmentCreateUpdate = Omit<Appointment, 'id' | 'created_at' | 'updated_at'> & {
  end_time?: string | null
  reason?: string | null
  notes?: string | null
}

export type AppointmentWithPatient = Appointment & { patient_name: string }

export type MedicalHistory = {
  patient_id: number
  blood_group: string | null
  allergies: string | null
  existing_conditions: string | null
  current_medications: string | null
  previous_dental_history: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relation: string | null
  created_at?: string
  updated_at?: string
}

export type MedicalHistoryUpsert = Omit<MedicalHistory, 'patient_id'> & {
  blood_group?: string | null
  allergies?: string | null
  existing_conditions?: string | null
  current_medications?: string | null
  previous_dental_history?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  emergency_contact_relation?: string | null
}

export type FinancialPeriod = 'today' | 'week' | 'month' | 'year'

export type FinancialSummary = {
  totalRevenue: number
  totalPaid: number
  totalUnpaid: number
  procedureCount: number
}

export type UnpaidBalanceRow = {
  patient_id: number
  patient_name: string
  phone: string | null
  procedure_count: number
  total_owed: number
}

export type TreatmentPlanStatus = 'active' | 'completed' | 'cancelled'
export type TreatmentStepStatus = 'pending' | 'in-progress' | 'completed'

export type TreatmentPlan = {
  id: number
  patient_id: number
  title: string
  description: string | null
  status: TreatmentPlanStatus
  created_at: string
}

export type TreatmentPlanCreateUpdate = {
  title: string
  description?: string | null
  status: TreatmentPlanStatus
}

export type TreatmentStep = {
  id: number
  plan_id: number
  step_number: number
  procedure_name: string
  description: string | null
  status: TreatmentStepStatus
  scheduled_date: string | null
  completed_date: string | null
  cost_estimate: number | null
  notes: string | null
}

export type TreatmentStepCreateUpdate = {
  step_number?: number
  procedure_name: string
  description?: string | null
  status: TreatmentStepStatus
  scheduled_date?: string | null
  completed_date?: string | null
  cost_estimate?: number | null
  notes?: string | null
}

export type TreatmentPlanWithSteps = TreatmentPlan & { steps: TreatmentStep[] }

export type RecycleBinItem = {
  id: number
  source_table: string
  entity_id: string
  deleted_at: string
  restored_at: string | null
}

declare global {
  interface Window {
    dente: {
      patients: {
        list: () => Promise<Patient[]>
        searchByName: (query: string) => Promise<Patient[]>
        create: (payload: PatientCreateUpdate) => Promise<Patient>
        update: (id: number, payload: PatientCreateUpdate) => Promise<Patient>
        delete: (id: number) => Promise<{ deleted: boolean }>
      }
      procedures: {
        listByPatient: (patientId: number) => Promise<Procedure[]>
        create: (patientId: number, payload: ProcedureCreateUpdate) => Promise<Procedure>
        update: (id: number, payload: ProcedureCreateUpdate) => Promise<Procedure>
        delete: (id: number) => Promise<{ deleted: boolean }>
      }
      appointments: {
        listBetween: (fromDate: string, toDate: string) => Promise<AppointmentWithPatient[]>
        create: (payload: AppointmentCreateUpdate) => Promise<Appointment>
        update: (id: number, payload: AppointmentCreateUpdate) => Promise<Appointment>
        delete: (id: number) => Promise<{ deleted: boolean }>
      }
      upsertMedicalHistory: (patientId: number, data: MedicalHistoryUpsert) => Promise<MedicalHistory>
      getMedicalHistory: (patientId: number) => Promise<MedicalHistory | null>
      getFinancialSummary: (period: FinancialPeriod) => Promise<FinancialSummary>
      getUnpaidBalances: () => Promise<UnpaidBalanceRow[]>
      createTreatmentPlan: (patientId: number, data: TreatmentPlanCreateUpdate) => Promise<TreatmentPlan>
      getTreatmentPlans: (patientId: number) => Promise<TreatmentPlan[]>
      getTreatmentPlanById: (planId: number) => Promise<TreatmentPlanWithSteps>
      updateTreatmentPlan: (planId: number, data: TreatmentPlanCreateUpdate) => Promise<TreatmentPlan>
      deleteTreatmentPlan: (planId: number) => Promise<{ deleted: boolean }>
      addTreatmentStep: (planId: number, data: TreatmentStepCreateUpdate) => Promise<TreatmentStep>
      updateTreatmentStep: (stepId: number, data: TreatmentStepCreateUpdate) => Promise<TreatmentStep>
      deleteTreatmentStep: (stepId: number) => Promise<{ deleted: boolean }>
      db: {
        getInfo: () => Promise<{ dbPath: string; backupsDir: string; exists: boolean }>
        createBackup: (reason?: string) => Promise<{ backupPath: string | null }>
        exportSnapshot: () => Promise<{ outPath: string }>
        listRecycleBin: (limit?: number) => Promise<RecycleBinItem[]>
        restoreRecycleBinItem: (recycleItemId: number) => Promise<{
          restored: boolean
          reason?: 'not_found' | 'already_restored' | 'invalid_payload'
          source_table?: string
          entity_id?: string
        }>
      }
    }
  }
}

export {}

