import { useMemo, useState } from "react"
import { motion } from "motion/react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useReport } from "@/lib/data/useReport"
import { useEntities } from "@/lib/data/useEntities"
import { monthlyPnl, expenseByAccount } from "@/lib/data/aggregate"
import { ChartCard, PnlTrend, ExpenseTreemap } from "@/components/charts/FinancialCharts"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { SimpleSelect } from "@/components/ui/select"

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

export function Reports() {
  const { data: rows, isLoading, error } = useReport()
  const { data: entities } = useEntities()
  const [entityId, setEntityId] = useState("all")
  const [period, setPeriod] = useState("all")

  const names = useMemo(() => new Map((entities ?? []).map((e) => [e.id, e.name])), [entities])
  const periods = useMemo(() => [...new Set((rows ?? []).map((r) => r.period))].sort().reverse(), [rows])

  // Charts reflect the entity filter but ALL periods (so the trend is whole + clickable).
  const entityRows = useMemo(
    () => (rows ?? []).filter((r) => entityId === "all" || r.entity_id === entityId),
    [rows, entityId],
  )
  const pnl = useMemo(() => monthlyPnl(entityRows), [entityRows])
  const expenses = useMemo(() => expenseByAccount(entityRows), [entityRows])

  // Table reflects entity + period.
  const filtered = useMemo(
    () => entityRows.filter((r) => period === "all" || r.period === period),
    [entityRows, period],
  )

  // Clicking a month on the trend sets the period filter (interactive drill-in).
  function selectMonth(month: string) {
    const match = periods.find((p) => p.slice(0, 7) === month)
    if (match) setPeriod((cur) => (cur === match ? "all" : match))
  }

  return (
    <div className="relative">
      <motion.header
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }}
        className="pb-10">
        <h1 className="text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">Reports</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Per-account monthly roll-up from{" "}
          <code className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-sm text-foreground ring-1 ring-border">report_account_monthly</code>,
          filtered to your entities by RLS.
        </p>
      </motion.header>

      {isLoading ? (
        <LoadingNote label="loading report…" />
      ) : error ? (
        <ErrorNote message={error.message} />
      ) : (rows?.length ?? 0) === 0 ? (
        <EmptyNote title="No report data for your entities"
          hint="Approve and load a batch on the Ingest page and figures will appear here." />
      ) : (
        <div className="space-y-8">
          {/* Charts */}
          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45 }}>
              <ChartCard title="Revenue vs expenses" hint="click a month to filter ↓">
                <PnlTrend data={pnl} onSelectMonth={selectMonth} />
              </ChartCard>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45, delay: 0.08 }}>
              <ChartCard title="Cost structure" hint="COGS + opex">
                <ExpenseTreemap data={expenses} />
              </ChartCard>
            </motion.div>
          </div>

          {/* Filters */}
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
                  { value: "all", label: "All" },
                  ...periods.map((p) => ({ value: p, label: p.slice(0, 7) })),
                ]}
              />
            </label>
            <span className="ml-auto rounded-full bg-secondary px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground ring-1 ring-border tabular-nums">
              {filtered.length.toLocaleString("en")} rows
            </span>
          </div>

          {filtered.length === 0 ? (
            <EmptyNote title="No rows match this filter" />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="overflow-hidden rounded-[1.5rem] bg-card shadow-soft ring-1 ring-border">
              <div className="max-h-[60vh] overflow-y-auto">
                <Table className="min-w-[720px]">
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="font-mono text-[10px] uppercase tracking-wider">Period</TableHead>
                      <TableHead className="font-mono text-[10px] uppercase tracking-wider">Entity</TableHead>
                      <TableHead className="font-mono text-[10px] uppercase tracking-wider">Account</TableHead>
                      <TableHead className="font-mono text-[10px] uppercase tracking-wider">Type</TableHead>
                      <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider">Debit</TableHead>
                      <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider">Credit</TableHead>
                      <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={`${r.entity_id}-${r.period}-${r.account_id}`}>
                        <TableCell className="font-mono text-xs tabular-nums">{r.period.slice(0, 7)}</TableCell>
                        <TableCell className="font-mono text-xs">{names.get(r.entity_id) ?? r.entity_id.slice(0, 8)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          <span className="text-muted-foreground">{r.account_code}</span> {r.account_name}
                        </TableCell>
                        <TableCell className="font-mono text-xs capitalize text-muted-foreground">{r.account_type}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">{eur.format(Number(r.debit))}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">{eur.format(Number(r.credit))}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">{eur.format(Number(r.net))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  )
}
