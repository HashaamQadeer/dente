import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useLocation } from 'react-router-dom'

import type { MedicalHistory, MedicalHistoryUpsert, Patient, PatientCreateUpdate, Procedure, ProcedureCreateUpdate } from '../dente-api'
import { getDenteApi } from '../lib/api'
import { Button, Card, Input, Modal, Select } from '../ui/components'

const patientSchema = z.object({
  full_name: z.string().trim().min(1, 'Name is required').max(120, 'Too long'),
  dob: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(['Male', 'Female', 'Other'], { message: 'Gender is required' }),
  address: z.string().trim().max(250, 'Too long').optional().or(z.literal('')),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || /^[+()\-.\s0-9]{7,20}$/.test(v), 'Invalid phone number'),
  email: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Invalid email'),
})

type PatientForm = z.infer<typeof patientSchema>

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

const bloodGroupColors: Record<string, string> = {
  'A+': 'bg-red-100 text-red-800 border-red-200',
  'A-': 'bg-red-100 text-red-800 border-red-200',
  'B+': 'bg-blue-100 text-blue-800 border-blue-200',
  'B-': 'bg-blue-100 text-blue-800 border-blue-200',
  'AB+': 'bg-purple-100 text-purple-800 border-purple-200',
  'AB-': 'bg-purple-100 text-purple-800 border-purple-200',
  'O+': 'bg-green-100 text-green-800 border-green-200',
  'O-': 'bg-green-100 text-green-800 border-green-200',
}

const conditionOptions = ['Diabetes', 'Hypertension', 'Heart Disease', 'Blood Thinners', 'Asthma', 'Other'] as const

function splitCsv(v: string | null | undefined) {
  return (v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

export function PatientsPage() {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Patient[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [editing, setEditing] = useState<Patient | null>(null)
  const [proceduresFor, setProceduresFor] = useState<Patient | null>(null)
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [procLoading, setProcLoading] = useState(false)
  const [procEditing, setProcEditing] = useState<Procedure | null>(null)

  const location = useLocation()
  const [highlightPatientId, setHighlightPatientId] = useState<number | null>(null)

  const [mhByPatient, setMhByPatient] = useState<Record<number, MedicalHistory | null>>({})
  const [mhLoadingByPatient, setMhLoadingByPatient] = useState<Record<number, boolean>>({})

  const [mhFor, setMhFor] = useState<MedicalHistory | null>(null)
  const [mhLoading, setMhLoading] = useState(false)
  const [mhErr, setMhErr] = useState<string | null>(null)
  const [mhEditing, setMhEditing] = useState(false)

  const [mhBlood, setMhBlood] = useState<string>('')
  const [mhAllergies, setMhAllergies] = useState<string[]>([])
  const [mhAllergyText, setMhAllergyText] = useState('')
  const [mhConditions, setMhConditions] = useState<string[]>([])
  const [mhOtherCondition, setMhOtherCondition] = useState('')
  const [mhMeds, setMhMeds] = useState('')
  const [mhPrevDental, setMhPrevDental] = useState('')
  const [mhEmgName, setMhEmgName] = useState('')
  const [mhEmgPhone, setMhEmgPhone] = useState('')
  const [mhEmgRelation, setMhEmgRelation] = useState('')

  const editDefaults = useMemo<PatientForm>(
    () => ({
      full_name: editing?.full_name ?? '',
      dob: editing?.dob ?? '',
      gender: (editing?.gender as PatientForm['gender']) ?? 'Male',
      address: editing?.address ?? '',
      phone: editing?.phone ?? '',
      email: editing?.email ?? '',
    }),
    [editing],
  )

  const editForm = useForm<PatientForm>({
    resolver: zodResolver(patientSchema),
    values: editDefaults,
    mode: 'onBlur',
  })

  const procAddDefaults = useMemo<ProcedureForm>(
    () => ({
      procedure_name: '',
      procedure_date: '',
      cost: 0,
      paid: 0,
      balance: 0,
    }),
    [],
  )

  const procAddForm = useForm<ProcedureForm>({
    resolver: zodResolver(procedureSchema),
    defaultValues: procAddDefaults,
    mode: 'onBlur',
  })

  const procEditDefaults = useMemo<ProcedureForm>(
    () => ({
      procedure_name: procEditing?.procedure_name ?? '',
      procedure_date: procEditing?.procedure_date ?? '',
      cost: procEditing?.cost ?? 0,
      paid: procEditing?.paid ?? 0,
      balance: procEditing?.balance ?? 0,
    }),
    [procEditing],
  )

  const procEditForm = useForm<ProcedureForm>({
    resolver: zodResolver(procedureSchema),
    values: procEditDefaults,
    mode: 'onBlur',
  })

  async function refresh(currentQuery: string) {
    setLoading(true)
    setErr(null)
    try {
      const api = getDenteApi()
      const q = currentQuery.trim()
      const data = q
        ? await api.patients.searchByName(q)
        : await api.patients.list()
      setRows(data)

      // Load medical history summaries for badges/tooltips
      const ids = data.map((p) => p.id)
      setMhLoadingByPatient((prev) => {
        const next = { ...prev }
        for (const id of ids) next[id] = true
        return next
      })
      await Promise.all(
        ids.map(async (id) => {
          try {
            const mh = await getDenteApi().getMedicalHistory(id)
            setMhByPatient((prev) => ({ ...prev, [id]: mh }))
          } finally {
            setMhLoadingByPatient((prev) => ({ ...prev, [id]: false }))
          }
        }),
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load patients.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh('')
  }, [])

  // Auto-calc balance for procedure add form
  const addCost = procAddForm.watch('cost')
  const addPaid = procAddForm.watch('paid')
  useEffect(() => {
    procAddForm.setValue('balance', computeBalance(Number(addCost), Number(addPaid)), { shouldValidate: true })
  }, [addCost, addPaid, procAddForm])

  async function loadProcedures(patientId: number) {
    setProcLoading(true)
    try {
      const data = await getDenteApi().procedures.listByPatient(patientId)
      setProcedures(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load procedures.')
    } finally {
      setProcLoading(false)
    }
  }

  async function openProcedures(patient: Patient) {
    setProceduresFor(patient)
    procAddForm.reset(procAddDefaults)
    setProcEditing(null)
    setMhEditing(false)
    setMhErr(null)
    setMhFor(null)
    setMhLoading(true)
    try {
      const mh = await getDenteApi().getMedicalHistory(patient.id)
      setMhFor(mh)
      const allergies = splitCsv(mh?.allergies)
      const conditions = splitCsv(mh?.existing_conditions)
      const other = conditions.find((c) => !conditionOptions.includes(c as (typeof conditionOptions)[number])) ?? ''
      setMhBlood(mh?.blood_group ?? '')
      setMhAllergies(allergies)
      setMhAllergyText('')
      setMhConditions(conditions.filter((c) => conditionOptions.includes(c as (typeof conditionOptions)[number])))
      setMhOtherCondition(other)
      setMhMeds(mh?.current_medications ?? '')
      setMhPrevDental(mh?.previous_dental_history ?? '')
      setMhEmgName(mh?.emergency_contact_name ?? '')
      setMhEmgPhone(mh?.emergency_contact_phone ?? '')
      setMhEmgRelation(mh?.emergency_contact_relation ?? '')
    } catch (e) {
      setMhErr(e instanceof Error ? e.message : 'Failed to load medical history.')
    } finally {
      setMhLoading(false)
    }
    await loadProcedures(patient.id)
  }

  function normalizeChip(v: string) {
    return v
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^,|,$/g, '')
  }

  function addAllergy(raw: string) {
    const v = normalizeChip(raw)
    if (!v) return
    setMhAllergies((prev) => (prev.some((x) => x.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]))
  }

  function removeAllergy(v: string) {
    setMhAllergies((prev) => prev.filter((x) => x !== v))
  }

  function toggleCondition(v: (typeof conditionOptions)[number]) {
    setMhConditions((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))
  }

  async function saveMedicalHistory() {
    if (!proceduresFor) return
    try {
      setMhErr(null)
      setMhLoading(true)
      const existingConditions = mhConditions.includes('Other')
        ? Array.from(new Set([...mhConditions.filter((c) => c !== 'Other'), mhOtherCondition.trim()].filter(Boolean)))
        : mhConditions
      const payload: MedicalHistoryUpsert = {
        blood_group: mhBlood.trim() ? mhBlood.trim() : null,
        allergies: mhAllergies.length ? mhAllergies.join(', ') : null,
        existing_conditions: existingConditions.length ? existingConditions.join(', ') : null,
        current_medications: mhMeds.trim() ? mhMeds.trim() : null,
        previous_dental_history: mhPrevDental.trim() ? mhPrevDental.trim() : null,
        emergency_contact_name: mhEmgName.trim() ? mhEmgName.trim() : null,
        emergency_contact_phone: mhEmgPhone.trim() ? mhEmgPhone.trim() : null,
        emergency_contact_relation: mhEmgRelation.trim() ? mhEmgRelation.trim() : null,
      }
      const saved = await getDenteApi().upsertMedicalHistory(proceduresFor.id, payload)
      setMhFor(saved)
      setMhByPatient((prev) => ({ ...prev, [proceduresFor.id]: saved }))
      setMhEditing(false)
    } catch (e) {
      setMhErr(e instanceof Error ? e.message : 'Failed to save medical history.')
    } finally {
      setMhLoading(false)
    }
  }

  useEffect(() => {
    const st = location.state as { openPatientId?: number } | null
    if (!st?.openPatientId) return
    setHighlightPatientId(st.openPatientId)
    const p = rows.find((x) => x.id === st.openPatientId)
    if (p) openProcedures(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, rows])

  async function onProcedureAddSubmit(values: ProcedureForm) {
    if (!proceduresFor) return
    try {
      setErr(null)
      const payload: ProcedureCreateUpdate = {
        procedure_name: values.procedure_name.trim(),
        procedure_date: values.procedure_date,
        cost: Number(values.cost) || 0,
        paid: Number(values.paid) || 0,
        balance: Number(values.balance) || 0,
      }
      await getDenteApi().procedures.create(proceduresFor.id, payload)
      procAddForm.reset(procAddDefaults)
      await loadProcedures(proceduresFor.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add procedure.')
    }
  }

  async function onProcedureEditSubmit(values: ProcedureForm) {
    if (!procEditing || !proceduresFor) return
    try {
      setErr(null)
      const payload: ProcedureCreateUpdate = {
        procedure_name: values.procedure_name.trim(),
        procedure_date: values.procedure_date,
        cost: Number(values.cost) || 0,
        paid: Number(values.paid) || 0,
        balance: Number(values.balance) || 0,
      }
      await getDenteApi().procedures.update(procEditing.id, payload)
      setProcEditing(null)
      await loadProcedures(proceduresFor.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update procedure.')
    }
  }

  async function onProcedureDelete(row: Procedure) {
    const ok = confirm(`Delete procedure "${row.procedure_name}"? This cannot be undone.`)
    if (!ok) return
    try {
      setErr(null)
      await getDenteApi().procedures.delete(row.id)
      if (proceduresFor) await loadProcedures(proceduresFor.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete procedure.')
    }
  }

  async function onEditSubmit(values: PatientForm) {
    if (!editing) return
    try {
      setErr(null)
      const payload: PatientCreateUpdate = {
        full_name: values.full_name.trim(),
        dob: values.dob,
        gender: values.gender,
        address: values.address?.trim() ? values.address.trim() : null,
        phone: values.phone?.trim() ? values.phone.trim() : null,
        email: values.email?.trim() ? values.email.trim() : null,
      }
      await getDenteApi().patients.update(editing.id, payload)
      setEditing(null)
      await refresh(query)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update patient.')
    }
  }

  async function onDelete(patient: Patient) {
    const ok = confirm(`Delete patient "${patient.full_name}" (ID ${patient.id})? This cannot be undone.`)
    if (!ok) return
    try {
      setErr(null)
      await getDenteApi().patients.delete(patient.id)
      await refresh(query)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete patient.')
    }
  }

  return (
    <div className="space-y-5">
      <Card
        title="Patients"
        subtitle="Search by name, patient ID, or phone number. Patients can share the same name, so use the ID or phone to distinguish them."
        right={
          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-500">{loading ? 'Loading…' : `${rows.length} total`}</div>
            <Button variant="secondary" size="sm" onClick={() => refresh(query)} disabled={loading}>
              Refresh
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <Input
              label="Search by name, ID, or phone"
              placeholder="Name, patient ID, or phone number…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') refresh(query)
              }}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              className="w-full"
              variant="secondary"
              onClick={() => {
                setQuery('')
                refresh('')
              }}
              disabled={loading}
            >
              Clear
            </Button>
            <Button className="w-full" onClick={() => refresh(query)} disabled={loading}>
              Search
            </Button>
          </div>
        </div>

        {err ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div> : null}

        <div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
          <table className="min-w-[900px] w-full border-collapse bg-white text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">DOB</th>
                <th className="px-4 py-3">Gender</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((p) => (
                <tr
                  key={p.id}
                  className={[
                    'hover:bg-slate-50/60',
                    highlightPatientId === p.id ? 'bg-indigo-50/60' : '',
                  ].join(' ')}
                >
                  <td
                    className="px-4 py-3 font-medium text-slate-900 cursor-pointer"
                    title="Click to view procedures"
                    onClick={() => openProcedures(p)}
                  >
                    {p.id}
                  </td>
                  <td className="px-4 py-3 text-slate-900">
                    <button
                      type="button"
                      className="text-left font-semibold text-indigo-700 hover:text-indigo-800"
                      title="Click to view procedures"
                      onClick={() => openProcedures(p)}
                    >
                      <span className="inline-flex items-center gap-2">
                        {p.full_name}
                        {mhByPatient[p.id]?.blood_group ? (
                          <span
                            className={[
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold',
                              bloodGroupColors[mhByPatient[p.id]?.blood_group ?? ''] ??
                                'bg-slate-100 text-slate-800 border-slate-200',
                            ].join(' ')}
                            title="Blood group"
                          >
                            {mhByPatient[p.id]?.blood_group}
                          </span>
                        ) : null}
                        {splitCsv(mhByPatient[p.id]?.allergies).length ? (
                          <span className="relative inline-flex items-center group">
                            <span className="text-amber-500" aria-label="Allergy warning" title="Allergies recorded">
                              ⚠
                            </span>
                            <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-max -translate-x-1/2 rounded-lg bg-slate-800 px-2 py-1 text-xs text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                              Allergies: {splitCsv(mhByPatient[p.id]?.allergies).join(', ')}
                            </span>
                          </span>
                        ) : null}
                        {mhLoadingByPatient[p.id] ? (
                          <span className="text-xs text-slate-400">(loading…)</span>
                        ) : null}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{p.dob}</td>
                  <td className="px-4 py-3 text-slate-700">{p.gender}</td>
                  <td className="px-4 py-3 text-slate-700">{p.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{p.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditing(p)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(p)
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                    No patients found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        title={editing ? `Edit patient (ID ${editing.id})` : 'Edit patient'}
        open={!!editing}
        onClose={() => setEditing(null)}
      >
        <form className="grid gap-4 md:grid-cols-2" onSubmit={editForm.handleSubmit(onEditSubmit)}>
          <Input
            label="Full name *"
            placeholder="e.g., Ahmed Ali"
            autoComplete="off"
            {...editForm.register('full_name')}
            error={editForm.formState.errors.full_name?.message}
          />

          <Input
            label="Date of birth *"
            type="date"
            {...editForm.register('dob')}
            error={editForm.formState.errors.dob?.message}
          />

          <Select label="Gender *" {...editForm.register('gender')} error={editForm.formState.errors.gender?.message}>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </Select>

          <Input
            label="Phone number"
            placeholder="e.g., +92 300 1234567"
            autoComplete="off"
            {...editForm.register('phone')}
            error={editForm.formState.errors.phone?.message}
          />

          <Input
            label="Email"
            placeholder="e.g., patient@email.com"
            autoComplete="off"
            {...editForm.register('email')}
            error={editForm.formState.errors.email?.message}
          />

          <div className="md:col-span-2">
            <Input
              label="Address"
              placeholder="Street, city, etc."
              autoComplete="off"
              {...editForm.register('address')}
              error={editForm.formState.errors.address?.message}
            />
          </div>

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

      <Modal
        title={
          proceduresFor
            ? `Procedures — ${proceduresFor.full_name} (ID ${proceduresFor.id})`
            : 'Procedures'
        }
        open={!!proceduresFor}
        onClose={() => {
          setProceduresFor(null)
          setProcedures([])
          setProcEditing(null)
          setMhFor(null)
          setMhEditing(false)
          setMhErr(null)
        }}
      >
        <div className="space-y-4">
          {proceduresFor ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-slate-500">Patient</div>
                  <div className="mt-0.5 text-base font-semibold text-slate-900">
                    {proceduresFor.full_name}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    ID {proceduresFor.id}
                    {proceduresFor.phone ? <span className="ml-3">Phone: {proceduresFor.phone}</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {mhFor?.blood_group ? (
                    <span
                      className={[
                        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
                        bloodGroupColors[mhFor.blood_group] ?? 'bg-slate-100 text-slate-800 border-slate-200',
                      ].join(' ')}
                    >
                      {mhFor.blood_group}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">Medical History</div>
              <div className="flex items-center gap-2">
                {mhEditing ? (
                  <Button variant="secondary" size="sm" onClick={() => setMhEditing(false)} disabled={mhLoading}>
                    Cancel
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => setMhEditing(true)} disabled={mhLoading}>
                    Edit
                  </Button>
                )}
              </div>
            </div>

            {mhErr ? (
              <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {mhErr}
              </div>
            ) : null}

            {mhLoading ? (
              <div className="px-4 py-4 text-sm text-slate-500">Loading medical history…</div>
            ) : mhEditing ? (
              <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
                <Select label="Blood group" value={mhBlood} onChange={(e) => setMhBlood(e.target.value)}>
                  <option value="">(none)</option>
                  {Object.keys(bloodGroupColors).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>

                <div className="md:col-span-2">
                  <div className="text-sm font-medium text-slate-800">Allergies</div>
                  <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {mhAllergies.map((a) => (
                        <span
                          key={a}
                          className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800"
                        >
                          {a}
                          <button
                            type="button"
                            className="ml-0.5 grid size-4 place-items-center rounded-full text-blue-800/70 hover:bg-blue-200 hover:text-blue-900"
                            aria-label={`Remove ${a}`}
                            onClick={() => removeAllergy(a)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <input
                        className="h-8 min-w-[180px] flex-1 border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                        placeholder="Type and press Enter…"
                        value={mhAllergyText}
                        onChange={(e) => setMhAllergyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault()
                            addAllergy(mhAllergyText)
                            setMhAllergyText('')
                          } else if (e.key === 'Backspace' && !mhAllergyText && mhAllergies.length) {
                            removeAllergy(mhAllergies[mhAllergies.length - 1])
                          }
                        }}
                        onBlur={() => {
                          if (mhAllergyText.trim()) {
                            addAllergy(mhAllergyText)
                            setMhAllergyText('')
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="text-sm font-medium text-slate-800">Existing conditions</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {conditionOptions.map((c) => (
                      <label
                        key={c}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                      >
                        <input
                          type="checkbox"
                          className="size-4 rounded border-slate-300 text-indigo-600"
                          checked={mhConditions.includes(c)}
                          onChange={() => toggleCondition(c)}
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                  {mhConditions.includes('Other') ? (
                    <div className="mt-3">
                      <Input
                        label='If "Other", specify'
                        placeholder="e.g., Kidney disease"
                        value={mhOtherCondition}
                        onChange={(e) => setMhOtherCondition(e.target.value)}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="md:col-span-2">
                  <label className="block">
                    <div className="text-sm font-medium text-slate-800">Current medications</div>
                    <textarea
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      placeholder="e.g. Metformin 500mg twice daily"
                      value={mhMeds}
                      onChange={(e) => setMhMeds(e.target.value)}
                    />
                  </label>
                </div>

                <div className="md:col-span-2">
                  <label className="block">
                    <div className="text-sm font-medium text-slate-800">Previous dental history</div>
                    <textarea
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      placeholder="e.g. Extracted upper right molar in 2019..."
                      value={mhPrevDental}
                      onChange={(e) => setMhPrevDental(e.target.value)}
                    />
                  </label>
                </div>

                <div className="md:col-span-2">
                  <div className="text-sm font-medium text-slate-800">Emergency contact</div>
                  <div className="mt-2 grid gap-4 md:grid-cols-3">
                    <Input label="Name" value={mhEmgName} onChange={(e) => setMhEmgName(e.target.value)} />
                    <Input label="Phone" value={mhEmgPhone} onChange={(e) => setMhEmgPhone(e.target.value)} />
                    <Input label="Relation" value={mhEmgRelation} onChange={(e) => setMhEmgRelation(e.target.value)} />
                  </div>
                </div>

                <div className="md:col-span-2 flex justify-end gap-2 pt-1">
                  <Button variant="secondary" type="button" onClick={() => setMhEditing(false)} disabled={mhLoading}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={saveMedicalHistory} disabled={mhLoading || !proceduresFor}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Blood group</div>
                  <div className="mt-1">
                    {mhFor?.blood_group ? (
                      <span
                        className={[
                          'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
                          bloodGroupColors[mhFor.blood_group] ?? 'bg-slate-100 text-slate-800 border-slate-200',
                        ].join(' ')}
                      >
                        {mhFor.blood_group}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-500">None recorded</span>
                    )}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Allergies</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {splitCsv(mhFor?.allergies).length ? (
                      splitCsv(mhFor?.allergies).map((a) => (
                        <span key={a} className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
                          {a}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">None recorded</span>
                    )}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Existing conditions</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {splitCsv(mhFor?.existing_conditions).length ? (
                      splitCsv(mhFor?.existing_conditions).map((c) => (
                        <span key={c} className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          <span className="mr-1">✓</span>
                          {c}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">None recorded</span>
                    )}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current medications</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                    {mhFor?.current_medications?.trim() ? mhFor.current_medications : <span className="text-slate-500">None recorded</span>}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Previous dental history</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                    {mhFor?.previous_dental_history?.trim() ? mhFor.previous_dental_history : <span className="text-slate-500">None recorded</span>}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {procLoading ? 'Loading procedures…' : `${procedures.length} procedure(s)`}
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">Add procedure</div>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={procAddForm.handleSubmit(onProcedureAddSubmit)}>
              <div className="md:col-span-2">
                <Input
                  label="Procedure name *"
                  placeholder="e.g., Extraction"
                  {...procAddForm.register('procedure_name')}
                  error={procAddForm.formState.errors.procedure_name?.message}
                />
              </div>
              <Input
                label="Date *"
                type="date"
                {...procAddForm.register('procedure_date')}
                error={procAddForm.formState.errors.procedure_date?.message}
              />
              <Input
                label="Cost"
                type="number"
                step="0.01"
                {...procAddForm.register('cost')}
                error={procAddForm.formState.errors.cost?.message}
              />
              <Input
                label="Paid"
                type="number"
                step="0.01"
                {...procAddForm.register('paid')}
                error={procAddForm.formState.errors.paid?.message}
              />
              <Input
                label="Balance"
                type="number"
                step="0.01"
                {...procAddForm.register('balance')}
                error={procAddForm.formState.errors.balance?.message}
                hint="Auto-calculated from cost - paid (you can override)."
              />
              <div className="md:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => procAddForm.reset(procAddDefaults)}>
                  Clear
                </Button>
                <Button type="submit" disabled={procAddForm.formState.isSubmitting || !proceduresFor}>
                  Add
                </Button>
              </div>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">Procedures</div>
              <div className="text-xs text-slate-600">{procLoading ? 'Loading…' : `${procedures.length} total`}</div>
            </div>
            <div className="max-h-[45vh] overflow-auto">
            <table className="min-w-[720px] w-full border-collapse bg-white text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
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
                {procedures.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-slate-700">{r.procedure_date}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.procedure_name}</td>
                    <td className="px-4 py-3 text-slate-700">{r.cost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-700">{r.paid.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-700">{r.balance.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setProcEditing(r)}>
                          Edit
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => onProcedureDelete(r)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {procedures.length === 0 ? (
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
      </Modal>

      <Modal
        title={procEditing ? `Edit procedure (ID ${procEditing.id})` : 'Edit procedure'}
        open={!!procEditing}
        onClose={() => setProcEditing(null)}
      >
        <form className="grid gap-4 md:grid-cols-2" onSubmit={procEditForm.handleSubmit(onProcedureEditSubmit)}>
          <div className="md:col-span-2">
            <Input
              label="Procedure name *"
              placeholder="e.g., Scaling"
              {...procEditForm.register('procedure_name')}
              error={procEditForm.formState.errors.procedure_name?.message}
            />
          </div>
          <Input
            label="Date *"
            type="date"
            {...procEditForm.register('procedure_date')}
            error={procEditForm.formState.errors.procedure_date?.message}
          />
          <Input label="Cost" type="number" step="0.01" {...procEditForm.register('cost')} error={procEditForm.formState.errors.cost?.message} />
          <Input label="Paid" type="number" step="0.01" {...procEditForm.register('paid')} error={procEditForm.formState.errors.paid?.message} />
          <Input
            label="Balance"
            type="number"
            step="0.01"
            {...procEditForm.register('balance')}
            error={procEditForm.formState.errors.balance?.message}
            hint="Normally cost - paid (you can override)."
          />

          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setProcEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={procEditForm.formState.isSubmitting}>
              Save changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

