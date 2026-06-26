import type { ReportRow } from "./useReport"

/**
 * Client-side roll-ups of report_account_monthly rows into chart-ready series.
 * The journal is double-entry, so total net ≈ 0 — the meaningful financial cuts
 * are revenue (credits on revenue accounts) vs expenses (debits on expense
 * accounts), their profit, and the expense mix.
 */

export interface PnlPoint { month: string; revenue: number; expenses: number; profit: number }

export function monthlyPnl(rows: ReportRow[]): PnlPoint[] {
  const m = new Map<string, { revenue: number; expenses: number }>()
  for (const r of rows) {
    const key = r.period.slice(0, 7)
    const e = m.get(key) ?? { revenue: 0, expenses: 0 }
    if (r.account_type === "revenue") e.revenue += Number(r.credit)
    else if (r.account_type === "expense") e.expenses += Number(r.debit)
    m.set(key, e)
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ month, revenue: v.revenue, expenses: v.expenses, profit: v.revenue - v.expenses }))
}

export interface Slice { name: string; value: number }

export function expenseByAccount(rows: ReportRow[]): Slice[] {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (r.account_type !== "expense") continue
    m.set(r.account_name, (m.get(r.account_name) ?? 0) + Number(r.debit))
  }
  return [...m.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
}

export function totals(rows: ReportRow[]) {
  let revenue = 0, expenses = 0
  for (const r of rows) {
    if (r.account_type === "revenue") revenue += Number(r.credit)
    else if (r.account_type === "expense") expenses += Number(r.debit)
  }
  return { revenue, expenses, profit: revenue - expenses }
}

// ---- Executive KPI series -------------------------------------------------
// Per month: revenue, EBITDA (revenue − operating expenses; the seed chart of
// accounts has no D&A/interest, so EBITDA == operating income), running Cash and
// A/R balances (asset accounts are debit-normal, balance = Σ net), DSO and margin.
export interface ExecPoint {
  month: string; revenue: number; ebitda: number; cash: number; ar: number; dso: number; marginPct: number
}

export function executiveSeries(rows: ReportRow[]): ExecPoint[] {
  const m = new Map<string, { revenue: number; expenses: number; cashFlow: number; arFlow: number }>()
  for (const r of rows) {
    const key = r.period.slice(0, 7)
    const e = m.get(key) ?? { revenue: 0, expenses: 0, cashFlow: 0, arFlow: 0 }
    if (r.account_type === "revenue") e.revenue += Number(r.credit)
    else if (r.account_type === "expense") e.expenses += Number(r.debit)
    if (r.account_code === "1000") e.cashFlow += Number(r.net) // Cash (debit-normal)
    if (r.account_code === "1100") e.arFlow += Number(r.net)   // Accounts Receivable
    m.set(key, e)
  }
  const sorted = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  let cash = 0, ar = 0
  return sorted.map(([month, v]) => {
    cash += v.cashFlow
    ar += v.arFlow
    const ebitda = v.revenue - v.expenses
    return {
      month,
      revenue: v.revenue,
      ebitda,
      cash,
      ar,
      dso: v.revenue > 0 ? (ar / (v.revenue / 30)) : 0,
      marginPct: v.revenue > 0 ? (ebitda / v.revenue) * 100 : 0,
    }
  })
}

export interface Kpi { value: number; delta: number | null; spark: number[] }

function kpiFrom(series: ExecPoint[], pick: (p: ExecPoint) => number): Kpi {
  const spark = series.map(pick)
  const value = spark.length ? spark[spark.length - 1] : 0
  const prev = spark.length > 1 ? spark[spark.length - 2] : null
  const delta = prev != null && prev !== 0 ? ((value - prev) / Math.abs(prev)) * 100 : null
  return { value, delta, spark }
}

export function executiveKpis(series: ExecPoint[]) {
  return {
    revenue: kpiFrom(series, (p) => p.revenue),
    ebitda: kpiFrom(series, (p) => p.ebitda),
    cash: kpiFrom(series, (p) => p.cash),
    dso: kpiFrom(series, (p) => p.dso),
  }
}
