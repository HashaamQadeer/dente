import path from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { hashPassword } from './auth.mjs'

let db = null

function getDbFilePath() {
  const userData = app.getPath('userData')
  return path.join(userData, 'dente.sqlite')
}

export function createDb() {
  if (db) return db

  db = new Database(getDbFilePath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

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

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'manager')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
    `);

  seedDefaultUsers(db)
  return db
}

function seedDefaultUsers(d) {
  const count = d.prepare('SELECT COUNT(*) AS n FROM users').get().n
  if (count > 0) return

  const insert = d.prepare(
    `INSERT INTO users (username, password_hash, role) VALUES (@username, @password_hash, @role)`,
  )
  insert.run({ username: 'admin', password_hash: hashPassword('admin'), role: 'admin' })
  insert.run({ username: 'manager', password_hash: hashPassword('manager'), role: 'manager' })
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
    d.prepare(
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
    d.run({
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
    const info = d.prepare('DELETE FROM patients WHERE id = ?').run(id)
    return { deleted: info.changes > 0 }
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

    d.prepare(
      `UPDATE procedures
       SET procedure_name = @procedure_name,
           procedure_date = @procedure_date,
           cost = @cost,
           paid = @paid,
           balance = @balance,
           updated_at = datetime('now')
       WHERE id = @id`,
    )
    d.run({
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
    const info = d.prepare('DELETE FROM procedures WHERE id = ?').run(id)
    return { deleted: info.changes > 0 }
  },
}

const allowedAppointmentStatuses = new Set(['scheduled', 'completed', 'cancelled', 'no_show'])

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
    d.prepare(
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
    d.run({
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
    const info = d.prepare('DELETE FROM appointments WHERE id = ?').run(id)
    return { deleted: info.changes > 0 }
  },
}

export const usersRepo = {
  findByUsername(username) {
    const d = ensureDb()
    return d.prepare('SELECT * FROM users WHERE username = ?').get(username.trim())
  },
  findById(id) {
    const d = ensureDb()
    return d.prepare('SELECT * FROM users WHERE id = ?').get(id)
  },
  list() {
    const d = ensureDb()
    return d
      .prepare('SELECT id, username, role, created_at, updated_at FROM users ORDER BY username COLLATE NOCASE ASC')
      .all()
  },
  updatePassword(id, passwordHash) {
    const d = ensureDb()
    d.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
      passwordHash,
      id,
    )
    return d.prepare('SELECT id, username, role, created_at, updated_at FROM users WHERE id = ?').get(id)
  },
}

export const medicalHistoryRepo = {
  get(patientId) {
    const d = ensureDb()
    return d.prepare('SELECT * FROM medical_history WHERE patient_id = ?').get(patientId) ?? null
  },
  upsert(patientId, payload) {
    const d = ensureDb()
    const existing = d.prepare('SELECT patient_id FROM medical_history WHERE patient_id = ?').get(patientId)
    const data = {
      patient_id: patientId,
      blood_group: payload.blood_group?.trim() ? payload.blood_group.trim() : null,
      allergies: payload.allergies?.trim() ? payload.allergies.trim() : null,
      existing_conditions: payload.existing_conditions?.trim() ? payload.existing_conditions.trim() : null,
      current_medications: payload.current_medications?.trim() ? payload.current_medications.trim() : null,
      previous_dental_history: payload.previous_dental_history?.trim()
        ? payload.previous_dental_history.trim()
        : null,
      emergency_contact_name: payload.emergency_contact_name?.trim()
        ? payload.emergency_contact_name.trim()
        : null,
      emergency_contact_phone: payload.emergency_contact_phone?.trim()
        ? payload.emergency_contact_phone.trim()
        : null,
      emergency_contact_relation: payload.emergency_contact_relation?.trim()
        ? payload.emergency_contact_relation.trim()
        : null,
    }
    if (existing) {
      d.prepare(
        `UPDATE medical_history
         SET blood_group = @blood_group,
             allergies = @allergies,
             existing_conditions = @existing_conditions,
             current_medications = @current_medications,
             previous_dental_history = @previous_dental_history,
             emergency_contact_name = @emergency_contact_name,
             emergency_contact_phone = @emergency_contact_phone,
             emergency_contact_relation = @emergency_contact_relation,
             updated_at = datetime('now')
         WHERE patient_id = @patient_id`,
      ).run(data)
    } else {
      d.prepare(
        `INSERT INTO medical_history (
           patient_id, blood_group, allergies, existing_conditions, current_medications,
           previous_dental_history, emergency_contact_name, emergency_contact_phone, emergency_contact_relation
         ) VALUES (
           @patient_id, @blood_group, @allergies, @existing_conditions, @current_medications,
           @previous_dental_history, @emergency_contact_name, @emergency_contact_phone, @emergency_contact_relation
         )`,
      ).run(data)
    }
    return d.prepare('SELECT * FROM medical_history WHERE patient_id = ?').get(patientId)
  },
}

function periodDateRange(period) {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  if (period === 'today') return { from: today, to: today }
  if (period === 'week') {
    const day = now.getDay()
    const diff = day === 0 ? 6 : day - 1
    const monday = new Date(now)
    monday.setDate(now.getDate() - diff)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) }
  }
  if (period === 'month') {
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from, to: last.toISOString().slice(0, 10) }
  }
  const from = `${now.getFullYear()}-01-01`
  const to = `${now.getFullYear()}-12-31`
  return { from, to }
}

export const financeRepo = {
  getSummary(period) {
    const d = ensureDb()
    const { from, to } = periodDateRange(period)
    const row = d
      .prepare(
        `SELECT
           COALESCE(SUM(cost), 0) AS totalRevenue,
           COALESCE(SUM(paid), 0) AS totalPaid,
           COALESCE(SUM(balance), 0) AS totalUnpaid,
           COUNT(*) AS procedureCount
         FROM procedures
         WHERE procedure_date >= @from AND procedure_date <= @to`,
      )
      .get({ from, to })
    const expenseRow = d
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS totalExpenses
         FROM expenses
         WHERE expense_date >= @from AND expense_date <= @to`,
      )
      .get({ from, to })
    const totalPaid = Number(row.totalPaid) || 0
    const totalExpenses = Number(expenseRow.totalExpenses) || 0
    return {
      totalRevenue: Number(row.totalRevenue) || 0,
      totalPaid,
      totalUnpaid: Number(row.totalUnpaid) || 0,
      procedureCount: Number(row.procedureCount) || 0,
      totalExpenses,
      netProfit: totalPaid - totalExpenses,
    }
  },
  getUnpaidBalances() {
    const d = ensureDb()
    return d
      .prepare(
        `SELECT
           p.id AS patient_id,
           p.full_name AS patient_name,
           p.phone,
           COUNT(pr.id) AS procedure_count,
           COALESCE(SUM(pr.balance), 0) AS total_owed
         FROM patients p
         JOIN procedures pr ON pr.patient_id = p.id
         WHERE pr.balance > 0
         GROUP BY p.id
         ORDER BY total_owed DESC, p.full_name COLLATE NOCASE ASC`,
      )
      .all()
      .map((r) => ({
        ...r,
        procedure_count: Number(r.procedure_count) || 0,
        total_owed: Number(r.total_owed) || 0,
      }))
  },
}

const allowedExpenseCategories = new Set([
  'equipment',
  'utilities',
  'rent',
  'salaries',
  'supplies',
  'miscellaneous',
])

function monthDateRange(yearMonth) {
  const [yearStr, monthStr] = String(yearMonth ?? '').split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  if (!year || !month || month < 1 || month > 12) {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const from = `${y}-${String(m).padStart(2, '0')}-01`
    const last = new Date(y, m, 0)
    return { from, to: last.toISOString().slice(0, 10) }
  }
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const last = new Date(year, month, 0)
  return { from, to: last.toISOString().slice(0, 10) }
}

export const expensesRepo = {
  listBetween(fromDate, toDate) {
    const d = ensureDb()
    const from = (fromDate ?? '').trim()
    const to = (toDate ?? '').trim()
    if (!from || !to) {
      return d
        .prepare(
          `SELECT * FROM expenses ORDER BY expense_date DESC, id DESC`,
        )
        .all()
    }
    return d
      .prepare(
        `SELECT * FROM expenses
         WHERE expense_date >= @from AND expense_date <= @to
         ORDER BY expense_date DESC, id DESC`,
      )
      .all({ from, to })
  },
  listByMonth(yearMonth) {
    const { from, to } = monthDateRange(yearMonth)
    return this.listBetween(from, to)
  },
  getCategoryBreakdown(fromDate, toDate) {
    const d = ensureDb()
    const from = (fromDate ?? '').trim()
    const to = (toDate ?? '').trim()
    return d
      .prepare(
        `SELECT category, COALESCE(SUM(amount), 0) AS total
         FROM expenses
         WHERE expense_date >= @from AND expense_date <= @to
         GROUP BY category
         ORDER BY total DESC`,
      )
      .all({ from, to })
      .map((r) => ({ category: r.category, total: Number(r.total) || 0 }))
  },
  getMonthlyTotals(year) {
    const d = ensureDb()
    const y = Number(year) || new Date().getFullYear()
    const from = `${y}-01-01`
    const to = `${y}-12-31`
    const rows = d
      .prepare(
        `SELECT substr(expense_date, 1, 7) AS month, COALESCE(SUM(amount), 0) AS total
         FROM expenses
         WHERE expense_date >= @from AND expense_date <= @to
         GROUP BY substr(expense_date, 1, 7)
         ORDER BY month ASC`,
      )
      .all({ from, to })
    return rows.map((r) => ({ month: r.month, total: Number(r.total) || 0 }))
  },
  create(payload) {
    const d = ensureDb()
    const category = allowedExpenseCategories.has(payload.category)
      ? payload.category
      : 'miscellaneous'
    const info = d
      .prepare(
        `INSERT INTO expenses (expense_date, category, description, amount)
         VALUES (@expense_date, @category, @description, @amount)`,
      )
      .run({
        expense_date: payload.expense_date,
        category,
        description: payload.description.trim(),
        amount: Number(payload.amount ?? 0) || 0,
      })
    return d.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid)
  },
  update(id, payload) {
    const d = ensureDb()
    const category = allowedExpenseCategories.has(payload.category)
      ? payload.category
      : 'miscellaneous'
    d.prepare(
      `UPDATE expenses
       SET expense_date = @expense_date,
           category = @category,
           description = @description,
           amount = @amount,
           updated_at = datetime('now')
       WHERE id = @id`,
    ).run({
      id,
      expense_date: payload.expense_date,
      category,
      description: payload.description.trim(),
      amount: Number(payload.amount ?? 0) || 0,
    })
    return d.prepare('SELECT * FROM expenses WHERE id = ?').get(id)
  },
  remove(id) {
    const d = ensureDb()
    const info = d.prepare('DELETE FROM expenses WHERE id = ?').run(id)
    return { deleted: info.changes > 0 }
  },
}

const allowedPlanStatuses = new Set(['active', 'completed', 'cancelled'])
const allowedStepStatuses = new Set(['pending', 'in-progress', 'completed'])

export const treatmentPlansRepo = {
  listByPatient(patientId) {
    const d = ensureDb()
    return d
      .prepare(
        `SELECT * FROM treatment_plans WHERE patient_id = ? ORDER BY created_at DESC, id DESC`,
      )
      .all(patientId)
  },
  getById(planId) {
    const d = ensureDb()
    const plan = d.prepare('SELECT * FROM treatment_plans WHERE id = ?').get(planId)
    if (!plan) return null
    const steps = d
      .prepare(
        `SELECT * FROM treatment_steps WHERE plan_id = ? ORDER BY step_number ASC, id ASC`,
      )
      .all(planId)
    return { ...plan, steps }
  },
  create(patientId, payload) {
    const d = ensureDb()
    const status = allowedPlanStatuses.has(payload.status) ? payload.status : 'active'
    const info = d
      .prepare(
        `INSERT INTO treatment_plans (patient_id, title, description, status)
         VALUES (@patient_id, @title, @description, @status)`,
      )
      .run({
        patient_id: patientId,
        title: payload.title,
        description: payload.description?.trim() ? payload.description.trim() : null,
        status,
      })
    return d.prepare('SELECT * FROM treatment_plans WHERE id = ?').get(info.lastInsertRowid)
  },
  update(planId, payload) {
    const d = ensureDb()
    const status = allowedPlanStatuses.has(payload.status) ? payload.status : 'active'
    d.prepare(
      `UPDATE treatment_plans
       SET title = @title,
           description = @description,
           status = @status,
           updated_at = datetime('now')
       WHERE id = @id`,
    ).run({
      id: planId,
      title: payload.title,
      description: payload.description?.trim() ? payload.description.trim() : null,
      status,
    })
    return d.prepare('SELECT * FROM treatment_plans WHERE id = ?').get(planId)
  },
  remove(planId) {
    const d = ensureDb()
    const info = d.prepare('DELETE FROM treatment_plans WHERE id = ?').run(planId)
    return { deleted: info.changes > 0 }
  },
  addStep(planId, payload) {
    const d = ensureDb()
    const status = allowedStepStatuses.has(payload.status) ? payload.status : 'pending'
    const maxStep = d
      .prepare('SELECT COALESCE(MAX(step_number), 0) AS n FROM treatment_steps WHERE plan_id = ?')
      .get(planId).n
    const stepNumber = payload.step_number ?? maxStep + 1
    const info = d
      .prepare(
        `INSERT INTO treatment_steps (
           plan_id, step_number, procedure_name, description, status,
           scheduled_date, completed_date, cost_estimate, notes
         ) VALUES (
           @plan_id, @step_number, @procedure_name, @description, @status,
           @scheduled_date, @completed_date, @cost_estimate, @notes
         )`,
      )
      .run({
        plan_id: planId,
        step_number: stepNumber,
        procedure_name: payload.procedure_name,
        description: payload.description?.trim() ? payload.description.trim() : null,
        status,
        scheduled_date: payload.scheduled_date?.trim() ? payload.scheduled_date.trim() : null,
        completed_date: payload.completed_date?.trim() ? payload.completed_date.trim() : null,
        cost_estimate:
          payload.cost_estimate == null || payload.cost_estimate === ''
            ? null
            : Number(payload.cost_estimate),
        notes: payload.notes?.trim() ? payload.notes.trim() : null,
      })
    return d.prepare('SELECT * FROM treatment_steps WHERE id = ?').get(info.lastInsertRowid)
  },
  updateStep(stepId, payload) {
    const d = ensureDb()
    const status = allowedStepStatuses.has(payload.status) ? payload.status : 'pending'
    d.prepare(
      `UPDATE treatment_steps
       SET step_number = COALESCE(@step_number, step_number),
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
      step_number: payload.step_number ?? null,
      procedure_name: payload.procedure_name,
      description: payload.description?.trim() ? payload.description.trim() : null,
      status,
      scheduled_date: payload.scheduled_date?.trim() ? payload.scheduled_date.trim() : null,
      completed_date: payload.completed_date?.trim() ? payload.completed_date.trim() : null,
      cost_estimate:
        payload.cost_estimate == null || payload.cost_estimate === ''
          ? null
          : Number(payload.cost_estimate),
      notes: payload.notes?.trim() ? payload.notes.trim() : null,
    })
    return d.prepare('SELECT * FROM treatment_steps WHERE id = ?').get(stepId)
  },
  removeStep(stepId) {
    const d = ensureDb()
    const info = d.prepare('DELETE FROM treatment_steps WHERE id = ?').run(stepId)
    return { deleted: info.changes > 0 }
  },
}

