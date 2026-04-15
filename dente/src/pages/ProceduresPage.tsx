import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import type { Patient, Procedure, ProcedureCreateUpdate } from '../dente-api'
import { getDenteApi } from '../lib/api'
import { Button, Card, Input, Modal, Select } from '../ui/components'

const procedureSchema = z.object({
  procedure_name: z.string().trim().min(1, 'Procedure name is required').max(120, 'Too long'),
  procedure_date: z.string().min(1, 'Date is required'),
  cost: z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number().min(0, 'Must be 0 or more')),
  paid: z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number().min(0, 'Must be 0 or more')),
  balance: z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number().min(0, 'Must be 0 or more')),
})

type ProcedureForm = z.input<typeof procedureSchema>

function computeBalance(cost: number, paid: number) {
  const c = Number(cost) || 0
  const p = Number(paid) || 0
  return Math.max(0, c - p)
}

export function ProceduresPage() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientQuery, setPatientQuery] = useState('')
  const [patientId, setPatientId] = useState<number | null>(null)
  const [rows, setRows] = useState<Procedure[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [editing, setEditing] = useState<Procedure | null>(null)

  const addDefaults = useMemo<ProcedureForm>(
    () => ({
      procedure_name: '',
      procedure_date: '',
      cost: 0,
      paid: 0,
      balance: 0,
    }),
    [],
  )

  const addForm = useForm<ProcedureForm>({
    resolver: zodResolver(procedureSchema),
    defaultValues: addDefaults,
    mode: 'onBlur',
  })

  const editDefaults = useMemo<ProcedureForm>(
    () => ({
      procedure_name: editing?.procedure_name ?? '',
      procedure_date: editing?.procedure_date ?? '',
      cost: editing?.cost ?? 0,
      paid: editing?.paid ?? 0,
      balance: editing?.balance ?? 0,
    }),
    [editing],
  )

  const editForm = useForm<ProcedureForm>({
    resolver: zodResolver(procedureSchema),
    values: editDefaults,
    mode: 'onBlur',
  })

  async function loadPatients() {
    try {
      const data = await getDenteApi().patients.list()
      setPatients(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load patients.')
    }
  }

  async function loadProcedures(pid: number | null) {
    setRows([])
    if (!pid) return
    setLoading(true)
    setErr(null)
    try {
      const data = await getDenteApi().procedures.listByPatient(pid)
      setRows(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load procedures.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPatients()
  }, [])

  useEffect(() => {
    loadProcedures(patientId)
  }, [patientId])

  // Auto-calc balance for add form
  const addCost = addForm.watch('cost')
  const addPaid = addForm.watch('paid')
  useEffect(() => {
    addForm.setValue('balance', computeBalance(Number(addCost), Number(addPaid)), { shouldValidate: true })
  }, [addCost, addPaid, addForm])

  async function onAddSubmit(values: ProcedureForm) {
    if (!patientId) {
      setErr('Please select a patient first.')
      return
    }
    try {
      setErr(null)
      const payload: ProcedureCreateUpdate = {
        procedure_name: values.procedure_name.trim(),
        procedure_date: values.procedure_date,
        cost: Number(values.cost) || 0,
        paid: Number(values.paid) || 0,
        balance: Number(values.balance) || 0,
      }
      await getDenteApi().procedures.create(patientId, payload)
      addForm.reset(addDefaults)
      await loadProcedures(patientId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add procedure.')
    }
  }

  async function onEditSubmit(values: ProcedureForm) {
    if (!editing) return
    try {
      setErr(null)
      const payload: ProcedureCreateUpdate = {
        procedure_name: values.procedure_name.trim(),
        procedure_date: values.procedure_date,
        cost: Number(values.cost) || 0,
        paid: Number(values.paid) || 0,
        balance: Number(values.balance) || 0,
      }
      await getDenteApi().procedures.update(editing.id, payload)
      setEditing(null)
      await loadProcedures(patientId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update procedure.')
    }
  }

  async function onDelete(row: Procedure) {
    const ok = confirm(`Delete procedure "${row.procedure_name}"? This cannot be undone.`)
    if (!ok) return
    try {
      setErr(null)
      await getDenteApi().procedures.delete(row.id)
      await loadProcedures(patientId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete procedure.')
    }
  }

  const selectedPatient = patients.find((p) => p.id === patientId) ?? null
  const filteredPatients = useMemo(() => {
    const q = patientQuery.trim().toLowerCase()
    if (!q) return patients
    return patients.filter((p) => p.full_name.toLowerCase().includes(q) || String(p.id).includes(q))
  }, [patients, patientQuery])

  // If the search narrows to a single patient, auto-select them.
  // If the current selection no longer matches the search, clear selection.
  useEffect(() => {
    const q = patientQuery.trim()
    if (!q) return
    if (filteredPatients.length === 1) {
      setPatientId(filteredPatients[0].id)
      return
    }
    if (patientId && !filteredPatients.some((p) => p.id === patientId)) {
      setPatientId(null)
    }
  }, [filteredPatients, patientId, patientQuery])

  return (
    <div className="space-y-5">
      <Card
        title="Procedures"
        subtitle="Add and manage procedures for each patient."
        right={
          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-500">{loading ? 'Loading…' : `${rows.length} items`}</div>
            <Button variant="secondary" size="sm" onClick={() => loadProcedures(patientId)} disabled={loading}>
              Refresh
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <Input
              label="Search patient"
              placeholder="Type name or ID…"
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Select
              label="Select patient"
              value={patientId ?? ''}
              onChange={(e) => setPatientId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="" disabled>
                {filteredPatients.length ? 'Choose a patient…' : 'No matching patients'}
              </option>
              {filteredPatients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} (ID {p.id})
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="secondary" className="w-full" onClick={loadPatients}>
              Reload patients
            </Button>
          </div>
        </div>

        {patientQuery.trim() ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">Matching patients</div>
              <div className="text-xs text-slate-500">{filteredPatients.length} match(es)</div>
            </div>
            <div className="max-h-56 overflow-auto p-2">
              {filteredPatients.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredPatients.map((p) => {
                    const active = p.id === patientId
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPatientId(p.id)}
                        className={[
                          'rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                          active
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                            : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
                        ].join(' ')}
                        title="Click to view procedures"
                      >
                        <div className="font-semibold">{p.full_name}</div>
                        <div className="text-xs text-slate-500">ID {p.id}</div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="px-3 py-6 text-center text-sm text-slate-500">No matching patients.</div>
              )}
            </div>
          </div>
        ) : null}

        {err ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div> : null}

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <div className="mb-3 text-sm font-semibold text-slate-900">Add procedure</div>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={addForm.handleSubmit(onAddSubmit)}>
              <div className="md:col-span-2">
                <Input
                  label="Procedure name *"
                  placeholder="e.g., Scaling"
                  {...addForm.register('procedure_name')}
                  error={addForm.formState.errors.procedure_name?.message}
                />
              </div>
              <Input
                label="Date *"
                type="date"
                {...addForm.register('procedure_date')}
                error={addForm.formState.errors.procedure_date?.message}
              />
              <Input
                label="Cost"
                type="number"
                step="0.01"
                {...addForm.register('cost')}
                error={addForm.formState.errors.cost?.message}
              />
              <Input
                label="Paid"
                type="number"
                step="0.01"
                {...addForm.register('paid')}
                error={addForm.formState.errors.paid?.message}
              />
              <Input
                label="Balance"
                type="number"
                step="0.01"
                {...addForm.register('balance')}
                error={addForm.formState.errors.balance?.message}
                hint="Auto-calculated from cost - paid (you can override)."
              />
              <div className="md:col-span-2 flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => addForm.reset(addDefaults)}>
                  Clear
                </Button>
                <Button type="submit" disabled={addForm.formState.isSubmitting || !selectedPatient}>
                  Add procedure
                </Button>
              </div>
            </form>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">Procedure list</div>
              <div className="text-xs text-slate-500">
                {selectedPatient ? (
                  <span>
                    {selectedPatient.full_name} (ID {selectedPatient.id})
                  </span>
                ) : (
                  <span>Select a patient to view procedures.</span>
                )}
              </div>
            </div>

            <div className="overflow-auto rounded-2xl border border-slate-200">
              <table className="min-w-[720px] w-full border-collapse bg-white text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Procedure</th>
                    <th className="px-4 py-3">Cost</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Balance</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-slate-700">{r.procedure_date}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{r.procedure_name}</td>
                      <td className="px-4 py-3 text-slate-700">{r.cost.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-700">{r.paid.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-700">{r.balance.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" size="sm" onClick={() => setEditing(r)}>
                            Edit
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => onDelete(r)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>
                        No procedures.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Card>

      <Modal title={editing ? `Edit procedure (ID ${editing.id})` : 'Edit procedure'} open={!!editing} onClose={() => setEditing(null)}>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={editForm.handleSubmit(onEditSubmit)}>
          <div className="md:col-span-2">
            <Input
              label="Procedure name *"
              placeholder="e.g., Scaling"
              {...editForm.register('procedure_name')}
              error={editForm.formState.errors.procedure_name?.message}
            />
          </div>
          <Input
            label="Date *"
            type="date"
            {...editForm.register('procedure_date')}
            error={editForm.formState.errors.procedure_date?.message}
          />
          <Input label="Cost" type="number" step="0.01" {...editForm.register('cost')} error={editForm.formState.errors.cost?.message} />
          <Input label="Paid" type="number" step="0.01" {...editForm.register('paid')} error={editForm.formState.errors.paid?.message} />
          <Input
            label="Balance"
            type="number"
            step="0.01"
            {...editForm.register('balance')}
            error={editForm.formState.errors.balance?.message}
            hint="Normally cost - paid (you can override)."
          />

          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={editForm.formState.isSubmitting}>
              Save changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

