import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { app } from 'electron'

let db = null

function getDbFilePath() {
  const userData = app.getPath('userData')
  return path.join(userData, 'dente.sqlite')
}

function getBackupsDirPath() {
  return path.join(app.getPath('userData'), 'backups')
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function safeCopyIfExists(from, to) {
  if (!fs.existsSync(from)) return
  fs.copyFileSync(from, to)
}

function createFileBackup(reason = 'manual') {
  const dbPath = getDbFilePath()
  if (!fs.existsSync(dbPath)) return null
  const backupsDir = getBackupsDirPath()
  fs.mkdirSync(backupsDir, { recursive: true })
  const stamp = nowStamp()
  const baseName = `dente-${reason}-${stamp}`
  const sqliteBackup = path.join(backupsDir, `${baseName}.sqlite`)

  safeCopyIfExists(dbPath, sqliteBackup)
  safeCopyIfExists(`${dbPath}-wal`, path.join(backupsDir, `${baseName}.sqlite-wal`))
  safeCopyIfExists(`${dbPath}-shm`, path.join(backupsDir, `${baseName}.sqlite-shm`))
  return sqliteBackup
}

function archiveDeletedRow(d, tableName, entityId, payload) {
  d.prepare(
    `INSERT INTO recycle_bin (source_table, entity_id, payload_json)
     VALUES (@source_table, @entity_id, @payload_json)`,
  ).run({
    source_table: tableName,
    entity_id: String(entityId),
    payload_json: JSON.stringify(payload),
  })
}

function restoreDeletedRow(d, recycleItemId) {
  const item = d.prepare('SELECT * FROM recycle_bin WHERE id = ?').get(recycleItemId)
  if (!item) return { restored: false, reason: 'not_found' }
  if (item.restored_at) return { restored: false, reason: 'already_restored' }

  const tableName = String(item.source_table ?? '').trim()
  const payload = JSON.parse(item.payload_json)
  const keys = Object.keys(payload ?? {})
  if (!tableName || !keys.length) return { restored: false, reason: 'invalid_payload' }

  const columnsSql = keys.map((k) => `"${k}"`).join(', ')
  const valuesSql = keys.map((k) => `@${k}`).join(', ')
  d.prepare(`INSERT OR REPLACE INTO "${tableName}" (${columnsSql}) VALUES (${valuesSql})`).run(payload)
  d.prepare(`UPDATE recycle_bin SET restored_at = datetime('now') WHERE id = ?`).run(recycleItemId)
  return { restored: true, source_table: tableName, entity_id: item.entity_id }
}

export function createDb() {
  if (db) return db

  db = new Database(getDbFilePath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = FULL')
  db.pragma('busy_timeout = 5000')

  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      dob TEXT NOT NULL,
      gender TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_patients_full_name ON patients(full_name);

    CREATE TABLE IF NOT EXISTS procedures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      procedure_name TEXT NOT NULL,
      procedure_date TEXT NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      paid REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_procedures_patient_id ON procedures(patient_id);

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      appointment_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      reason TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS medical_history (
      patient_id INTEGER PRIMARY KEY,
      blood_group TEXT,
      allergies TEXT,
      existing_conditions TEXT,
      current_medications TEXT,
      previous_dental_history TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      emergency_contact_relation TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS treatment_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS treatment_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      step_number INTEGER NOT NULL,
      procedure_name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_date TEXT,
      completed_date TEXT,
      cost_estimate REAL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(plan_id) REFERENCES treatment_plans(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient ON treatment_plans(patient_id);
    CREATE INDEX IF NOT EXISTS idx_treatment_steps_plan ON treatment_steps(plan_id);

    CREATE TABLE IF NOT EXISTS recycle_bin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_table TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
      restored_at TEXT
    );
    `);

  createFileBackup('startup')
  return db
}

function ensureDb() {
  if (!db) createDb()
  return db
}

export const patientsRepo = {
  list() {
    const d = ensureDb()
    return d.prepare('SELECT * FROM patients ORDER BY full_name COLLATE NOCASE ASC, id ASC').all()
  },
  searchByName(query) {
    const d = ensureDb()
    const q = (query ?? '').trim()
    if (!q) return this.list()
    const pattern = `%${q}%`
    return d
      .prepare(
        `SELECT * FROM patients
         WHERE full_name LIKE ? OR CAST(id AS TEXT) LIKE ? OR COALESCE(phone, '') LIKE ?
         ORDER BY full_name COLLATE NOCASE ASC, id ASC`,
      )
      .all(pattern, pattern, pattern)
  },
  create(payload) {
    const d = ensureDb()
    const stmt = d.prepare(
      `INSERT INTO patients (full_name, dob, gender, address, phone, email)
       VALUES (@full_name, @dob, @gender, @address, @phone, @email)`,
    )
    const info = stmt.run({
      full_name: payload.full_name,
      dob: payload.dob,
      gender: payload.gender,
      address: payload.address ?? null,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
    })
    return d.prepare('SELECT * FROM patients WHERE id = ?').get(info.lastInsertRowid)
  },
  update(id, payload) {
    const d = ensureDb()
    const stmt = d.prepare(
      `UPDATE patients
       SET full_name = @full_name,
           dob = @dob,
           gender = @gender,
           address = @address,
           phone = @phone,
           email = @email,
           updated_at = datetime('now')
       WHERE id = @id`,
    )
    stmt.run({
      id,
      full_name: payload.full_name,
      dob: payload.dob,
      gender: payload.gender,
      address: payload.address ?? null,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
    })
    return d.prepare('SELECT * FROM patients WHERE id = ?').get(id)
  },
  remove(id) {
    const d = ensureDb()
    const tx = d.transaction((patientId) => {
      const patient = d.prepare('SELECT * FROM patients WHERE id = ?').get(patientId)
      if (!patient) return { deleted: false }

      const procedures = d.prepare('SELECT * FROM procedures WHERE patient_id = ?').all(patientId)
      const appointments = d.prepare('SELECT * FROM appointments WHERE patient_id = ?').all(patientId)
      const plans = d.prepare('SELECT * FROM treatment_plans WHERE patient_id = ?').all(patientId)
      const medicalHistory = d.prepare('SELECT * FROM medical_history WHERE patient_id = ?').get(patientId) ?? null

      for (const row of procedures) archiveDeletedRow(d, 'procedures', row.id, row)
      for (const row of appointments) archiveDeletedRow(d, 'appointments', row.id, row)
      for (const row of plans) {
        const steps = d.prepare('SELECT * FROM treatment_steps WHERE plan_id = ?').all(row.id)
        for (const step of steps) archiveDeletedRow(d, 'treatment_steps', step.id, step)
        archiveDeletedRow(d, 'treatment_plans', row.id, row)
      }
      if (medicalHistory) archiveDeletedRow(d, 'medical_history', medicalHistory.patient_id, medicalHistory)
      archiveDeletedRow(d, 'patients', patient.id, patient)

      const info = d.prepare('DELETE FROM patients WHERE id = ?').run(patientId)
      return { deleted: info.changes > 0 }
    })

    createFileBackup('before-patient-delete')
    return tx(id)
  },
}

export const proceduresRepo = {
  listByPatient(patientId) {
    const d = ensureDb()
    return d
      .prepare(
        `SELECT * FROM procedures
         WHERE patient_id = ?
         ORDER BY procedure_date DESC, id DESC`,
      )
      .all(patientId)
  },
  create(patientId, payload) {
    const d = ensureDb()
    const cost = Number(payload.cost ?? 0) || 0
    const paid = Number(payload.paid ?? 0) || 0
    const balance = Number.isFinite(payload.balance)
      ? Number(payload.balance)
      : Math.max(0, cost - paid)

    const info = d
      .prepare(
        `INSERT INTO procedures (patient_id, procedure_name, procedure_date, cost, paid, balance)
         VALUES (@patient_id, @procedure_name, @procedure_date, @cost, @paid, @balance)`,
      )
      .run({
        patient_id: patientId,
        procedure_name: payload.procedure_name,
        procedure_date: payload.procedure_date,
        cost,
        paid,
        balance,
      })
    return d.prepare('SELECT * FROM procedures WHERE id = ?').get(info.lastInsertRowid)
  },
  update(id, payload) {
    const d = ensureDb()
    const cost = Number(payload.cost ?? 0) || 0
    const paid = Number(payload.paid ?? 0) || 0
    const balance = Number.isFinite(payload.balance)
      ? Number(payload.balance)
      : Math.max(0, cost - paid)

    const stmt = d.prepare(
      `UPDATE procedures
       SET procedure_name = @procedure_name,
           procedure_date = @procedure_date,
           cost = @cost,
           paid = @paid,
           balance = @balance,
           updated_at = datetime('now')
       WHERE id = @id`,
    )
    stmt.run({
      id,
      procedure_name: payload.procedure_name,
      procedure_date: payload.procedure_date,
      cost,
      paid,
      balance,
    })
    return d.prepare('SELECT * FROM procedures WHERE id = ?').get(id)
  },
  remove(id) {
    const d = ensureDb()
    const row = d.prepare('SELECT * FROM procedures WHERE id = ?').get(id)
    if (!row) return { deleted: false }
    archiveDeletedRow(d, 'procedures', row.id, row)
    createFileBackup('before-procedure-delete')
    const info = d.prepare('DELETE FROM procedures WHERE id = ?').run(id)
    return { deleted: info.changes > 0 }
  },
}

const allowedAppointmentStatuses = new Set(['scheduled', 'completed', 'cancelled', 'no_show'])
const allowedFinancialPeriods = new Set(['today', 'week', 'month', 'year'])
const allowedTreatmentPlanStatuses = new Set(['active', 'completed', 'cancelled'])
const allowedTreatmentStepStatuses = new Set(['pending', 'in-progress', 'completed'])

function normalizeNullableText(value) {
  const text = String(value ?? '').trim()
  return text ? text : null
}

function toNonNegativeNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function getPeriodRange(period) {
  const p = allowedFinancialPeriods.has(period) ? period : 'month'
  if (p === 'today') {
    return { fromExpr: "date('now')", toExpr: "date('now')" }
  }
  if (p === 'week') {
    return { fromExpr: "date('now', 'weekday 0', '-6 days')", toExpr: "date('now', 'weekday 0')" }
  }
  if (p === 'year') {
    return { fromExpr: "date('now', 'start of year')", toExpr: "date('now')" }
  }
  return { fromExpr: "date('now', 'start of month')", toExpr: "date('now')" }
}

export const appointmentsRepo = {
  listBetweenDates(fromDate, toDate) {
    const d = ensureDb()
    const from = (fromDate ?? '').trim()
    const to = (toDate ?? '').trim()
    if (!from || !to) {
      return d
        .prepare(
          `SELECT a.*, p.full_name AS patient_name
           FROM appointments a
           JOIN patients p ON p.id = a.patient_id
           ORDER BY a.appointment_date DESC, a.start_time DESC`,
        )
        .all()
    }
    return d
      .prepare(
        `SELECT a.*, p.full_name AS patient_name
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         WHERE a.appointment_date >= @from AND a.appointment_date <= @to
         ORDER BY a.appointment_date ASC, a.start_time ASC`,
      )
      .all({ from, to })
  },
  create(payload) {
    const d = ensureDb()
    const status = allowedAppointmentStatuses.has(payload.status) ? payload.status : 'scheduled'
    const endTime = payload.end_time?.trim() ? payload.end_time.trim() : null
    const info = d
      .prepare(
        `INSERT INTO appointments (patient_id, appointment_date, start_time, end_time, reason, notes, status)
         VALUES (@patient_id, @appointment_date, @start_time, @end_time, @reason, @notes, @status)`,
      )
      .run({
        patient_id: payload.patient_id,
        appointment_date: payload.appointment_date,
        start_time: payload.start_time,
        end_time: endTime,
        reason: payload.reason?.trim() ? payload.reason.trim() : null,
        notes: payload.notes?.trim() ? payload.notes.trim() : null,
        status,
      })
    return d.prepare('SELECT * FROM appointments WHERE id = ?').get(info.lastInsertRowid)
  },
  update(id, payload) {
    const d = ensureDb()
    const status = allowedAppointmentStatuses.has(payload.status) ? payload.status : 'scheduled'
    const endTime = payload.end_time?.trim() ? payload.end_time.trim() : null
    const stmt = d.prepare(
      `UPDATE appointments
       SET patient_id = @patient_id,
           appointment_date = @appointment_date,
           start_time = @start_time,
           end_time = @end_time,
           reason = @reason,
           notes = @notes,
           status = @status,
           updated_at = datetime('now')
       WHERE id = @id`,
    )
    stmt.run({
      id,
      patient_id: payload.patient_id,
      appointment_date: payload.appointment_date,
      start_time: payload.start_time,
      end_time: endTime,
      reason: payload.reason?.trim() ? payload.reason.trim() : null,
      notes: payload.notes?.trim() ? payload.notes.trim() : null,
      status,
    })
    return d.prepare('SELECT * FROM appointments WHERE id = ?').get(id)
  },
  remove(id) {
    const d = ensureDb()
    const row = d.prepare('SELECT * FROM appointments WHERE id = ?').get(id)
    if (!row) return { deleted: false }
    archiveDeletedRow(d, 'appointments', row.id, row)
    createFileBackup('before-appointment-delete')
    const info = d.prepare('DELETE FROM appointments WHERE id = ?').run(id)
    return { deleted: info.changes > 0 }
  },
}

export const medicalHistoryRepo = {
  getByPatient(patientId) {
    const d = ensureDb()
    return d.prepare('SELECT * FROM medical_history WHERE patient_id = ?').get(patientId) ?? null
  },
  upsert(patientId, payload) {
    const d = ensureDb()
    d.prepare(
      `INSERT INTO medical_history (
         patient_id, blood_group, allergies, existing_conditions, current_medications,
         previous_dental_history, emergency_contact_name, emergency_contact_phone, emergency_contact_relation
       )
       VALUES (
         @patient_id, @blood_group, @allergies, @existing_conditions, @current_medications,
         @previous_dental_history, @emergency_contact_name, @emergency_contact_phone, @emergency_contact_relation
       )
       ON CONFLICT(patient_id) DO UPDATE SET
         blood_group = excluded.blood_group,
         allergies = excluded.allergies,
         existing_conditions = excluded.existing_conditions,
         current_medications = excluded.current_medications,
         previous_dental_history = excluded.previous_dental_history,
         emergency_contact_name = excluded.emergency_contact_name,
         emergency_contact_phone = excluded.emergency_contact_phone,
         emergency_contact_relation = excluded.emergency_contact_relation,
         updated_at = datetime('now')`,
    ).run({
      patient_id: patientId,
      blood_group: normalizeNullableText(payload.blood_group),
      allergies: normalizeNullableText(payload.allergies),
      existing_conditions: normalizeNullableText(payload.existing_conditions),
      current_medications: normalizeNullableText(payload.current_medications),
      previous_dental_history: normalizeNullableText(payload.previous_dental_history),
      emergency_contact_name: normalizeNullableText(payload.emergency_contact_name),
      emergency_contact_phone: normalizeNullableText(payload.emergency_contact_phone),
      emergency_contact_relation: normalizeNullableText(payload.emergency_contact_relation),
    })
    return this.getByPatient(patientId)
  },
}

export const financeRepo = {
  getSummary(period) {
    const d = ensureDb()
    const { fromExpr, toExpr } = getPeriodRange(period)
    const row = d
      .prepare(
        `SELECT
           COALESCE(SUM(cost), 0) AS totalRevenue,
           COALESCE(SUM(paid), 0) AS totalPaid,
           COALESCE(SUM(balance), 0) AS totalUnpaid,
           COUNT(*) AS procedureCount
         FROM procedures
         WHERE date(procedure_date) >= ${fromExpr} AND date(procedure_date) <= ${toExpr}`,
      )
      .get()
    return {
      totalRevenue: Number(row?.totalRevenue ?? 0),
      totalPaid: Number(row?.totalPaid ?? 0),
      totalUnpaid: Number(row?.totalUnpaid ?? 0),
      procedureCount: Number(row?.procedureCount ?? 0),
    }
  },
  getUnpaidBalances() {
    const d = ensureDb()
    return d
      .prepare(
        `SELECT
           p.id AS patient_id,
           p.full_name AS patient_name,
           p.phone AS phone,
           COUNT(pr.id) AS procedure_count,
           COALESCE(SUM(pr.balance), 0) AS total_owed
         FROM procedures pr
         JOIN patients p ON p.id = pr.patient_id
         WHERE COALESCE(pr.balance, 0) > 0
         GROUP BY p.id, p.full_name, p.phone
         ORDER BY total_owed DESC, p.full_name COLLATE NOCASE ASC`,
      )
      .all()
  },
}

export const treatmentPlansRepo = {
  listByPatient(patientId) {
    const d = ensureDb()
    return d
      .prepare(
        `SELECT id, patient_id, title, description, status, created_at
         FROM treatment_plans
         WHERE patient_id = ?
         ORDER BY datetime(created_at) DESC, id DESC`,
      )
      .all(patientId)
  },
  create(patientId, payload) {
    const d = ensureDb()
    const status = allowedTreatmentPlanStatuses.has(payload.status) ? payload.status : 'active'
    const info = d
      .prepare(
        `INSERT INTO treatment_plans (patient_id, title, description, status)
         VALUES (@patient_id, @title, @description, @status)`,
      )
      .run({
        patient_id: patientId,
        title: String(payload.title ?? '').trim(),
        description: normalizeNullableText(payload.description),
        status,
      })
    return d
      .prepare('SELECT id, patient_id, title, description, status, created_at FROM treatment_plans WHERE id = ?')
      .get(info.lastInsertRowid)
  },
  getById(planId) {
    const d = ensureDb()
    const plan = d
      .prepare('SELECT id, patient_id, title, description, status, created_at FROM treatment_plans WHERE id = ?')
      .get(planId)
    if (!plan) return null
    const steps = d
      .prepare(
        `SELECT
           id, plan_id, step_number, procedure_name, description, status,
           scheduled_date, completed_date, cost_estimate, notes
         FROM treatment_steps
         WHERE plan_id = ?
         ORDER BY step_number ASC, id ASC`,
      )
      .all(planId)
    return { ...plan, steps }
  },
  update(planId, payload) {
    const d = ensureDb()
    const status = allowedTreatmentPlanStatuses.has(payload.status) ? payload.status : 'active'
    d.prepare(
      `UPDATE treatment_plans
       SET title = @title,
           description = @description,
           status = @status,
           updated_at = datetime('now')
       WHERE id = @id`,
    ).run({
      id: planId,
      title: String(payload.title ?? '').trim(),
      description: normalizeNullableText(payload.description),
      status,
    })
    return d
      .prepare('SELECT id, patient_id, title, description, status, created_at FROM treatment_plans WHERE id = ?')
      .get(planId)
  },
  remove(planId) {
    const d = ensureDb()
    const tx = d.transaction((targetPlanId) => {
      const row = d.prepare('SELECT * FROM treatment_plans WHERE id = ?').get(targetPlanId)
      if (!row) return { deleted: false }
      const steps = d.prepare('SELECT * FROM treatment_steps WHERE plan_id = ?').all(targetPlanId)
      for (const step of steps) archiveDeletedRow(d, 'treatment_steps', step.id, step)
      archiveDeletedRow(d, 'treatment_plans', row.id, row)
      const info = d.prepare('DELETE FROM treatment_plans WHERE id = ?').run(targetPlanId)
      return { deleted: info.changes > 0 }
    })
    createFileBackup('before-plan-delete')
    return tx(planId)
  },
  addStep(planId, payload) {
    const d = ensureDb()
    const tx = d.transaction((planIdArg, payloadArg) => {
      const row = d
        .prepare('SELECT COALESCE(MAX(step_number), 0) AS max_step FROM treatment_steps WHERE plan_id = ?')
        .get(planIdArg)
      const fallback = Number(row?.max_step ?? 0) + 1
      const stepNumber = Number.isInteger(payloadArg.step_number) && payloadArg.step_number > 0
        ? payloadArg.step_number
        : fallback
      const status = allowedTreatmentStepStatuses.has(payloadArg.status) ? payloadArg.status : 'pending'
      const info = d
        .prepare(
          `INSERT INTO treatment_steps (
             plan_id, step_number, procedure_name, description, status,
             scheduled_date, completed_date, cost_estimate, notes
           )
           VALUES (
             @plan_id, @step_number, @procedure_name, @description, @status,
             @scheduled_date, @completed_date, @cost_estimate, @notes
           )`,
        )
        .run({
          plan_id: planIdArg,
          step_number: stepNumber,
          procedure_name: String(payloadArg.procedure_name ?? '').trim(),
          description: normalizeNullableText(payloadArg.description),
          status,
          scheduled_date: normalizeNullableText(payloadArg.scheduled_date),
          completed_date: normalizeNullableText(payloadArg.completed_date),
          cost_estimate:
            payloadArg.cost_estimate == null ? null : toNonNegativeNumber(payloadArg.cost_estimate),
          notes: normalizeNullableText(payloadArg.notes),
        })
      return d
        .prepare(
          `SELECT
             id, plan_id, step_number, procedure_name, description, status,
             scheduled_date, completed_date, cost_estimate, notes
           FROM treatment_steps
           WHERE id = ?`,
        )
        .get(info.lastInsertRowid)
    })
    return tx(planId, payload)
  },
  updateStep(stepId, payload) {
    const d = ensureDb()
    const existing = d.prepare('SELECT * FROM treatment_steps WHERE id = ?').get(stepId)
    if (!existing) return null
    const status = allowedTreatmentStepStatuses.has(payload.status) ? payload.status : existing.status
    const stepNumber =
      Number.isInteger(payload.step_number) && payload.step_number > 0
        ? payload.step_number
        : existing.step_number
    d.prepare(
      `UPDATE treatment_steps
       SET step_number = @step_number,
           procedure_name = @procedure_name,
           description = @description,
           status = @status,
           scheduled_date = @scheduled_date,
           completed_date = @completed_date,
           cost_estimate = @cost_estimate,
           notes = @notes,
           updated_at = datetime('now')
       WHERE id = @id`,
    ).run({
      id: stepId,
      step_number: stepNumber,
      procedure_name: String(payload.procedure_name ?? existing.procedure_name).trim(),
      description: normalizeNullableText(payload.description),
      status,
      scheduled_date: normalizeNullableText(payload.scheduled_date),
      completed_date: normalizeNullableText(payload.completed_date),
      cost_estimate: payload.cost_estimate == null ? null : toNonNegativeNumber(payload.cost_estimate),
      notes: normalizeNullableText(payload.notes),
    })
    return d
      .prepare(
        `SELECT
           id, plan_id, step_number, procedure_name, description, status,
           scheduled_date, completed_date, cost_estimate, notes
         FROM treatment_steps
         WHERE id = ?`,
      )
      .get(stepId)
  },
  removeStep(stepId) {
    const d = ensureDb()
    const row = d.prepare('SELECT * FROM treatment_steps WHERE id = ?').get(stepId)
    if (!row) return { deleted: false }
    archiveDeletedRow(d, 'treatment_steps', row.id, row)
    createFileBackup('before-step-delete')
    const info = d.prepare('DELETE FROM treatment_steps WHERE id = ?').run(stepId)
    return { deleted: info.changes > 0 }
  },
}

export const maintenanceRepo = {
  getDbInfo() {
    const dbPath = getDbFilePath()
    return {
      dbPath,
      backupsDir: getBackupsDirPath(),
      exists: fs.existsSync(dbPath),
    }
  },
  createBackup(reason = 'manual') {
    const backupPath = createFileBackup(reason)
    return { backupPath }
  },
  exportSnapshot() {
    const d = ensureDb()
    const payload = {
      exported_at: new Date().toISOString(),
      patients: d.prepare('SELECT * FROM patients ORDER BY id ASC').all(),
      procedures: d.prepare('SELECT * FROM procedures ORDER BY id ASC').all(),
      appointments: d.prepare('SELECT * FROM appointments ORDER BY id ASC').all(),
      medical_history: d.prepare('SELECT * FROM medical_history ORDER BY patient_id ASC').all(),
      treatment_plans: d.prepare('SELECT * FROM treatment_plans ORDER BY id ASC').all(),
      treatment_steps: d.prepare('SELECT * FROM treatment_steps ORDER BY id ASC').all(),
      recycle_bin: d.prepare('SELECT * FROM recycle_bin ORDER BY id ASC').all(),
    }
    const exportsDir = path.join(app.getPath('userData'), 'exports')
    fs.mkdirSync(exportsDir, { recursive: true })
    const outPath = path.join(exportsDir, `dente-export-${nowStamp()}.json`)
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8')
    return { outPath }
  },
  listRecycleBin(limit = 200) {
    const d = ensureDb()
    const n = Number(limit)
    const capped = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 1000) : 200
    return d
      .prepare(
        `SELECT id, source_table, entity_id, deleted_at, restored_at
         FROM recycle_bin
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(capped)
  },
  restoreRecycleBinItem(recycleItemId) {
    const d = ensureDb()
    const tx = d.transaction((id) => restoreDeletedRow(d, id))
    createFileBackup('before-recycle-restore')
    return tx(recycleItemId)
  },
}

