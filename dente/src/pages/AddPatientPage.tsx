import { useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { getDenteApi } from '../lib/api'
import { Button, Card, Input, Select } from '../ui/components'
import type { MedicalHistoryUpsert, PatientCreateUpdate, ProcedureCreateUpdate } from '../dente-api'

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

const bloodGroups = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const
const conditionOptions = ['Diabetes', 'Hypertension', 'Heart Disease', 'Blood Thinners', 'Asthma', 'Other'] as const

export function AddPatientPage() {
  const [status, setStatus] = useState<{ type: 'idle' | 'ok' | 'err'; msg?: string }>({
    type: 'idle',
  })
  const [addProcedureNow, setAddProcedureNow] = useState(false)
  const [mhOpen, setMhOpen] = useState(false)

  const [bloodGroup, setBloodGroup] = useState<(typeof bloodGroups)[number]>('')
  const [allergies, setAllergies] = useState<string[]>([])
  const [allergyText, setAllergyText] = useState('')
  const allergyInputRef = useRef<HTMLInputElement | null>(null)
  const [conditions, setConditions] = useState<string[]>([])
  const [otherCondition, setOtherCondition] = useState('')
  const [currentMeds, setCurrentMeds] = useState('')
  const [prevDental, setPrevDental] = useState('')
  const [emgName, setEmgName] = useState('')
  const [emgPhone, setEmgPhone] = useState('')
  const [emgRelation, setEmgRelation] = useState('')

  const defaults = useMemo<PatientForm>(
    () => ({
      full_name: '',
      dob: '',
      gender: 'Male',
      address: '',
      phone: '',
      email: '',
    }),
    [],
  )

  const form = useForm<PatientForm>({
    resolver: zodResolver(patientSchema),
    defaultValues: defaults,
    mode: 'onBlur',
  })

  const procDefaults = useMemo<ProcedureForm>(
    () => ({
      procedure_name: '',
      procedure_date: '',
      cost: 0,
      paid: 0,
      balance: 0,
    }),
    [],
  )

  const procForm = useForm<ProcedureForm>({
    resolver: zodResolver(procedureSchema),
    defaultValues: procDefaults,
    mode: 'onBlur',
  })

  // Auto-calc balance for procedure add form
  const addCost = procForm.watch('cost')
  const addPaid = procForm.watch('paid')
  useEffect(() => {
    procForm.setValue('balance', computeBalance(Number(addCost), Number(addPaid)), { shouldValidate: true })
  }, [addCost, addPaid, procForm])

  function normalizeChip(v: string) {
    return v
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^,|,$/g, '')
  }

  function addAllergy(raw: string) {
    const v = normalizeChip(raw)
    if (!v) return
    setAllergies((prev) => {
      const next = prev.some((x) => x.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]
      return next
    })
  }

  function removeAllergy(v: string) {
    setAllergies((prev) => prev.filter((x) => x !== v))
  }

  function toggleCondition(v: (typeof conditionOptions)[number]) {
    setConditions((prev) => {
      const has = prev.includes(v)
      const next = has ? prev.filter((x) => x !== v) : [...prev, v]
      return next
    })
  }

  const otherChecked = conditions.includes('Other')

  async function onSubmit(values: PatientForm) {
    try {
      setStatus({ type: 'idle' })
      if (addProcedureNow) {
        const ok = await procForm.trigger()
        if (!ok) {
          setStatus({ type: 'err', msg: 'Please fix the procedure fields.' })
          return
        }
      }

      const payload: PatientCreateUpdate = {
        full_name: values.full_name.trim(),
        dob: values.dob,
        gender: values.gender,
        address: values.address?.trim() ? values.address.trim() : null,
        phone: values.phone?.trim() ? values.phone.trim() : null,
        email: values.email?.trim() ? values.email.trim() : null,
      }
      const created = await getDenteApi().patients.create(payload)

      const existingConditions = otherChecked
        ? Array.from(new Set([...conditions.filter((c) => c !== 'Other'), otherCondition.trim()].filter(Boolean)))
        : conditions

      const mhPayload: MedicalHistoryUpsert = {
        blood_group: bloodGroup || null,
        allergies: allergies.length ? allergies.join(', ') : null,
        existing_conditions: existingConditions.length ? existingConditions.join(', ') : null,
        current_medications: currentMeds.trim() ? currentMeds.trim() : null,
        previous_dental_history: prevDental.trim() ? prevDental.trim() : null,
        emergency_contact_name: emgName.trim() ? emgName.trim() : null,
        emergency_contact_phone: emgPhone.trim() ? emgPhone.trim() : null,
        emergency_contact_relation: emgRelation.trim() ? emgRelation.trim() : null,
      }
      await getDenteApi().upsertMedicalHistory(created.id, mhPayload)

      if (addProcedureNow) {
        const procValues = procForm.getValues()
        const parsed = procedureSchema.safeParse(procValues)
        if (!parsed.success) {
          setStatus({ type: 'err', msg: 'Patient saved, but procedure fields are invalid.' })
          return
        }
        const procPayload: ProcedureCreateUpdate = {
          procedure_name: parsed.data.procedure_name.trim(),
          procedure_date: parsed.data.procedure_date,
          cost: Number(parsed.data.cost) || 0,
          paid: Number(parsed.data.paid) || 0,
          balance: Number(parsed.data.balance) || 0,
        }
        await getDenteApi().procedures.create(created.id, procPayload)
      }

      setStatus({
        type: 'ok',
        msg: addProcedureNow ? 'Patient and procedure added successfully.' : 'Patient added successfully.',
      })
      form.reset(defaults)
      procForm.reset(procDefaults)
      setAddProcedureNow(false)
      setMhOpen(false)
      setBloodGroup('')
      setAllergies([])
      setAllergyText('')
      setConditions([])
      setOtherCondition('')
      setCurrentMeds('')
      setPrevDental('')
      setEmgName('')
      setEmgPhone('')
      setEmgRelation('')
    } catch (e) {
      setStatus({ type: 'err', msg: e instanceof Error ? e.message : 'Failed to add patient.' })
    }
  }

  return (
    <div className="space-y-5">
      <Card
        title="Add a patient"
        subtitle="Fields marked required must be filled (Name, DOB, Gender)."
      >
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <Input
            label="Full name *"
            placeholder="e.g., Ahmed Ali"
            autoComplete="off"
            {...form.register('full_name')}
            error={form.formState.errors.full_name?.message}
          />

          <Input
            label="Date of birth *"
            type="date"
            {...form.register('dob')}
            error={form.formState.errors.dob?.message}
          />

          <Select
            label="Gender *"
            {...form.register('gender')}
            error={form.formState.errors.gender?.message}
          >
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </Select>

          <Input
            label="Phone number"
            placeholder="e.g., +92 300 1234567"
            autoComplete="off"
            {...form.register('phone')}
            error={form.formState.errors.phone?.message}
          />

          <Input
            label="Email"
            placeholder="e.g., patient@email.com"
            autoComplete="off"
            {...form.register('email')}
            error={form.formState.errors.email?.message}
          />

          <div className="md:col-span-2">
            <Input
              label="Address"
              placeholder="Street, city, etc."
              autoComplete="off"
              {...form.register('address')}
              error={form.formState.errors.address?.message}
            />
          </div>

          <div className="md:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setMhOpen((v) => !v)}
                aria-expanded={mhOpen}
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">Medical History (Optional)</div>
                  <div className="mt-0.5 text-xs text-slate-500">All fields are optional. You can edit later.</div>
                </div>
                <div
                  className={[
                    'grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-transform',
                    mhOpen ? 'rotate-180' : 'rotate-0',
                  ].join(' ')}
                  aria-hidden
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M5.25 7.5 10 12.25 14.75 7.5l1.5 1.5L10 15.25 3.75 9l1.5-1.5z" />
                  </svg>
                </div>
              </button>

              <div
                className={[
                  'grid overflow-hidden transition-all duration-300 ease-in-out',
                  mhOpen ? 'grid-rows-[1fr] border-t border-slate-200' : 'grid-rows-[0fr]',
                ].join(' ')}
              >
                <div className="min-h-0">
                  <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
                    <Select
                      label="Blood group"
                      value={bloodGroup}
                      onChange={(e) => setBloodGroup(e.target.value as (typeof bloodGroups)[number])}
                    >
                      <option value="">(none)</option>
                      {bloodGroups
                        .filter((x) => x)
                        .map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                    </Select>

                    <div className="md:col-span-2">
                      <div className="text-sm font-medium text-slate-800">Allergies</div>
                      <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {allergies.map((a) => (
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
                            ref={allergyInputRef}
                            className="h-8 min-w-[180px] flex-1 border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                            placeholder="Type and press Enter…"
                            value={allergyText}
                            onChange={(e) => setAllergyText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ',') {
                                e.preventDefault()
                                addAllergy(allergyText)
                                setAllergyText('')
                                requestAnimationFrame(() => allergyInputRef.current?.focus())
                              } else if (e.key === 'Backspace' && !allergyText && allergies.length) {
                                removeAllergy(allergies[allergies.length - 1])
                              }
                            }}
                            onBlur={() => {
                              if (allergyText.trim()) {
                                addAllergy(allergyText)
                                setAllergyText('')
                              }
                            }}
                          />
                        </div>
                        <div className="mt-1 text-xs text-slate-500">Tip: press comma or Enter to add.</div>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <div className="text-sm font-medium text-slate-800">Existing conditions</div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {conditionOptions.map((c) => {
                          const checked = conditions.includes(c)
                          return (
                            <label
                              key={c}
                              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                            >
                              <input
                                type="checkbox"
                                className="size-4 rounded border-slate-300 text-indigo-600"
                                checked={checked}
                                onChange={() => toggleCondition(c)}
                              />
                              {c}
                            </label>
                          )
                        })}
                      </div>
                      {otherChecked ? (
                        <div className="mt-3">
                          <Input
                            label='If "Other", specify'
                            placeholder="e.g., Kidney disease"
                            value={otherCondition}
                            onChange={(e) => setOtherCondition(e.target.value)}
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
                          value={currentMeds}
                          onChange={(e) => setCurrentMeds(e.target.value)}
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
                          value={prevDental}
                          onChange={(e) => setPrevDental(e.target.value)}
                        />
                      </label>
                    </div>

                    <div className="md:col-span-2">
                      <div className="text-sm font-medium text-slate-800">Emergency contact</div>
                      <div className="mt-2 grid gap-4 md:grid-cols-3">
                        <Input
                          label="Name"
                          placeholder="e.g., Ali Khan"
                          value={emgName}
                          onChange={(e) => setEmgName(e.target.value)}
                        />
                        <Input
                          label="Phone"
                          placeholder="e.g., +92 300 1234567"
                          value={emgPhone}
                          onChange={(e) => setEmgPhone(e.target.value)}
                        />
                        <Input
                          label="Relation"
                          placeholder="e.g., Brother"
                          value={emgRelation}
                          onChange={(e) => setEmgRelation(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <label className="flex items-center gap-3 text-sm font-semibold text-slate-900">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-slate-300 text-indigo-600"
                    checked={addProcedureNow}
                    onChange={(e) => setAddProcedureNow(e.target.checked)}
                  />
                  Add procedure now (optional)
                </label>
                <div className="text-xs text-slate-500">Collapsed by default</div>
              </div>

              {addProcedureNow ? (
                <div className="grid gap-4 border-t border-slate-200 px-4 py-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Input
                      label="Procedure name *"
                      placeholder="e.g., Scaling"
                      {...procForm.register('procedure_name')}
                      error={procForm.formState.errors.procedure_name?.message}
                    />
                  </div>
                  <Input
                    label="Date *"
                    type="date"
                    {...procForm.register('procedure_date')}
                    error={procForm.formState.errors.procedure_date?.message}
                  />
                  <Input
                    label="Cost"
                    type="number"
                    step="0.01"
                    {...procForm.register('cost')}
                    error={procForm.formState.errors.cost?.message}
                  />
                  <Input
                    label="Paid"
                    type="number"
                    step="0.01"
                    {...procForm.register('paid')}
                    error={procForm.formState.errors.paid?.message}
                  />
                  <Input
                    label="Balance"
                    type="number"
                    step="0.01"
                    {...procForm.register('balance')}
                    error={procForm.formState.errors.balance?.message}
                    hint="Auto-calculated from cost - paid (you can override)."
                  />
                  <div className="md:col-span-2 flex justify-end">
                    <Button type="button" variant="secondary" onClick={() => procForm.reset(procDefaults)}>
                      Clear procedure
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="text-sm">
              {status.type === 'ok' ? (
                <span className="text-emerald-700">{status.msg}</span>
              ) : status.type === 'err' ? (
                <span className="text-rose-700">{status.msg}</span>
              ) : (
                <span className="text-slate-500">
                  Data is saved locally on this computer.
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  form.reset(defaults)
                  procForm.reset(procDefaults)
                  setAddProcedureNow(false)
                  setStatus({ type: 'idle' })
                }}
              >
                Clear
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Add patient
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  )
}

