import type { Invoice } from "./useInvoices"

/** AR/AP aging: open invoices bucketed by days past due against a fixed as-of
 *  date (matches the seed), consolidated by entity. */
export const AS_OF = "2026-05-31"
export const BUCKETS = ["0–30", "31–60", "61–90", "90+"] as const

const dayMs = 86_400_000
function bucketOf(dueDate: string): number {
  const age = Math.floor((new Date(AS_OF).getTime() - new Date(dueDate).getTime()) / dayMs)
  if (age <= 30) return 0
  if (age <= 60) return 1
  if (age <= 90) return 2
  return 3
}

export interface AgingRow { entityId: string; name: string; buckets: number[]; total: number }
export interface Aging {
  rows: AgingRow[]
  bucketTotals: number[]
  grand: number
  maxCell: number
  current: number   // 0–30
  overdue: number   // > 30
  over90: number
}

export function buildAging(invoices: Invoice[], kind: "ar" | "ap", names: Map<string, string>): Aging {
  const byEntity = new Map<string, number[]>()
  for (const inv of invoices) {
    if (inv.kind !== kind) continue
    const b = byEntity.get(inv.entity_id) ?? [0, 0, 0, 0]
    b[bucketOf(inv.due_date)] += Number(inv.amount)
    byEntity.set(inv.entity_id, b)
  }
  const rows: AgingRow[] = [...byEntity.entries()]
    .map(([entityId, buckets]) => ({ entityId, name: names.get(entityId) ?? entityId.slice(0, 8), buckets, total: buckets.reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.total - a.total)

  const bucketTotals = [0, 0, 0, 0]
  let maxCell = 0
  for (const r of rows) r.buckets.forEach((v, i) => { bucketTotals[i] += v; maxCell = Math.max(maxCell, v) })
  const grand = bucketTotals.reduce((s, v) => s + v, 0)
  return {
    rows, bucketTotals, grand, maxCell,
    current: bucketTotals[0],
    overdue: bucketTotals[1] + bucketTotals[2] + bucketTotals[3],
    over90: bucketTotals[3],
  }
}
