import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import type { AppointmentCreateUpdate, AppointmentStatus, AppointmentWithPatient, Patient } from '../dente-api'
import { getDenteApi } from '../lib/api'
import { Button, Card, Input, Modal, Select, Textarea } from '../ui/components'

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

const appointmentSchema = z.object({
  patient_id: z.coerce.number().int().positive('Select a patient'),
  appointment_date: z.string().min(1, 'Date is required'),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: z.string().optional().or(z.literal('')),
  reason: z.string().trim().max(200).optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']),
})

type AppointmentForm = z.input<typeof appointmentSchema>

function statusBadge(status: AppointmentStatus) {
  const map: Record<AppointmentStatus, string> = {
    scheduled: 'bg-indigo-100 text-indigo-700',
    completed: 'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-slate-200 text-slate-700',
    no_show: 'bg-amber-100 text-amber-900',
  }
  const label: Record<AppointmentStatus, string> = {
    scheduled: 'Scheduled',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No-show',
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{label[status]}</span>
  )
}

export function AppointmentsPage() {
  const [rows, setRows] = useState<AppointmentWithPatient[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [dateFrom, setDateFrom] = useState(() => isoDate(addDays(new Date(), -7)))
  const [dateTo, setDateTo] = useState(() => isoDate(addDays(new Date(), 60)))
  const [showAllDates, setShowAllDates] = useState(false)
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all')
  const [textFilter, setTextFilter] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AppointmentWithPatient | null>(null)
  const [patientSearch, setPatientSearch] = useState('')

  const formDefaults = useMemo<AppointmentForm>(
    () => ({
      patient_id: 0,
      appointment_date: isoDate(new Date()),
      start_time: '09:00',
      end_time: '',
      reason: '',
      notes: '',
      status: 'scheduled',
    }),
    [],
  )

  const editDefaults = useMemo<AppointmentForm>(() => {
    if (!editing) return formDefaults
    return {
      patient_id: editing.patient_id,
      appointment_date: editing.appointment_date,
      start_time: editing.start_time,
      end_time: editing.end_time ?? '',
      reason: editing.reason ?? '',
      notes: editing.notes ?? '',
      status: editing.status,
    }
  }, [editing, formDefaults])

  const form = useForm<AppointmentForm>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: formDefaults,
    mode: 'onBlur',
  })

  const loadPatients = useCallback(async () => {
    try {
      const data = await getDenteApi().patients.list()
      setPatients(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load patients.')
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const api = getDenteApi()
      const data = showAllDates
        ? await api.appointments.listBetween('', '')
        : await api.appointments.listBetween(dateFrom, dateTo)
      setRows(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load appointments.')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, showAllDates])

  useEffect(() => {
    loadPatients()
  }, [loadPatients])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (modalOpen) {
      if (editing) {
        form.reset(editDefaults)
      } else {
        form.reset(formDefaults)
      }
      setPatientSearch('')
    }
  }, [modalOpen, editing, form, editDefaults, formDefaults])

  const filteredRows = useMemo(() => {
    const q = textFilter.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (!q) return true
      return (
        r.patient_name.toLowerCase().includes(q) ||
        String(r.reason ?? '').toLowerCase().includes(q) ||
        String(r.notes ?? '').toLowerCase().includes(q) ||
        String(r.id).includes(q)
      )
    })
  }, [rows, statusFilter, textFilter])

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase()
    if (!q) return patients
    return patients.filter((p) => {
      return (
        p.full_name.toLowerCase().includes(q) ||
        String(p.id).includes(q) ||
        String(p.phone ?? '').toLowerCase().includes(q)
      )
    })
  }, [patientSearch, patients])

  async function onSubmit(values: AppointmentForm) {
    try {
      setErr(null)
      const payload: AppointmentCreateUpdate = {
        patient_id: Number(values.patient_id),
        appointment_date: values.appointment_date,
        start_time: values.start_time,
        end_time: values.end_time?.trim() ? values.end_time.trim() : null,
        reason: values.reason?.trim() ? values.reason.trim() : null,
        notes: values.notes?.trim() ? values.notes.trim() : null,
        status: values.status as AppointmentStatus,
      }
      const api = getDenteApi()
      if (editing) {
        await api.appointments.update(editing.id, payload)
      } else {
        await api.appointments.create(payload)
      }
      setModalOpen(false)
      setEditing(null)
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save appointment.')
    }
  }

  async function onDelete(row: AppointmentWithPatient) {
    const ok = confirm(`Delete appointment #${row.id} (${row.patient_name})?`)
    if (!ok) return
    try {
      setErr(null)
      await getDenteApi().appointments.delete(row.id)
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete appointment.')
    }
  }

  function openAdd() {
    setEditing(null)
    setPatientSearch('')
    setModalOpen(true)
  }

  function openEdit(row: AppointmentWithPatient) {
    setEditing(row)
    setPatientSearch('')
    setModalOpen(true)
  }

  function setTodayRange() {
    const t = isoDate(new Date())
    setShowAllDates(false)
    setDateFrom(t)
    setDateTo(t)
  }

  function setWeekRange() {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now.getFullYear(), now.getMonth(), diff)
    setShowAllDates(false)
    setDateFrom(isoDate(monday))
    setDateTo(isoDate(addDays(monday, 6)))
  }

  function setNext30Days() {
    setShowAllDates(false)
    setDateFrom(isoDate(new Date()))
    setDateTo(isoDate(addDays(new Date(), 30)))
  }

  return (
    <div className="space-y-5">
      <Card
        title="Appointments"
        subtitle="Schedule visits, filter by date range, and track status (scheduled, completed, cancelled, no-show)."
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="text-xs text-slate-500">{loading ? 'Loading…' : `${filteredRows.length} shown`}</div>
            <Button variant="secondary" size="sm" onClick={() => refresh()} disabled={loading}>
              Refresh
            </Button>
            <Button size="sm" onClick={openAdd}>
              New appointment
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Input
            label="From date"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setShowAllDates(false)
              setDateFrom(e.target.value)
            }}
            disabled={showAllDates}
          />
          <Input
            label="To date"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setShowAllDates(false)
              setDateTo(e.target.value)
            }}
            disabled={showAllDates}
          />
          <Select
            label="Status filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | 'all')}
          >
            <option value="all">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No-show</option>
          </Select>
          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="size-4 rounded border-slate-300 text-indigo-600"
                checked={showAllDates}
                onChange={(e) => setShowAllDates(e.target.checked)}
              />
              Show all dates
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={setTodayRange}>
            Today
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={setWeekRange}>
            This week
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={setNext30Days}>
            Next 30 days
          </Button>
        </div>

        <div className="mt-4">
          <Input
            label="Filter list"
            placeholder="Patient name, reason, notes, or appointment ID…"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
          />
        </div>

        {err ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div> : null}

        <div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
          <table className="min-w-[900px] w-full border-collapse bg-white text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredRows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-slate-700">{r.appointment_date}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.start_time}
                    {r.end_time ? ` – ${r.end_time}` : ''}
                  </td>
                  <td className="px-4 py-3 text-slate-900">
                    <span className="font-medium">{r.patient_name}</span>
                    <span className="ml-2 text-xs text-slate-500">ID {r.patient_id}</span>
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-slate-700" title={r.reason ?? ''}>
                    {r.reason ?? '—'}
                  </td>
                  <td className="px-4 py-3">{statusBadge(r.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(r)}>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => onDelete(r)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>
                    No appointments in this range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        title={editing ? `Edit appointment #${editing.id}` : 'New appointment'}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
      >
        <form className="grid gap-4 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="md:col-span-2">
            <Input
              label="Search patient"
              placeholder="Search by name, ID, or phone…"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Select
              label="Patient *"
              hint={`${filteredPatients.length} match${filteredPatients.length === 1 ? '' : 'es'}`}
              {...form.register('patient_id')}
              error={form.formState.errors.patient_id?.message}
            >
              <option value={0} disabled>
                Choose a patient…
              </option>
              {filteredPatients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} (ID {p.id}{p.phone ? `, ${p.phone}` : ''})
                </option>
              ))}
            </Select>
          </div>
          <Input
            label="Date *"
            type="date"
            {...form.register('appointment_date')}
            error={form.formState.errors.appointment_date?.message}
          />
          <Input
            label="Start time *"
            type="time"
            {...form.register('start_time')}
            error={form.formState.errors.start_time?.message}
          />
          <Input label="End time" type="time" {...form.register('end_time')} error={form.formState.errors.end_time?.message} />
          <Select label="Status *" {...form.register('status')} error={form.formState.errors.status?.message}>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No-show</option>
          </Select>
          <div className="md:col-span-2">
            <Input
              label="Reason / planned procedure"
              placeholder="e.g., Cleaning, follow-up"
              {...form.register('reason')}
              error={form.formState.errors.reason?.message}
            />
          </div>
          <div className="md:col-span-2">
            <Textarea label="Notes" placeholder="Internal notes…" {...form.register('notes')} error={form.formState.errors.notes?.message} />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setModalOpen(false)
                setEditing(null)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {editing ? 'Save changes' : 'Create appointment'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
