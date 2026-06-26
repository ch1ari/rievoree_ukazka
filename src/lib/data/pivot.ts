import type { ReportRow } from "./useReport"

/**
 * Generic pivot aggregation over report rows. Pick any two dimensions for rows ×
 * columns and a measure; get a value matrix with row/column totals. Aggregation
 * happens here (the dimensional model), the table just renders it.
 */
export type Dim = "entity" | "type" | "account" | "period"
export type Measure = "net" | "debit" | "credit"

export const DIM_LABEL: Record<Dim, string> = { entity: "Entity", type: "Account type", account: "Account", period: "Period" }
export const MEASURE_LABEL: Record<Measure, string> = { net: "Net", debit: "Debit", credit: "Credit" }

export interface PivotResult {
  rows: { key: string; label: string }[]
  cols: { key: string; label: string }[]
  cells: Map<string, number> // `${rowKey}|${colKey}`
  rowTotals: Map<string, number>
  colTotals: Map<string, number>
  grand: number
  maxAbs: number // for heatmap intensity
}

export function buildPivot(rows: ReportRow[], rowDim: Dim, colDim: Dim, measure: Measure, entityNames: Map<string, string>): PivotResult {
  const keyer = (dim: Dim, r: ReportRow): { key: string; label: string } => {
    switch (dim) {
      case "entity": return { key: r.entity_id, label: entityNames.get(r.entity_id) ?? r.entity_id.slice(0, 8) }
      case "type": return { key: r.account_type, label: r.account_type }
      case "account": return { key: r.account_code, label: `${r.account_code} ${r.account_name}` }
      case "period": return { key: r.period.slice(0, 7), label: r.period.slice(0, 7) }
    }
  }
  const val = (r: ReportRow) => measure === "net" ? Number(r.net) : measure === "debit" ? Number(r.debit) : Number(r.credit)

  const rowMap = new Map<string, string>(), colMap = new Map<string, string>()
  const cells = new Map<string, number>(), rowTotals = new Map<string, number>(), colTotals = new Map<string, number>()
  let grand = 0
  for (const r of rows) {
    const rk = keyer(rowDim, r), ck = keyer(colDim, r), v = val(r)
    rowMap.set(rk.key, rk.label); colMap.set(ck.key, ck.label)
    const ckey = `${rk.key}|${ck.key}`
    cells.set(ckey, (cells.get(ckey) ?? 0) + v)
    rowTotals.set(rk.key, (rowTotals.get(rk.key) ?? 0) + v)
    colTotals.set(ck.key, (colTotals.get(ck.key) ?? 0) + v)
    grand += v
  }
  let maxAbs = 0
  for (const v of cells.values()) maxAbs = Math.max(maxAbs, Math.abs(v))

  const sortKeys = (m: Map<string, string>, dim: Dim) => {
    const arr = [...m.entries()].map(([key, label]) => ({ key, label }))
    arr.sort((a, b) => (dim === "period" || dim === "account") ? a.key.localeCompare(b.key) : a.label.localeCompare(b.label))
    return arr
  }
  return { rows: sortKeys(rowMap, rowDim), cols: sortKeys(colMap, colDim), cells, rowTotals, colTotals, grand, maxAbs }
}
