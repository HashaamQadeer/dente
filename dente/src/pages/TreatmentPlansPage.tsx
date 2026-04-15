import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import type {
  Patient,
  TreatmentPlan,
  TreatmentPlanCreateUpdate,
  TreatmentPlanStatus,
  TreatmentPlanWithSteps,
  TreatmentStep,
  TreatmentStepCreateUpdate,
  TreatmentStepStatus,
} from '../dente-api'
import { getDenteApi } from '../lib/api'
import { Button, Card, Input, Modal, Select, Textarea } from '../ui/components'

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function formatCurrency(v: number | null | undefined) {
  const n = Number(v ?? 0) || 0
  return `Rs. ${new Intl.NumberFormat('en-PK').format(Math.round(n))}`
}

const planSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120, 'Too long'),
  description: z.string().trim().max(1000, 'Too long').optional().or(z.literal('')),
  status: z.enum(['active', 'completed', 'cancelled']),
})

type PlanForm = z.input<typeof planSchema>

const stepSchema = z.object({
  procedure_name: z.string().trim().min(1, 'Procedure name is required').max(120, 'Too long'),
  description: z.string().trim().max(1000, 'Too long').optional().or(z.literal('')),
  status: z.enum(['pending', 'in-progress', 'completed']),
  scheduled_date: z.string().optional().or(z.literal('')),
  cost_estimate: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(0).nullable()),
  notes: z.string().trim().max(2000, 'Too long').optional().or(z.literal('')),
})

type StepForm = z.input<typeof stepSchema>

function statusBadge(status: TreatmentPlanStatus) {
  const map: Record<TreatmentPlanStatus, string> = {
    active: 'bg-blue-100 text-blue-800',
    completed: 'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-slate-200 text-slate-700',
  }
  const label: Record<TreatmentPlanStatus, string> = {
    active: 'Active',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${map[status]}`}>{label[status]}</span>
}

function stepDot(status: TreatmentStepStatus) {
  if (status === 'completed') {
    return (
      <span className="grid size-6 place-items-center rounded-full bg-emerald-600 text-white">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path d="M7.5 13.5 4 10l1.5-1.5 2 2L14.5 3.5 16 5l-8.5 8.5Z" />
        </svg>
      </span>
    )
  }
  if (status === 'in-progress') {
    return (
      <span className="relative grid size-6 place-items-center rounded-full bg-blue-600 text-white">
        <span className="absolute inset-0 rounded-full bg-blue-500/40 animate-ping" />
        <span className="relative z-10 size-2 rounded-full bg-white" />
      </span>
    )
  }
  return <span className="size-6 rounded-full border-2 border-slate-300 bg-white" />
}

function planProgress(steps: TreatmentStep[]) {
  const total = steps.length
  const done = steps.filter((s) => s.status === 'completed').length
  const pct = total ? Math.round((done / total) * 100) : 0
  return { total, done, pct }
}

export function TreatmentPlansPage() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientQuery, setPatientQuery] = useState('')
  const [patientId, setPatientId] = useState<number | null>(null)
  const [loadingPatients, setLoadingPatients] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [plans, setPlans] = useState<TreatmentPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)

  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [planDetails, setPlanDetails] = useState<Record<number, TreatmentPlanWithSteps | null>>({})
  const [planLoading, setPlanLoading] = useState<Record<number, boolean>>({})

  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [planEditing, setPlanEditing] = useState<TreatmentPlan | null>(null)

  const [stepModalOpen, setStepModalOpen] = useState(false)
  const [stepEditing, setStepEditing] = useState<TreatmentStep | null>(null)
  const [stepForPlanId, setStepForPlanId] = useState<number | null>(null)

  const planDefaults = useMemo<PlanForm>(
    () => ({
      title: '',
      description: '',
      status: 'active',
    }),
    [],
  )

  const planEditDefaults = useMemo<PlanForm>(() => {
    if (!planEditing) return planDefaults
    return {
      title: planEditing.title ?? '',
      description: planEditing.description ?? '',
      status: planEditing.status,
    }
  }, [planEditing, planDefaults])

  const planForm = useForm<PlanForm>({
    resolver: zodResolver(planSchema),
    defaultValues: planDefaults,
    mode: 'onBlur',
  })

  const stepDefaults = useMemo<StepForm>(
    () => ({
      procedure_name: '',
      description: '',
      status: 'pending',
      scheduled_date: '',
      cost_estimate: null,
      notes: '',
    }),
    [],
  )

  const stepForm = useForm<StepForm>({
    resolver: zodResolver(stepSchema),
    defaultValues: stepDefaults,
    mode: 'onBlur',
  })

  const selectedPatient = patients.find((p) => p.id === patientId) ?? null

  const filteredPatients = useMemo(() => {
    const q = patientQuery.trim().toLowerCase()
    if (!q) return patients
    return patients.filter((p) => {
      return (
        p.full_name.toLowerCase().includes(q) ||
        String(p.id).includes(q) ||
        String(p.phone ?? '').toLowerCase().includes(q)
      )
    })
  }, [patientQuery, patients])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingPatients(true)
      setErr(null)
      try {
        const data = await getDenteApi().patients.list()
        if (cancelled) return
        setPatients(data)
      } catch (e) {
        if (cancelled) return
        setErr(e instanceof Error ? e.message : 'Failed to load patients.')
      } finally {
        if (!cancelled) setLoadingPatients(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!patientId) return
    const pid = patientId
    let cancelled = false
    async function loadPlans() {
      setLoadingPlans(true)
      setErr(null)
      try {
        const data = await getDenteApi().getTreatmentPlans(pid)
        if (cancelled) return
        setPlans(data)
      } catch (e) {
        if (cancelled) return
        setErr(e instanceof Error ? e.message : 'Failed to load treatment plans.')
      } finally {
        if (!cancelled) setLoadingPlans(false)
      }
    }
    loadPlans()
    return () => {
      cancelled = true
    }
  }, [patientId])

  useEffect(() => {
    if (planModalOpen) {
      planForm.reset(planEditing ? planEditDefaults : planDefaults)
    }
  }, [planModalOpen, planEditing, planEditDefaults, planDefaults, planForm])

  useEffect(() => {
    if (stepModalOpen) {
      if (stepEditing) {
        stepForm.reset({
          procedure_name: stepEditing.procedure_name ?? '',
          description: stepEditing.description ?? '',
          status: stepEditing.status,
          scheduled_date: stepEditing.scheduled_date ?? '',
          cost_estimate: stepEditing.cost_estimate ?? null,
          notes: stepEditing.notes ?? '',
        })
      } else {
        stepForm.reset(stepDefaults)
      }
    }
  }, [stepModalOpen, stepEditing, stepDefaults, stepForm])

  async function reloadPlans() {
    if (!patientId) return
    setLoadingPlans(true)
    setErr(null)
    try {
      const data = await getDenteApi().getTreatmentPlans(patientId)
      setPlans(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load treatment plans.')
    } finally {
      setLoadingPlans(false)
    }
  }

  async function ensurePlanDetails(planId: number) {
    if (planDetails[planId]) return
    setPlanLoading((prev) => ({ ...prev, [planId]: true }))
    try {
      const d = await getDenteApi().getTreatmentPlanById(planId)
      setPlanDetails((prev) => ({ ...prev, [planId]: d }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load plan details.')
    } finally {
      setPlanLoading((prev) => ({ ...prev, [planId]: false }))
    }
  }

  async function toggleExpand(planId: number) {
    setExpanded((prev) => ({ ...prev, [planId]: !prev[planId] }))
    await ensurePlanDetails(planId)
  }

  function openNewPlan() {
    setPlanEditing(null)
    setPlanModalOpen(true)
  }

  function openEditPlan(p: TreatmentPlan) {
    setPlanEditing(p)
    setPlanModalOpen(true)
  }

  async function onPlanSubmit(values: PlanForm) {
    if (!patientId) return
    try {
      setErr(null)
      const payload: TreatmentPlanCreateUpdate = {
        title: values.title.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
        status: values.status as TreatmentPlanStatus,
      }
      const api = getDenteApi()
      if (planEditing) {
        await api.updateTreatmentPlan(planEditing.id, payload)
      } else {
        await api.createTreatmentPlan(patientId, payload)
      }
      setPlanModalOpen(false)
      setPlanEditing(null)
      await reloadPlans()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save treatment plan.')
    }
  }

  async function deletePlan(planId: number) {
    const ok = confirm('Delete this treatment plan? This cannot be undone.')
    if (!ok) return
    try {
      setErr(null)
      await getDenteApi().deleteTreatmentPlan(planId)
      setPlanDetails((prev) => ({ ...prev, [planId]: null }))
      setExpanded((prev) => ({ ...prev, [planId]: false }))
      await reloadPlans()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete plan.')
    }
  }

  function openAddStep(planId: number) {
    setStepEditing(null)
    setStepForPlanId(planId)
    setStepModalOpen(true)
  }

  function openEditStep(planId: number, step: TreatmentStep) {
    setStepEditing(step)
    setStepForPlanId(planId)
    setStepModalOpen(true)
  }

  async function reloadPlanDetails(planId: number) {
    setPlanLoading((prev) => ({ ...prev, [planId]: true }))
    try {
      const d = await getDenteApi().getTreatmentPlanById(planId)
      setPlanDetails((prev) => ({ ...prev, [planId]: d }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to reload plan details.')
    } finally {
      setPlanLoading((prev) => ({ ...prev, [planId]: false }))
    }
  }

  async function onStepSubmit(values: StepForm) {
    if (!stepForPlanId) return
    try {
      setErr(null)
      const payload: TreatmentStepCreateUpdate = {
        procedure_name: values.procedure_name.trim(),
        description: values.description?.trim() ? values.description.trim() : null,
        status: values.status as TreatmentStepStatus,
        scheduled_date: values.scheduled_date?.trim() ? values.scheduled_date.trim() : null,
        cost_estimate: values.cost_estimate == null ? null : Number(values.cost_estimate) || 0,
        notes: values.notes?.trim() ? values.notes.trim() : null,
        completed_date:
          values.status === 'completed'
            ? isoDate(new Date())
            : null,
      }
      const api = getDenteApi()
      if (stepEditing) {
        await api.updateTreatmentStep(stepEditing.id, payload)
      } else {
        // step_number is handled by backend; if needed later we can set it from UI ordering
        await api.addTreatmentStep(stepForPlanId, payload)
      }
      setStepModalOpen(false)
      setStepEditing(null)
      await reloadPlanDetails(stepForPlanId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save step.')
    }
  }

  async function deleteStep(planId: number, stepId: number) {
    const ok = confirm('Delete this step?')
    if (!ok) return
    try {
      setErr(null)
      await getDenteApi().deleteTreatmentStep(stepId)
      await reloadPlanDetails(planId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete step.')
    }
  }

  async function markStepComplete(planId: number, step: TreatmentStep) {
    if (step.status === 'completed') return
    try {
      setErr(null)
      await getDenteApi().updateTreatmentStep(step.id, {
        procedure_name: step.procedure_name,
        description: step.description ?? null,
        status: 'completed',
        scheduled_date: step.scheduled_date ?? null,
        completed_date: isoDate(new Date()),
        cost_estimate: step.cost_estimate ?? null,
        notes: step.notes ?? null,
      })
      await reloadPlanDetails(planId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to mark step complete.')
    }
  }

  async function reorderStep(planId: number, steps: TreatmentStep[], idx: number, dir: -1 | 1) {
    const a = steps[idx]
    const b = steps[idx + dir]
    if (!a || !b) return
    try {
      setErr(null)
      await Promise.all([
        getDenteApi().updateTreatmentStep(a.id, {
          procedure_name: a.procedure_name,
          description: a.description ?? null,
          status: a.status,
          scheduled_date: a.scheduled_date ?? null,
          completed_date: a.completed_date ?? null,
          cost_estimate: a.cost_estimate ?? null,
          notes: a.notes ?? null,
          step_number: b.step_number,
        }),
        getDenteApi().updateTreatmentStep(b.id, {
          procedure_name: b.procedure_name,
          description: b.description ?? null,
          status: b.status,
          scheduled_date: b.scheduled_date ?? null,
          completed_date: b.completed_date ?? null,
          cost_estimate: b.cost_estimate ?? null,
          notes: b.notes ?? null,
          step_number: a.step_number,
        }),
      ])
      await reloadPlanDetails(planId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to reorder steps.')
    }
  }

  return (
    <div className="space-y-5">
      <Card
        title="Treatment Plans"
        subtitle="Create and manage multi-step treatment plans for each patient."
        right={
          patientId ? (
            <Button variant="secondary" size="sm" onClick={() => { setPatientId(null); setPatientQuery('') }}>
              Change patient
            </Button>
          ) : (
            <div className="text-xs text-slate-500">{loadingPatients ? 'Loading…' : `${patients.length} patients`}</div>
          )
        }
      >
        {!patientId ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <Input
                label="Search patient"
                placeholder="Search by name, ID, or phone…"
                value={patientQuery}
                onChange={(e) => setPatientQuery(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Select
                label="Select patient"
                value={patientId ?? ''}
                onChange={(e) => setPatientId(e.target.value ? Number(e.target.value) : null)}
                hint={patientQuery.trim() ? `${filteredPatients.length} match(es)` : undefined}
              >
                <option value="" disabled>
                  {filteredPatients.length ? 'Choose a patient…' : 'No matching patients'}
                </option>
                {filteredPatients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} (ID {p.id}{p.phone ? `, ${p.phone}` : ''})
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="secondary"
                className="w-full"
                onClick={async () => {
                  setLoadingPatients(true)
                  setErr(null)
                  try {
                    setPatients(await getDenteApi().patients.list())
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Failed to reload patients.')
                  } finally {
                    setLoadingPatients(false)
                  }
                }}
              >
                Reload patients
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{selectedPatient?.full_name ?? 'Selected patient'}</div>
                <div className="text-xs text-slate-500">
                  ID {patientId}
                  {selectedPatient?.phone ? <span className="ml-2">• {selectedPatient.phone}</span> : null}
                </div>
              </div>
              <Button onClick={openNewPlan} size="sm">
                New Treatment Plan
              </Button>
            </div>
          </div>
        )}

        {err ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div>
        ) : null}

        {patientId ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">{loadingPlans ? 'Loading…' : `${plans.length} plan(s)`}</div>
              <Button variant="secondary" size="sm" onClick={reloadPlans} disabled={loadingPlans}>
                Refresh
              </Button>
            </div>

            {plans.length === 0 && !loadingPlans ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                No treatment plans yet.
              </div>
            ) : null}

            {plans.map((p) => {
              const isOpen = !!expanded[p.id]
              const details = planDetails[p.id]
              const steps = details?.steps ? [...details.steps].sort((a, b) => a.step_number - b.step_number) : []
              const prog = planProgress(steps)
              return (
                <div key={p.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-semibold text-slate-900">{p.title}</div>
                        {statusBadge(p.status)}
                        <div className="text-xs text-slate-500">Created {p.created_at}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEditPlan(p)} title="Edit plan">
                        ✎
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deletePlan(p.id)} title="Delete plan">
                        🗑
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => toggleExpand(p.id)} title="Expand/collapse">
                        <span className={isOpen ? 'rotate-180 inline-block transition-transform' : 'inline-block transition-transform'}>
                          ▾
                        </span>
                      </Button>
                    </div>
                  </div>

                  <div className="px-4 py-3">
                    <div className="h-2 w-full rounded-full bg-slate-200">
                      <div className="h-2 rounded-full bg-green-500" style={{ width: `${prog.pct}%` }} />
                    </div>
                    <div className="mt-2 text-xs text-slate-600">
                      {prog.done} of {prog.total} steps completed
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="border-t border-slate-200 px-4 py-4">
                      {planLoading[p.id] ? (
                        <div className="text-sm text-slate-500">Loading plan…</div>
                      ) : (
                        <>
                          {p.description?.trim() ? (
                            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                              {p.description}
                            </div>
                          ) : null}

                          <div className="relative pl-10">
                            <div className="absolute left-4 top-0 bottom-0 border-l-2 border-slate-200" />

                            <div className="space-y-3">
                              {steps.map((s, idx) => {
                                const completed = s.status === 'completed'
                                const inProgress = s.status === 'in-progress'
                                return (
                                  <div
                                    key={s.id}
                                    className={[
                                      'relative rounded-2xl border border-slate-200 bg-white px-4 py-3',
                                      completed ? 'opacity-75' : '',
                                      inProgress ? 'border-l-4 border-blue-400' : '',
                                    ].join(' ')}
                                  >
                                    <div className="absolute -left-[34px] top-3">{stepDot(s.status)}</div>

                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className="text-xs font-semibold text-slate-500">Step {s.step_number}</div>
                                          <div
                                            className={[
                                              'text-sm text-slate-900',
                                              completed ? 'line-through text-slate-500' : inProgress ? 'font-semibold' : '',
                                            ].join(' ')}
                                          >
                                            {s.procedure_name}
                                          </div>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                                          {s.scheduled_date ? <span>Scheduled: {s.scheduled_date}</span> : null}
                                          {s.cost_estimate != null ? <span>Estimate: {formatCurrency(s.cost_estimate)}</span> : null}
                                          {completed && s.completed_date ? (
                                            <span className="text-emerald-700">Completed: {s.completed_date}</span>
                                          ) : null}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {idx > 0 ? (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            title="Move up"
                                            onClick={() => reorderStep(p.id, steps, idx, -1)}
                                          >
                                            ↑
                                          </Button>
                                        ) : null}
                                        {idx < steps.length - 1 ? (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            title="Move down"
                                            onClick={() => reorderStep(p.id, steps, idx, 1)}
                                          >
                                            ↓
                                          </Button>
                                        ) : null}
                                        <Button variant="ghost" size="sm" title="Edit step" onClick={() => openEditStep(p.id, s)}>
                                          ✎
                                        </Button>
                                        {s.status !== 'completed' ? (
                                          <Button variant="ghost" size="sm" title="Mark complete" onClick={() => markStepComplete(p.id, s)}>
                                            ✓
                                          </Button>
                                        ) : null}
                                        <Button variant="ghost" size="sm" title="Delete step" onClick={() => deleteStep(p.id, s.id)}>
                                          🗑
                                        </Button>
                                      </div>
                                    </div>

                                    {s.description?.trim() ? (
                                      <div className="mt-2 text-sm text-slate-700">{s.description}</div>
                                    ) : null}

                                    {s.notes?.trim() ? (
                                      <details className="mt-2">
                                        <summary className="cursor-pointer text-xs font-semibold text-indigo-700 hover:text-indigo-800">
                                          Notes
                                        </summary>
                                        <div className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                          {s.notes}
                                        </div>
                                      </details>
                                    ) : null}
                                  </div>
                                )
                              })}

                              <div className="pt-1">
                                <Button variant="secondary" size="sm" onClick={() => openAddStep(p.id)}>
                                  Add Step
                                </Button>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : null}
      </Card>

      <Modal
        title={planEditing ? 'Edit Treatment Plan' : 'New Treatment Plan'}
        open={planModalOpen}
        onClose={() => {
          setPlanModalOpen(false)
          setPlanEditing(null)
        }}
      >
        <form className="grid gap-4 md:grid-cols-2" onSubmit={planForm.handleSubmit(onPlanSubmit)}>
          <div className="md:col-span-2">
            <Input
              label="Title *"
              placeholder="e.g., Full mouth rehab"
              {...planForm.register('title')}
              error={planForm.formState.errors.title?.message}
            />
          </div>
          <div className="md:col-span-2">
            <Textarea
              label="Description"
              rows={3}
              placeholder="Optional details…"
              {...planForm.register('description')}
              error={planForm.formState.errors.description?.message}
            />
          </div>
          <Select label="Status *" {...planForm.register('status')} error={planForm.formState.errors.status?.message}>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => { setPlanModalOpen(false); setPlanEditing(null) }}>
              Cancel
            </Button>
            <Button type="submit" disabled={planForm.formState.isSubmitting}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        title={stepEditing ? 'Edit Step' : 'Add Step'}
        open={stepModalOpen}
        onClose={() => {
          setStepModalOpen(false)
          setStepEditing(null)
          setStepForPlanId(null)
        }}
      >
        <form className="grid gap-4 md:grid-cols-2" onSubmit={stepForm.handleSubmit(onStepSubmit)}>
          <div className="md:col-span-2">
            <Input
              label="Procedure Name *"
              placeholder="e.g., Root canal"
              {...stepForm.register('procedure_name')}
              error={stepForm.formState.errors.procedure_name?.message}
            />
          </div>
          <div className="md:col-span-2">
            <Textarea
              label="Description"
              rows={2}
              placeholder="Optional…"
              {...stepForm.register('description')}
              error={stepForm.formState.errors.description?.message}
            />
          </div>
          <Select label="Status *" {...stepForm.register('status')} error={stepForm.formState.errors.status?.message}>
            <option value="pending">Pending</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
          </Select>
          <Input
            label="Scheduled Date"
            type="date"
            {...stepForm.register('scheduled_date')}
            error={stepForm.formState.errors.scheduled_date?.message as string | undefined}
          />
          <Input
            label="Cost Estimate"
            type="number"
            step="0.01"
            {...stepForm.register('cost_estimate')}
            error={stepForm.formState.errors.cost_estimate?.message as string | undefined}
          />
          <div className="md:col-span-2">
            <Textarea
              label="Notes"
              rows={3}
              placeholder="Optional notes…"
              {...stepForm.register('notes')}
              error={stepForm.formState.errors.notes?.message}
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => { setStepModalOpen(false); setStepEditing(null); setStepForPlanId(null) }}>
              Cancel
            </Button>
            <Button type="submit" disabled={stepForm.formState.isSubmitting}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

