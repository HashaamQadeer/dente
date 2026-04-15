import path from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'

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

    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
    CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
  `)

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
    ).run({
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
    ).run({
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
    ).run({
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

