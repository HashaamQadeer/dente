import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import type {
  Expense,
  ExpenseCategory,
  ExpenseCategoryTotal,
  ExpenseCreateUpdate,
  ExpenseMonthlyTotal,
  FinancialPeriod,
  FinancialSummary,
  UnpaidBalanceRow,
} from '../dente-api'
import { getDenteApi } from '../lib/api'
import { useAuth } from '../lib/useAuth'
import { Button, Card, Input, Modal, Select, Textarea } from '../ui/components'

function formatCurrency(v: number) {
  const n = Number(v) || 0
  return `Rs. ${new Intl.NumberFormat('en-PK').format(Math.round(n))}`
}

function Icon({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`grid size-9 place-items-center rounded-xl ${className}`}>{children}</span>
}

function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const last = new Date(y, m, 0)
  return { from, to: last.toISOString().slice(0, 10) }
}

function formatMonthLabel(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-PK', { month: 'long', year: 'numeric' })
}

const EXPENSE_CATEGORIES: Array<{ value: ExpenseCategory; label: string }> = [
  { value: 'equipment', label: 'Equipment' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'rent', label: 'Rent' },
  { value: 'salaries', label: 'Salaries' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'miscellaneous', label: 'Miscellaneous' },
]

function categoryLabel(category: ExpenseCategory) {
  return EXPENSE_CATEGORIES.find((c) => c.value === category)?.label ?? category
}

const expenseSchema = z.object({
  expense_date: z.string().min(1, 'Date is required'),
  category: z.enum(['equipment', 'utilities', 'rent', 'salaries', 'supplies', 'miscellaneous']),
  description: z.string().trim().min(1, 'Description is required').max(250, 'Too long'),
  amount: z.preprocess(
    (v) => (v === '' || v == null ? 0 : Number(v)),
    z.number().min(0.01, 'Amount must be greater than 0'),
  ),
})

type ExpenseForm = z.input<typeof expenseSchema>

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function FinancePage() {
  const nav = useNavigate()
  const { canViewFinance, canDelete, promptFinanceDenied, promptDeleteDenied } = useAuth()
  const [period, setPeriod] = useState<FinancialPeriod>('month')
  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [unpaid, setUnpaid] = useState<UnpaidBalanceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [expenseMonth, setExpenseMonth] = useState(currentYearMonth)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categoryBreakdown, setCategoryBreakdown] = useState<ExpenseCategoryTotal[]>([])
  const [monthlyTotals, setMonthlyTotals] = useState<ExpenseMonthlyTotal[]>([])
  const [expensesLoading, setExpensesLoading] = useState(false)
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

  const expenseDefaults = useMemo<ExpenseForm>(
    () => ({
      expense_date: isoDate(new Date()),
      category: 'miscellaneous',
      description: '',
      amount: 0,
    }),
    [],
  )

  const editExpenseDefaults = useMemo<ExpenseForm>(
    () => ({
      expense_date: editingExpense?.expense_date ?? isoDate(new Date()),
      category: (editingExpense?.category as ExpenseForm['category']) ?? 'miscellaneous',
      description: editingExpense?.description ?? '',
      amount: editingExpense?.amount ?? 0,
    }),
    [editingExpense],
  )

  const expenseForm = useForm<ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    defaultValues: expenseDefaults,
    mode: 'onBlur',
  })

  const editExpenseForm = useForm<ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    values: editExpenseDefaults,
    mode: 'onBlur',
  })

  useEffect(() => {
    if (!canViewFinance) {
      promptFinanceDenied()
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setErr(null)
      try {
        const api = getDenteApi()
        const [s, u] = await Promise.all([
          api.getFinancialSummary(period),
          api.getUnpaidBalances(),
        ])
        if (cancelled) return
        setSummary(s)
        setUnpaid(u)
      } catch (e) {
        if (cancelled) return
        setErr(e instanceof Error ? e.message : 'Failed to load finance data.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [period, canViewFinance, promptFinanceDenied])

  const loadExpenses = useCallback(async () => {
    setExpensesLoading(true)
    try {
      const api = getDenteApi()
      const { from, to } = monthRange(expenseMonth)
      const year = Number(expenseMonth.split('-')[0])
      const [rows, breakdown, monthly] = await Promise.all([
        api.expenses.listByMonth(expenseMonth),
        api.expenses.categoryBreakdown(from, to),
        api.expenses.monthlyTotals(year),
      ])
      setExpenses(rows)
      setCategoryBreakdown(breakdown)
      setMonthlyTotals(monthly)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load expenses.')
    } finally {
      setExpensesLoading(false)
    }
  }, [expenseMonth])

  useEffect(() => {
    if (!canViewFinance) return
    loadExpenses()
  }, [canViewFinance, loadExpenses])

  const sortedUnpaid = useMemo(() => {
    const copy = [...unpaid]
    copy.sort((a, b) => (b.total_owed ?? 0) - (a.total_owed ?? 0))
    return copy
  }, [unpaid])

  const topCutoff = useMemo(() => {
    if (!sortedUnpaid.length) return 0
    return Math.ceil(sortedUnpaid.length * 0.25)
  }, [sortedUnpaid.length])

  const expenseMonthTotal = useMemo(
    () => expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [expenses],
  )

  const maxCategoryTotal = useMemo(
    () => Math.max(...categoryBreakdown.map((c) => c.total), 1),
    [categoryBreakdown],
  )

  const maxMonthlyTotal = useMemo(
    () => Math.max(...monthlyTotals.map((m) => m.total), 1),
    [monthlyTotals],
  )

  const periods: Array<{ id: FinancialPeriod; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'year', label: 'This Year' },
  ]

  function openAddExpense() {
    setEditingExpense(null)
    const today = isoDate(new Date())
    const defaultDate = today.startsWith(expenseMonth) ? today : `${expenseMonth}-01`
    expenseForm.reset({
      ...expenseDefaults,
      expense_date: defaultDate,
    })
    setExpenseModalOpen(true)
  }

  function openEditExpense(row: Expense) {
    setEditingExpense(row)
    setExpenseModalOpen(true)
  }

  async function onExpenseSubmit(values: ExpenseForm) {
    try {
      setErr(null)
      const payload: ExpenseCreateUpdate = {
        expense_date: values.expense_date,
        category: values.category as ExpenseCategory,
        description: values.description.trim(),
        amount: Number(values.amount) || 0,
      }
      const api = getDenteApi()
      if (editingExpense) {
        await api.expenses.update(editingExpense.id, payload)
      } else {
        await api.expenses.create(payload)
      }
      setExpenseModalOpen(false)
      setEditingExpense(null)
      await loadExpenses()
      const s = await api.getFinancialSummary(period)
      setSummary(s)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save expense.')
    }
  }

  async function onDeleteExpense(row: Expense) {
    if (!canDelete) {
      promptDeleteDenied()
      return
    }
    const ok = confirm(`Delete expense "${row.description}" (${formatCurrency(row.amount)})?`)
    if (!ok) return
    try {
      setErr(null)
      const api = getDenteApi()
      await api.expenses.delete(row.id)
      await loadExpenses()
      const s = await api.getFinancialSummary(period)
      setSummary(s)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete expense.')
    }
  }

  if (!canViewFinance) {
    return (
      <Card title="Finance" subtitle="Revenue and outstanding balances">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
          Finance data is restricted to administrators. Contact your admin if you need access.
        </div>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => nav('/')}>
            Back to home
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card
        title="Finance"
        subtitle="Track revenue, collections, expenses, and outstanding balances."
        right={
          <div className="text-xs text-slate-500">
            {loading ? 'Loading…' : summary ? 'Up to date' : '—'}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1">
            {periods.map((p) => {
              const active = p.id === period
              return (
                <button
                  key={p.id}
                  type="button"
                  className={[
                    'rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-700 hover:bg-slate-100',
                  ].join(' ')}
                  onClick={() => setPeriod(p.id)}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {err}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Icon className="bg-green-100 text-green-700">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm1 4H9v1H8v2h1v1H8v2h1v1H8v2h1v1h2v-1h1v-2h-1v-1h1V9h-1V8h1V6Z" />
                </svg>
              </Icon>
              <div className="min-w-0">
                <div className="text-xl font-bold text-slate-900">
                  {summary ? formatCurrency(summary.totalRevenue) : '—'}
                </div>
                <div className="text-sm text-slate-600">Total Revenue</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Icon className="bg-blue-100 text-blue-700">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M7.5 10.5 9 12l3.5-4 1.5 1.5L9 15 6 12l1.5-1.5ZM2 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Z" />
                </svg>
              </Icon>
              <div className="min-w-0">
                <div className="text-xl font-bold text-slate-900">
                  {summary ? formatCurrency(summary.totalPaid) : '—'}
                </div>
                <div className="text-sm text-slate-600">Total Collected</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Icon className="bg-rose-100 text-rose-700">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M4 4h12v2H4V4Zm0 4h12v2H4V8Zm0 4h8v2H4v-2Z" />
                </svg>
              </Icon>
              <div className="min-w-0">
                <div className="text-xl font-bold text-slate-900">
                  {summary ? formatCurrency(summary.totalExpenses) : '—'}
                </div>
                <div className="text-sm text-slate-600">Total Expenses</div>
              </div>
            </div>
          </div>

          <div
            className={`rounded-xl border p-4 shadow-sm ${
              summary && summary.netProfit >= 0
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-red-200 bg-red-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Icon
                className={
                  summary && summary.netProfit >= 0
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700'
                }
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 2 2 7v11h16V7L10 2Zm0 2.2L16 8v8H4V8l6-3.8Z" />
                </svg>
              </Icon>
              <div className="min-w-0">
                <div className="text-xl font-bold text-slate-900">
                  {summary ? formatCurrency(summary.netProfit) : '—'}
                </div>
                <div className="text-sm text-slate-600">Net Profit</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Icon className="bg-orange-100 text-orange-700">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm1 4H9v5l4 2 1-1.7-3-1.3V6Z" />
                </svg>
              </Icon>
              <div className="min-w-0">
                <div className="text-xl font-bold text-slate-900">
                  {summary ? formatCurrency(summary.totalUnpaid) : '—'}
                </div>
                <div className="text-sm text-slate-600">Outstanding</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Icon className="bg-slate-100 text-slate-700">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6l-4-4H6Zm7 1.5L16.5 7H13V3.5ZM7 10h6v2H7v-2Zm0 4h6v2H7v-2Z" />
                </svg>
              </Icon>
              <div className="min-w-0">
                <div className="text-xl font-bold text-slate-900">
                  {summary ? new Intl.NumberFormat('en-PK').format(summary.procedureCount) : '—'}
                </div>
                <div className="text-sm text-slate-600">Procedures</div>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Net Profit = Total Collected minus Total Expenses for the selected period.
        </p>
      </Card>

      <Card
        title="Clinic Expenses"
        subtitle="Record equipment, utilities, rent, salaries, supplies, and other costs."
        right={
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <div className="text-xs font-medium text-slate-600">Month</div>
              <input
                type="month"
                value={expenseMonth}
                onChange={(e) => setExpenseMonth(e.target.value)}
                className="mt-1 h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <Button size="sm" onClick={openAddExpense}>
              Add expense
            </Button>
            <Button variant="secondary" size="sm" onClick={loadExpenses} disabled={expensesLoading}>
              Refresh
            </Button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">{formatMonthLabel(expenseMonth)}</div>
            <div className="text-xs text-slate-500">{expenses.length} expense(s) recorded</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">Month total</div>
            <div className="text-xl font-bold text-rose-700">{formatCurrency(expenseMonthTotal)}</div>
          </div>
        </div>

        {expensesLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            Loading expenses…
          </div>
        ) : !expenses.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-500">
            No expenses recorded for {formatMonthLabel(expenseMonth)}.
          </div>
        ) : (
          <div className="overflow-auto rounded-2xl border border-slate-200">
            <table className="min-w-[820px] w-full border-collapse bg-white text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {expenses.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-slate-700">{r.expense_date}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {categoryLabel(r.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-900">{r.description}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(r.amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEditExpense(r)}>
                          Edit
                        </Button>
                        {canDelete ? (
                          <Button variant="danger" size="sm" onClick={() => onDeleteExpense(r)}>
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr>
                  <td className="px-4 py-3 font-semibold text-slate-900" colSpan={3}>
                    Running total
                  </td>
                  <td className="px-4 py-3 font-bold text-rose-700" colSpan={2}>
                    {formatCurrency(expenseMonthTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-sm font-semibold text-slate-900">
              Expenses by category — {formatMonthLabel(expenseMonth)}
            </div>
            {!categoryBreakdown.length ? (
              <div className="text-sm text-slate-500">No category data for this month.</div>
            ) : (
              <div className="space-y-3">
                {categoryBreakdown.map((c) => (
                  <div key={c.category}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">{categoryLabel(c.category)}</span>
                      <span className="text-slate-600">{formatCurrency(c.total)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-rose-500"
                        style={{ width: `${Math.round((c.total / maxCategoryTotal) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-sm font-semibold text-slate-900">
              Expenses by month — {expenseMonth.split('-')[0]}
            </div>
            {!monthlyTotals.length ? (
              <div className="text-sm text-slate-500">No expense data for this year.</div>
            ) : (
              <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ minHeight: 160 }}>
                {monthlyTotals.map((m) => {
                  const height = Math.max(8, Math.round((m.total / maxMonthlyTotal) * 120))
                  const isActive = m.month === expenseMonth
                  return (
                    <div key={m.month} className="flex min-w-[44px] flex-col items-center gap-1">
                      <div className="text-[10px] font-medium text-slate-600">
                        {formatCurrency(m.total).replace('Rs. ', '')}
                      </div>
                      <div
                        className={`w-8 rounded-t-md ${isActive ? 'bg-rose-600' : 'bg-rose-300'}`}
                        style={{ height }}
                        title={`${m.month}: ${formatCurrency(m.total)}`}
                      />
                      <div className={`text-[10px] ${isActive ? 'font-bold text-rose-700' : 'text-slate-500'}`}>
                        {m.month.slice(5)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card title="Outstanding Balances" subtitle="Patients with unpaid procedure balances.">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            Loading outstanding balances…
          </div>
        ) : !sortedUnpaid.length ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center shadow-sm">
            <div className="mx-auto mb-2 grid size-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
              <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7.5 13.5 4 10l1.5-1.5 2 2L14.5 3.5 16 5l-8.5 8.5Z" />
              </svg>
            </div>
            <div className="text-base font-semibold text-emerald-900">All balances are clear ✓</div>
            <div className="mt-1 text-sm text-emerald-800/80">No outstanding payments at this time</div>
          </div>
        ) : (
          <div className="overflow-auto rounded-2xl border border-slate-200">
            <table className="min-w-[920px] w-full border-collapse bg-white text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Patient Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">No. of Procedures</th>
                  <th className="px-4 py-3">Amount Owed</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedUnpaid.map((r, idx) => (
                  <tr key={r.patient_id} className={idx < topCutoff ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.patient_name}</td>
                    <td className="px-4 py-3 text-slate-700">{r.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{r.procedure_count}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(r.total_owed)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => nav('/patients', { state: { openPatientId: r.patient_id } })}
                        >
                          View Patient
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        title={editingExpense ? 'Edit expense' : 'Add expense'}
        open={expenseModalOpen}
        onClose={() => {
          setExpenseModalOpen(false)
          setEditingExpense(null)
        }}
      >
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={
            editingExpense
              ? editExpenseForm.handleSubmit(onExpenseSubmit)
              : expenseForm.handleSubmit(onExpenseSubmit)
          }
        >
          <Input
            label="Date *"
            type="date"
            {...(editingExpense ? editExpenseForm.register('expense_date') : expenseForm.register('expense_date'))}
            error={
              editingExpense
                ? editExpenseForm.formState.errors.expense_date?.message
                : expenseForm.formState.errors.expense_date?.message
            }
          />
          <Select
            label="Category *"
            {...(editingExpense ? editExpenseForm.register('category') : expenseForm.register('category'))}
            error={
              editingExpense
                ? editExpenseForm.formState.errors.category?.message
                : expenseForm.formState.errors.category?.message
            }
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <div className="md:col-span-2">
            <Textarea
              label="Description *"
              placeholder="e.g., Monthly electricity bill"
              {...(editingExpense ? editExpenseForm.register('description') : expenseForm.register('description'))}
              error={
                editingExpense
                  ? editExpenseForm.formState.errors.description?.message
                  : expenseForm.formState.errors.description?.message
              }
            />
          </div>
          <Input
            label="Amount (Rs.) *"
            type="number"
            step="0.01"
            min="0"
            {...(editingExpense ? editExpenseForm.register('amount') : expenseForm.register('amount'))}
            error={
              editingExpense
                ? editExpenseForm.formState.errors.amount?.message
                : expenseForm.formState.errors.amount?.message
            }
          />
          <div className="md:col-span-2 flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setExpenseModalOpen(false)
                setEditingExpense(null)
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                editingExpense
                  ? editExpenseForm.formState.isSubmitting
                  : expenseForm.formState.isSubmitting
              }
            >
              {editingExpense ? 'Save changes' : 'Add expense'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
