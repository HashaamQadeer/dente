import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FinancialPeriod, FinancialSummary, UnpaidBalanceRow } from '../dente-api'
import { getDenteApi } from '../lib/api'
import { Button, Card } from '../ui/components'

function formatCurrency(v: number) {
  const n = Number(v) || 0
  return `Rs. ${new Intl.NumberFormat('en-PK').format(Math.round(n))}`
}

function Icon({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`grid size-9 place-items-center rounded-xl ${className}`}>{children}</span>
}

export function FinancePage() {
  const nav = useNavigate()
  const [period, setPeriod] = useState<FinancialPeriod>('month')
  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [unpaid, setUnpaid] = useState<UnpaidBalanceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
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
  }, [period])

  const sortedUnpaid = useMemo(() => {
    const copy = [...unpaid]
    copy.sort((a, b) => (b.total_owed ?? 0) - (a.total_owed ?? 0))
    return copy
  }, [unpaid])

  const topCutoff = useMemo(() => {
    if (!sortedUnpaid.length) return 0
    return Math.ceil(sortedUnpaid.length * 0.25)
  }, [sortedUnpaid.length])

  const periods: Array<{ id: FinancialPeriod; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'year', label: 'This Year' },
  ]

  return (
    <div className="space-y-5">
      <Card
        title="Finance"
        subtitle="Track revenue, collections, and outstanding balances."
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

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Icon className="bg-green-100 text-green-700">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm1 4H9v1H8v2h1v1H8v2h1v1H8v2h1v1h2v-1h1v-2h-1v-1h1V9h-1V8h1V6Z" />
                </svg>
              </Icon>
              <div className="min-w-0">
                <div className="text-2xl font-bold text-slate-900">
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
                <div className="text-2xl font-bold text-slate-900">
                  {summary ? formatCurrency(summary.totalPaid) : '—'}
                </div>
                <div className="text-sm text-slate-600">Total Collected</div>
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
                <div className="text-2xl font-bold text-slate-900">
                  {summary ? formatCurrency(summary.totalUnpaid) : '—'}
                </div>
                <div className="text-sm text-slate-600">Outstanding Balance</div>
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
                <div className="text-2xl font-bold text-slate-900">
                  {summary ? new Intl.NumberFormat('en-PK').format(summary.procedureCount) : '—'}
                </div>
                <div className="text-sm text-slate-600">Procedures Done</div>
              </div>
            </div>
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
    </div>
  )
}

