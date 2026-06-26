import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useReport } from "@/lib/data/useReport"
import { useEntities } from "@/lib/data/useEntities"
import { useBudget } from "@/lib/data/useBudget"
import { buildPl } from "@/lib/data/pl"
import { Sparkline, COLORS } from "@/components/charts/FinancialCharts"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { SimpleSelect } from "@/components/ui/select"

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
// Accounting format — negatives in parentheses.
const money = (n: number) => (n < 0 ? `(${eur.format(Math.abs(n))})` : eur.format(n))
const ROW = "grid grid-cols-[minmax(160px,1fr)_84px_repeat(3,minmax(78px,108px))_64px] items-center gap-x-3 px-5"

export function Pl() {
  const { data: rows, isLoading, error } = useReport()
  const { data: entities } = useEntities()
  const { data: budgets } = useBudget()
  const [entityId, setEntityId] = useState("all")
  const [period, setPeriod] = useState("all")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const names = useMemo(() => new Map((entities ?? []).map((e) => [e.id, e.name])), [entities])
  const periods = useMemo(() => [...new Set((rows ?? []).map((r) => r.period))].sort().reverse(), [rows])

  const scopedRows = useMemo(() => (rows ?? []).filter((r) => entityId === "all" || r.entity_id === entityId), [rows, entityId])
  const scopedBudgets = useMemo(() => (budgets ?? []).filter((b) => entityId === "all" || b.entity_id === entityId), [budgets, entityId])
  const model = useMemo(() => buildPl(scopedRows, scopedBudgets, period), [scopedRows, scopedBudgets, period])
  const hasBudget = (budgets?.length ?? 0) > 0

  function toggle(id: string) {
    setCollapsed((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  return (
    <div className="relative">
      <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }} className="pb-8">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">Income statement</span>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">P&amp;L</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Profit &amp; loss with Actual / Budget / Variance — subtotals, accounting sign convention,
          and a trend per line. Drill into a section by collapsing it.
        </p>
      </motion.header>

      {isLoading ? (
        <LoadingNote label="loading statement…" />
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
                value={period}
                onValueChange={setPeriod}
                options={[
                  { value: "all", label: "All (18 mo.)" },
                  ...periods.map((p) => ({ value: p, label: p.slice(0, 7) })),
                ]}
              />
            </label>
            {!hasBudget && (
              <span className="ml-auto rounded-full border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Budget columns — apply migration 21
              </span>
            )}
          </div>

          <div className="overflow-hidden rounded-[1.5rem] bg-card shadow-soft ring-1 ring-border">
            {/* column header */}
            <div className={cn(ROW, "border-b border-border py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground")}>
              <span>Line</span>
              <span className="text-center">Trend</span>
              <span className="text-right">Actual</span>
              <span className="text-right">Budget</span>
              <span className="text-right">Var</span>
              <span className="text-right">Var %</span>
            </div>

            {model.map((r) => {
              if (r.kind === "section") {
                const open = !collapsed.has(r.id)
                return (
                  <button key={r.id} onClick={() => toggle(r.id)}
                    className={cn(ROW, "w-full border-t border-border/60 py-2.5 text-left transition-colors hover:bg-secondary first:border-t-0")}>
                    <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                      <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} /> {r.label}
                    </span>
                  </button>
                )
              }
              if (r.kind === "line") {
                if (collapsed.has(r.sectionId)) return null
                const v = r.actual - r.budget
                return (
                  <div key={r.code} className={cn(ROW, "py-2 text-sm hover:bg-secondary/50")}>
                    <span className="truncate pl-5 text-foreground/90"><span className="mr-2 font-mono text-xs text-muted-foreground">{r.code}</span>{r.label}</span>
                    <span className="h-7"><Sparkline data={r.monthly} color={r.favorableUp ? COLORS.emerald : COLORS.teal} /></span>
                    <span className="text-right font-mono tabular-nums">{money(r.actual)}</span>
                    <Budget hasBudget={hasBudget} value={r.budget} />
                    <Var hasBudget={hasBudget} v={v} favorableUp={r.favorableUp} />
                    <VarPct hasBudget={hasBudget} v={v} budget={r.budget} />
                  </div>
                )
              }
              // subtotal
              const v = r.actual - r.budget
              return (
                <div key={r.id} className={cn(ROW, "border-t border-border py-2.5 font-medium",
                  r.strong ? "bg-secondary/40 text-base" : "text-sm")}>
                  <span className={cn("font-semibold", r.strong && "text-foreground")}>{r.label}</span>
                  <span />
                  <span className="text-right font-mono font-semibold tabular-nums">{money(r.actual)}</span>
                  <Budget hasBudget={hasBudget} value={r.budget} bold />
                  <Var hasBudget={hasBudget} v={v} favorableUp={r.favorableUp} bold />
                  <VarPct hasBudget={hasBudget} v={v} budget={r.budget} bold />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Budget({ hasBudget, value, bold }: { hasBudget: boolean; value: number; bold?: boolean }) {
  return <span className={cn("text-right font-mono tabular-nums text-muted-foreground", bold && "font-semibold")}>{hasBudget ? money(value) : "—"}</span>
}
function Var({ hasBudget, v, favorableUp, bold }: { hasBudget: boolean; v: number; favorableUp: boolean; bold?: boolean }) {
  if (!hasBudget) return <span className="text-right font-mono tabular-nums text-muted-foreground">—</span>
  const good = favorableUp ? v >= 0 : v <= 0
  return <span className={cn("text-right font-mono tabular-nums", bold && "font-semibold", good ? "text-accent" : "text-destructive")}>{money(v)}</span>
}
function VarPct({ hasBudget, v, budget, bold }: { hasBudget: boolean; v: number; budget: number; bold?: boolean }) {
  if (!hasBudget || budget === 0) return <span className="text-right font-mono tabular-nums text-muted-foreground">—</span>
  return <span className={cn("text-right font-mono tabular-nums text-muted-foreground", bold && "font-semibold")}>{((v / Math.abs(budget)) * 100).toFixed(0)}%</span>
}
