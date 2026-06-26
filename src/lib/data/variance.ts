import type { ReportRow } from "./useReport"
import type { BudgetRow } from "./useBudget"
import type { WfStep } from "./balance"

/**
 * EBITDA variance bridge: Base operating income → per-line driver deltas → Actual
 * operating income. Each P&L line's impact on OI is +Δ for revenue, −Δ for cost,
 * so the drivers sum exactly to ΔOI (the bridge ties). Base can be the prior
 * period (always available) or Budget (once the budgets table is seeded).
 */
export type Basis = "prior" | "budget"

export interface Driver {
  code: string; label: string; base: number; actual: number; variance: number; impact: number; favorable: boolean
}
export interface VarianceBridge {
  baseLabel: string; baseOI: number; actualOI: number; drivers: Driver[]; steps: WfStep[]; hasData: boolean
}

function plValues(rows: ReportRow[], periodKey: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (r.period.slice(0, 7) !== periodKey) continue
    if (r.account_type !== "revenue" && r.account_type !== "expense") continue
    const v = r.account_type === "revenue" ? Number(r.credit) : Number(r.debit)
    m.set(r.account_code, (m.get(r.account_code) ?? 0) + v)
  }
  return m
}

export function buildVarianceBridge(
  rows: ReportRow[], budgets: BudgetRow[], periodKey: string, basis: Basis, periodsAsc: string[],
): VarianceBridge {
  const info = new Map<string, { name: string; type: string }>()
  for (const r of rows) if (!info.has(r.account_code)) info.set(r.account_code, { name: r.account_name, type: r.account_type })

  const actual = plValues(rows, periodKey)
  const base = new Map<string, number>()
  let baseLabel: string
  if (basis === "budget") {
    for (const b of budgets) if (b.period.slice(0, 7) === periodKey) {
      const t = info.get(b.account_code)?.type
      if (t === "revenue" || t === "expense") base.set(b.account_code, (base.get(b.account_code) ?? 0) + Number(b.amount))
    }
    baseLabel = "Budget"
  } else {
    const idx = periodsAsc.indexOf(periodKey)
    const prior = idx > 0 ? periodsAsc[idx - 1] : null
    baseLabel = prior ?? "—"
    if (prior) for (const [c, v] of plValues(rows, prior)) base.set(c, v)
  }

  const codes = [...new Set([...actual.keys(), ...base.keys()])].filter((c) => {
    const t = info.get(c)?.type; return t === "revenue" || t === "expense"
  })

  let baseOI = 0, actualOI = 0
  const drivers: Driver[] = []
  for (const code of codes) {
    const t = info.get(code)!.type
    const sign = t === "revenue" ? 1 : -1
    const b = base.get(code) ?? 0, a = actual.get(code) ?? 0
    baseOI += sign * b
    actualOI += sign * a
    const impact = sign * (a - b)
    drivers.push({ code, label: info.get(code)!.name, base: b, actual: a, variance: a - b, impact, favorable: impact >= 0 })
  }
  drivers.sort((x, y) => Math.abs(y.impact) - Math.abs(x.impact))

  const steps: WfStep[] = [
    { name: basis === "budget" ? "Budget OI" : "Prior OI", value: baseOI, isTotal: true },
    ...drivers.map((d) => ({ name: d.label, value: d.impact })),
    { name: "Actual OI", value: actualOI, isTotal: true },
  ]

  const hasData = actual.size > 0 && (basis === "budget" ? budgets.length > 0 : base.size > 0)
  return { baseLabel, baseOI, actualOI, drivers, steps, hasData }
}
