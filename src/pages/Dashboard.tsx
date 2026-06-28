import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { useReport } from "@/lib/data/useReport"
import { useEntities } from "@/lib/data/useEntities"
import { monthlyPnl, expenseByAccount, executiveSeries, executiveKpis, type Kpi } from "@/lib/data/aggregate"
import { ChartCard, PnlTrend, ExpenseTreemap, RevenueMarginCombo, Sparkline, COLORS } from "@/components/charts/FinancialCharts"
import { CountUp } from "@/components/CountUp"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { SimpleSelect } from "@/components/ui/select"

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

export function Dashboard() {
  const { data: rows, isLoading, error } = useReport()
  const { data: entities } = useEntities()
  const [entityId, setEntityId] = useState("all")

  const names = useMemo(() => new Map((entities ?? []).map((e) => [e.id, e.name])), [entities])
  const filtered = useMemo(() => (rows ?? []).filter((r) => entityId === "all" || r.entity_id === entityId), [rows, entityId])

  const exec = useMemo(() => executiveSeries(filtered), [filtered])
  const k = useMemo(() => executiveKpis(exec), [exec])
  const combo = useMemo(() => exec.map((p) => ({ month: p.month, revenue: p.revenue, marginPct: p.marginPct })), [exec])
  const pnl = useMemo(() => monthlyPnl(filtered), [filtered])
  const expenses = useMemo(() => expenseByAccount(filtered), [filtered])

  const cards: { label: string; kpi: Kpi; fmt: (n: number) => string; goodUp: boolean; color: string }[] = [
    { label: "Revenue · last mo.", kpi: k.revenue, fmt: (n) => eur.format(n), goodUp: true, color: COLORS.emerald },
    { label: "EBITDA · last mo.", kpi: k.ebitda, fmt: (n) => eur.format(n), goodUp: true, color: COLORS.emerald },
    { label: "Cash position", kpi: k.cash, fmt: (n) => eur.format(n), goodUp: true, color: COLORS.teal },
    { label: "DSO (days)", kpi: k.dso, fmt: (n) => `${Math.round(n)}d`, goodUp: false, color: COLORS.amber },
  ]

  return (
    <div className="relative">
      <motion.header
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }}
        className="pb-10">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">Executive overview</span>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">Dashboard</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          The CFO snapshot — live, RLS-filtered figures for the entities your role can see.
          Inspect the query and policy in the X-ray panel.
        </p>
      </motion.header>

      {isLoading ? (
        <LoadingNote label="loading report…" />
      ) : error ? (
        <ErrorNote message={error.message} />
      ) : (rows?.length ?? 0) === 0 ? (
        <EmptyNote title="No report data for your entities"
          hint="Once a batch is approved and loaded, figures appear here." />
      ) : (
        <div className="space-y-8">
          {names.size > 1 && (
            <div className="flex items-center gap-3">
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
            </div>
          )}

          {/* KPI cards with sparkline + MoM delta */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
            {cards.map((c, i) => (
              <motion.div key={c.label}
                initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.06, ease: "easeOut" }}
                className="rounded-2xl bg-card p-5 shadow-soft ring-1 ring-border">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{c.label}</span>
                  <DeltaChip delta={c.kpi.delta} goodUp={c.goodUp} />
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums lg:text-3xl">
                  <CountUp value={c.kpi.value} format={c.fmt} delay={i * 0.06} />
                </div>
                <div className="mt-1.5 h-9"><Sparkline data={c.kpi.spark} color={c.color} /></div>
              </motion.div>
            ))}
          </div>

          {/* Combo: revenue bars + operating margin % line */}
          <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45 }}>
            <ChartCard title="Revenue & operating margin" hint="18 months">
              <RevenueMarginCombo data={combo} />
            </ChartCard>
          </motion.div>

          {/* Revenue vs expenses + expense mix */}
          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45 }}>
              <ChartCard title="Revenue vs expenses" hint="€"><PnlTrend data={pnl} /></ChartCard>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45, delay: 0.08 }}>
              <ChartCard title="Cost structure" hint="COGS + opex"><ExpenseTreemap data={expenses} /></ChartCard>
            </motion.div>
          </div>
        </div>
      )}
    </div>
  )
}

function DeltaChip({ delta, goodUp }: { delta: number | null; goodUp: boolean }) {
  if (delta == null) return null
  const up = delta >= 0
  const good = goodUp ? up : !up
  return (
    <span className={cn("font-mono text-[10px] tabular-nums", good ? "text-accent" : "text-destructive")}>
      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
    </span>
  )
}
