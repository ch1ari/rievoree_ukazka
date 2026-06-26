import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { useInvoices } from "@/lib/data/useInvoices"
import { useEntities } from "@/lib/data/useEntities"
import { buildAging, BUCKETS, AS_OF } from "@/lib/data/aging"
import { ChartCard, AgingStacked } from "@/components/charts/FinancialCharts"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"

function cmp(n: number) {
  const a = Math.abs(n)
  return a >= 1000 ? `€${(a / 1000).toFixed(a >= 100000 ? 0 : 1)}k` : `€${Math.round(a)}`
}

function HeatCell({ v, max }: { v: number; max: number }) {
  const intensity = max > 0 ? Math.min(1, v / max) : 0
  const alpha = v <= 0 ? 0 : (0.06 + intensity * 0.5).toFixed(3)
  return <span className="block rounded px-2 py-1 text-right font-mono text-xs tabular-nums" style={{ background: v <= 0 ? "transparent" : `oklch(0.63 0.2 30 / ${alpha})` }}>{v <= 0 ? "·" : cmp(v)}</span>
}

export function Aging() {
  const { data: invoices, isLoading, error } = useInvoices()
  const { data: entities } = useEntities()
  const [kind, setKind] = useState<"ar" | "ap">("ar")

  const names = useMemo(() => new Map((entities ?? []).map((e) => [e.id, e.name])), [entities])
  const aging = useMemo(() => buildAging(invoices ?? [], kind, names), [invoices, kind, names])
  const noData = (invoices?.length ?? 0) === 0
  const chartData = useMemo(
    () => aging.rows.map((r) => ({ name: r.name, ...Object.fromEntries(BUCKETS.map((b, i) => [b, r.buckets[i]])) })),
    [aging],
  )
  const overduePct = aging.grand > 0 ? (aging.overdue / aging.grand) * 100 : 0

  const kpis = [
    { label: "Total outstanding", value: cmp(aging.grand) },
    { label: "Current (0–30)", value: cmp(aging.current) },
    { label: "Overdue (>30)", value: `${cmp(aging.overdue)} · ${overduePct.toFixed(0)}%` },
    { label: "90+ days", value: cmp(aging.over90) },
  ]

  return (
    <div className="relative">
      <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }} className="pb-8">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">Receivables &amp; payables</span>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">AR / AP aging</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Open balances bucketed by days past due (0–30 / 31–60 / 61–90 / 90+), consolidated
          across entities. As of {AS_OF}.
        </p>
      </motion.header>

      {isLoading ? (
        <LoadingNote label="loading…" />
      ) : error ? (
        <ErrorNote message={error.message} />
      ) : noData ? (
        <EmptyNote title="No invoices yet" hint="Apply migration 22 (invoices) and the AR/AP aging populates across all buckets." />
      ) : (
        <div className="space-y-5">
          {/* AR / AP toggle */}
          <div className="inline-flex overflow-hidden rounded-lg border border-border">
            {(["ar", "ap"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)}
                className={cn("px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
                  kind === k ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                {k === "ar" ? "Receivables" : "Payables"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-2xl bg-card p-5 shadow-soft ring-1 ring-border">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{k.label}</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">{k.value}</div>
              </div>
            ))}
          </div>

          <ChartCard title={`${kind === "ar" ? "Receivables" : "Payables"} aging by entity`} hint="stacked by bucket">
            <AgingStacked data={chartData} buckets={BUCKETS} />
          </ChartCard>

          {/* Heatmap table — entity × bucket */}
          <div className="overflow-x-auto rounded-[1.5rem] bg-card shadow-soft ring-1 ring-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Entity</th>
                  {BUCKETS.map((b) => <th key={b} className="px-2 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{b}</th>)}
                  <th className="px-3 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {aging.rows.map((r) => (
                  <tr key={r.entityId} className="border-b border-border/40 hover:bg-secondary/30">
                    <td className="whitespace-nowrap px-4 py-1 font-medium">{r.name}</td>
                    {r.buckets.map((v, i) => <td key={i} className="px-2 py-1"><HeatCell v={v} max={aging.maxCell} /></td>)}
                    <td className="px-3 py-1 text-right font-mono text-xs font-semibold tabular-nums">{cmp(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-secondary/40 font-semibold">
                  <td className="px-4 py-3 font-mono text-[11px] uppercase tracking-wider">Total</td>
                  {aging.bucketTotals.map((v, i) => <td key={i} className="px-2 py-3 text-right font-mono text-xs tabular-nums">{cmp(v)}</td>)}
                  <td className="px-3 py-3 text-right font-mono text-xs tabular-nums">{cmp(aging.grand)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
