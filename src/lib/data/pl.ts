import type { ReportRow } from "./useReport"
import type { BudgetRow } from "./useBudget"

/**
 * Builds a proper P&L statement model from report rows + budget rows for a given
 * period scope. Revenue is credit-normal; COGS/OpEx are debit-normal. Produces an
 * ordered list of render rows: section headers, account lines (with a monthly
 * series for an in-row sparkline), and subtotals (Gross profit, Operating income).
 *
 * `favorableUp` drives variance colouring: income-like lines/subtotals are good
 * when actual > budget; cost-like lines are bad when actual > budget.
 */
export type PlRow =
  | { kind: "section"; id: string; label: string }
  | { kind: "line"; sectionId: string; code: string; label: string; actual: number; budget: number; monthly: number[]; favorableUp: boolean }
  | { kind: "subtotal"; id: string; label: string; actual: number; budget: number; favorableUp: boolean; strong: boolean }

interface Acc { name: string; type: string; actual: number; monthly: Map<string, number> }

export function buildPl(rows: ReportRow[], budgets: BudgetRow[], period: string): PlRow[] {
  const inScope = (p: string) => period === "all" || p.slice(0, 7) === period.slice(0, 7)
  const months = [...new Set(rows.map((r) => r.period.slice(0, 7)))].sort()

  const acct = new Map<string, Acc>()
  for (const r of rows) {
    const val = r.account_type === "revenue" ? Number(r.credit) : r.account_type === "expense" ? Number(r.debit) : 0
    if (!val) continue
    const cur = acct.get(r.account_code) ?? { name: r.account_name, type: r.account_type, actual: 0, monthly: new Map() }
    const mk = r.period.slice(0, 7)
    cur.monthly.set(mk, (cur.monthly.get(mk) ?? 0) + val)
    if (inScope(r.period)) cur.actual += val
    acct.set(r.account_code, cur)
  }

  const budByCode = new Map<string, number>()
  for (const b of budgets) {
    if (inScope(b.period)) budByCode.set(b.account_code, (budByCode.get(b.account_code) ?? 0) + Number(b.amount))
  }

  const codes = [...acct.keys()].sort()
  const revenueCodes = codes.filter((c) => acct.get(c)!.type === "revenue")
  const cogsCodes = codes.filter((c) => c === "5000")
  const opexCodes = codes.filter((c) => acct.get(c)!.type === "expense" && c !== "5000")

  const line = (code: string, sectionId: string, favorableUp: boolean): PlRow => {
    const a = acct.get(code)!
    return {
      kind: "line", sectionId, code, label: a.name,
      actual: a.actual, budget: budByCode.get(code) ?? 0,
      monthly: months.map((m) => a.monthly.get(m) ?? 0),
      favorableUp,
    }
  }
  const sum = (cs: string[], key: "actual" | "budget") =>
    cs.reduce((s, c) => s + (key === "actual" ? acct.get(c)!.actual : (budByCode.get(c) ?? 0)), 0)

  const revA = sum(revenueCodes, "actual"), revB = sum(revenueCodes, "budget")
  const cogsA = sum(cogsCodes, "actual"), cogsB = sum(cogsCodes, "budget")
  const opexA = sum(opexCodes, "actual"), opexB = sum(opexCodes, "budget")
  const grossA = revA - cogsA, grossB = revB - cogsB
  const opIncA = grossA - opexA, opIncB = grossB - opexB

  const out: PlRow[] = []
  out.push({ kind: "section", id: "revenue", label: "Revenue" })
  revenueCodes.forEach((c) => out.push(line(c, "revenue", true)))
  out.push({ kind: "subtotal", id: "total-revenue", label: "Total revenue", actual: revA, budget: revB, favorableUp: true, strong: false })

  out.push({ kind: "section", id: "cogs", label: "Cost of sales" })
  cogsCodes.forEach((c) => out.push(line(c, "cogs", false)))
  out.push({ kind: "subtotal", id: "gross-profit", label: "Gross profit", actual: grossA, budget: grossB, favorableUp: true, strong: true })

  out.push({ kind: "section", id: "opex", label: "Operating expenses" })
  opexCodes.forEach((c) => out.push(line(c, "opex", false)))
  out.push({ kind: "subtotal", id: "total-opex", label: "Total operating expenses", actual: opexA, budget: opexB, favorableUp: false, strong: false })

  out.push({ kind: "subtotal", id: "operating-income", label: "Operating income (EBITDA)", actual: opIncA, budget: opIncB, favorableUp: true, strong: true })
  return out
}
