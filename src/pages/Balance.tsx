import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { useReport } from "@/lib/data/useReport"
import { useEntities } from "@/lib/data/useEntities"
import { buildBalanceSheet, cashFlowSteps, type BsLine } from "@/lib/data/balance"
import { ChartCard, Waterfall } from "@/components/charts/FinancialCharts"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { SimpleSelect } from "@/components/ui/select"

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
const money = (n: number) => (n < 0 ? `(${eur.format(Math.abs(n))})` : eur.format(n))

export function Balance() {
  const { data: rows, isLoading, error } = useReport()
  const { data: entities } = useEntities()
  const [entityId, setEntityId] = useState("all")

  const names = useMemo(() => new Map((entities ?? []).map((e) => [e.id, e.name])), [entities])
  const scoped = useMemo(() => (rows ?? []).filter((r) => entityId === "all" || r.entity_id === entityId), [rows, entityId])
  const bs = useMemo(() => buildBalanceSheet(scoped), [scoped])
  const cf = useMemo(() => cashFlowSteps(scoped), [scoped])
  const balanced = Math.abs(bs.check) < 1

  return (
    <div className="relative">
      <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }} className="pb-8">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">Statement of financial position</span>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">Balance sheet</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Assets, liabilities &amp; equity — with the fundamental check that it ties — plus an
          indirect cash-flow waterfall (operating → investing → financing → closing).
        </p>
      </motion.header>

      {isLoading ? (
        <LoadingNote label="loading statement…" />
      ) : error ? (
        <ErrorNote message={error.message} />
      ) : (rows?.length ?? 0) === 0 ? (
        <EmptyNote title="No report data for your entities" hint="Approve and load a batch on the Ingest page." />
      ) : (
        <div className="space-y-6">
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
            <span className={cn("ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-widest",
              balanced ? "bg-accent/12 text-accent ring-1 ring-accent/30" : "bg-destructive/15 text-destructive ring-1 ring-destructive/40")}>
              {balanced ? <><Check className="size-3" strokeWidth={3} /> In balance · A = L + E</> : <>Out of balance by {money(bs.check)}</>}
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Assets" lines={bs.assets} total={bs.totalAssets} totalLabel="Total assets" />
            <div className="space-y-5">
              <Section title="Liabilities" lines={bs.liabilities} total={bs.totalLiabilities} totalLabel="Total liabilities" />
              <Section title="Equity" lines={bs.equity} total={bs.totalEquity} totalLabel="Total equity" />
            </div>
          </div>

          <ChartCard title="Cash flow · indirect" hint="trailing 12 months">
            <Waterfall steps={cf} />
          </ChartCard>
        </div>
      )}
    </div>
  )
}

function Section({ title, lines, total, totalLabel }: { title: string; lines: BsLine[]; total: number; totalLabel: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.4 }}
      className="overflow-hidden rounded-[1.5rem] bg-card shadow-soft ring-1 ring-border">
      <div className="border-b border-border px-6 py-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground/80">{title}</div>
      <div className="divide-y divide-border/60">
        {lines.map((l) => (
          <div key={l.code} className="flex items-center justify-between px-6 py-2.5 text-sm hover:bg-secondary/50">
            <span className="text-foreground/90"><span className="mr-2 font-mono text-xs text-muted-foreground">{l.code}</span>{l.label}</span>
            <span className="font-mono tabular-nums">{money(l.amount)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border bg-secondary/40 px-6 py-3 font-semibold">
        <span>{totalLabel}</span>
        <span className="font-mono tabular-nums">{money(total)}</span>
      </div>
    </motion.div>
  )
}
