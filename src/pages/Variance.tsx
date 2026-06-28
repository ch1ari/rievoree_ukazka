import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { useReport } from "@/lib/data/useReport"
import { useEntities } from "@/lib/data/useEntities"
import { useBudget } from "@/lib/data/useBudget"
import { buildVarianceBridge, type Basis } from "@/lib/data/variance"
import { ChartCard, Waterfall } from "@/components/charts/FinancialCharts"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { SimpleSelect } from "@/components/ui/select"

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
const money = (n: number) => (n < 0 ? `(${eur.format(Math.abs(n))})` : eur.format(n))

export function Variance() {
  const { data: rows, isLoading, error } = useReport()
  const { data: entities } = useEntities()
  const { data: budgets } = useBudget()
  const [entityId, setEntityId] = useState("all")
  const [basis, setBasis] = useState<Basis>("prior")
  const [period, setPeriod] = useState<string>("")

  const names = useMemo(() => new Map((entities ?? []).map((e) => [e.id, e.name])), [entities])
  const scoped = useMemo(() => (rows ?? []).filter((r) => entityId === "all" || r.entity_id === entityId), [rows, entityId])
  const scopedBudgets = useMemo(() => (budgets ?? []).filter((b) => entityId === "all" || b.entity_id === entityId), [budgets, entityId])
  const periodsAsc = useMemo(() => [...new Set(scoped.map((r) => r.period.slice(0, 7)))].sort(), [scoped])
  const periodKey = period || periodsAsc[periodsAsc.length - 1] || ""
  const hasBudget = (budgets?.length ?? 0) > 0

  const bridge = useMemo(
    () => buildVarianceBridge(scoped, scopedBudgets, periodKey, basis, periodsAsc),
    [scoped, scopedBudgets, periodKey, basis, periodsAsc],
  )
  const totalVar = bridge.actualOI - bridge.baseOI
  const budgetUnavailable = basis === "budget" && !hasBudget

  return (
    <div className="relative">
      <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }} className="pb-8">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">Variance analysis</span>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">Variance</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          An operating-income bridge: base → per-line drivers → actual. Each driver is the
          line's favourable/unfavourable contribution; they sum to the total variance.
        </p>
      </motion.header>

      {isLoading ? (
        <LoadingNote label="loading…" />
      ) : error ? (
        <ErrorNote message={error.message} />
      ) : (rows?.length ?? 0) === 0 ? (
        <EmptyNote title="No report data for your entities" hint="Approve and load a batch on the Ingest page." />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Entity
              <SimpleSelect
                aria-label="Entity filter"
                value={entityId}
                onValueChange={setEntityId}
                options={[
                  { value: "all", label: `All (${names.size})` },
                  ...[...names.entries()].map(([id, name]) => ({ value: id, label: name })),
                ]}
              />
            </label>
            <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Period
              <SimpleSelect
                aria-label="Period filter"
                value={periodKey}
                onValueChange={setPeriod}
                options={[...periodsAsc].reverse().map((p) => ({ value: p, label: p }))}
              />
            </label>
            {/* Basis toggle */}
            <div className="inline-flex overflow-hidden rounded-lg border border-border">
              {(["prior", "budget"] as Basis[]).map((b) => (
                <button key={b} onClick={() => setBasis(b)}
                  className={cn("px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
                    basis === b ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                  vs {b === "prior" ? "Prior" : "Budget"}
                </button>
              ))}
            </div>
            <span className={cn("ml-auto rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-widest ring-1",
              totalVar >= 0 ? "bg-accent/12 text-accent ring-accent/30" : "bg-destructive/15 text-destructive ring-destructive/40")}>
              Total variance {money(totalVar)}
            </span>
          </div>

          {budgetUnavailable ? (
            <EmptyNote title="Budget basis needs the budgets table" hint="Apply migration 21 (budgets), then switch to “vs Budget”. Prior-period basis works now." />
          ) : (
            <>
              <ChartCard title={`Operating income bridge · ${periodKey} vs ${bridge.baseLabel}`} hint="drivers sum to Δ">
                <Waterfall steps={bridge.steps} />
              </ChartCard>

              <div className="overflow-hidden rounded-[1.5rem] bg-card shadow-soft ring-1 ring-border">
                <div className="grid grid-cols-[1.4fr_repeat(4,1fr)] gap-x-3 border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>Driver</span><span className="text-right">{bridge.baseLabel === "Budget" ? "Budget" : "Base"}</span>
                  <span className="text-right">Actual</span><span className="text-right">Variance</span><span className="text-right">Impact on OI</span>
                </div>
                {bridge.drivers.map((d) => (
                  <div key={d.code} className="grid grid-cols-[1.4fr_repeat(4,1fr)] gap-x-3 px-5 py-2 text-sm hover:bg-secondary/40">
                    <span className="truncate"><span className="mr-2 font-mono text-xs text-muted-foreground">{d.code}</span>{d.label}</span>
                    <span className="text-right font-mono tabular-nums text-muted-foreground">{money(d.base)}</span>
                    <span className="text-right font-mono tabular-nums">{money(d.actual)}</span>
                    <span className="text-right font-mono tabular-nums text-muted-foreground">{money(d.variance)}</span>
                    <span className={cn("text-right font-mono tabular-nums", d.favorable ? "text-accent" : "text-destructive")}>{money(d.impact)}</span>
                  </div>
                ))}
                <div className="grid grid-cols-[1.4fr_repeat(4,1fr)] gap-x-3 border-t border-border bg-secondary/40 px-5 py-3 font-semibold">
                  <span>Operating income</span>
                  <span className="text-right font-mono tabular-nums">{money(bridge.baseOI)}</span>
                  <span className="text-right font-mono tabular-nums">{money(bridge.actualOI)}</span>
                  <span className="text-right font-mono tabular-nums">{money(totalVar)}</span>
                  <span className={cn("text-right font-mono tabular-nums", totalVar >= 0 ? "text-accent" : "text-destructive")}>{money(totalVar)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
