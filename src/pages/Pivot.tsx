import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { ArrowLeftRight } from "lucide-react"
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from "@tanstack/react-table"
import { cn } from "@/lib/utils"
import { useReport } from "@/lib/data/useReport"
import { useEntities } from "@/lib/data/useEntities"
import { buildPivot, DIM_LABEL, MEASURE_LABEL, type Dim, type Measure } from "@/lib/data/pivot"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"

const DIMS: Dim[] = ["entity", "type", "account", "period"]
const MEASURES: Measure[] = ["net", "debit", "credit"]
const selectClass =
  "rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-xs uppercase tracking-wider outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50"

// Compact money with accounting parentheses.
function cmp(n: number) {
  const a = Math.abs(n)
  const s = a >= 1000 ? `€${(a / 1000).toFixed(a >= 100000 ? 0 : 1)}k` : `€${Math.round(a)}`
  return n < 0 ? `(${s})` : s
}

interface Row { rowLabel: string; total: number; values: Record<string, number> }

// Heat by MAGNITUDE in a single neutral hue (avoids "revenue = red = bad", since
// credit-normal accounts have a negative net). Sign is shown by parentheses.
function HeatCell({ v, max }: { v: number; max: number }) {
  const intensity = max > 0 ? Math.min(1, Math.abs(v) / max) : 0
  const alpha = (0.05 + intensity * 0.5).toFixed(3)
  return <span className="block rounded px-2 py-1 text-right font-mono text-xs tabular-nums" style={{ background: v === 0 ? "transparent" : `oklch(0.72 0.12 158 / ${alpha})` }}>{v === 0 ? "·" : cmp(v)}</span>
}

export function Pivot() {
  const { data: rows, isLoading, error } = useReport()
  const { data: entities } = useEntities()
  const [rowDim, setRowDim] = useState<Dim>("type")
  const [colDim, setColDim] = useState<Dim>("entity")
  const [measure, setMeasure] = useState<Measure>("net")

  const names = useMemo(() => new Map((entities ?? []).map((e) => [e.id, e.name])), [entities])
  const pivot = useMemo(() => buildPivot(rows ?? [], rowDim, colDim, measure, names), [rows, rowDim, colDim, measure, names])

  const data = useMemo<Row[]>(() => pivot.rows.map((r) => ({
    rowLabel: r.label,
    total: pivot.rowTotals.get(r.key) ?? 0,
    values: Object.fromEntries(pivot.cols.map((c) => [c.key, pivot.cells.get(`${r.key}|${c.key}`) ?? 0])),
  })), [pivot])

  const columns = useMemo<ColumnDef<Row>[]>(() => [
    { id: "rowLabel", header: DIM_LABEL[rowDim], accessorKey: "rowLabel", cell: (i) => <span className="whitespace-nowrap font-medium capitalize">{String(i.getValue())}</span> },
    ...pivot.cols.map((c): ColumnDef<Row> => ({
      id: c.key, header: c.label, accessorFn: (row) => row.values[c.key] ?? 0,
      cell: (i) => <HeatCell v={Number(i.getValue())} max={pivot.maxAbs} />,
    })),
    { id: "__total", header: "Total", accessorFn: (row) => row.total, cell: (i) => <span className="block px-2 text-right font-mono text-xs font-semibold tabular-nums">{cmp(Number(i.getValue()))}</span> },
  ], [pivot, rowDim])

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() })

  function setRow(d: Dim) { setRowDim(d); if (d === colDim) setColDim(DIMS.find((x) => x !== d)!) }
  function setCol(d: Dim) { setColDim(d); if (d === rowDim) setRowDim(DIMS.find((x) => x !== d)!) }
  function swap() { setRowDim(colDim); setColDim(rowDim) }

  return (
    <div className="relative">
      <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }} className="pb-8">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">Dimensional analysis</span>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">Pivot</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Slice the ledger across any two dimensions — entity, account, type, period. Swap
          orientation; cells are heat-mapped by magnitude. Multi-entity pivoting most dashboards skip.
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
              Rows
              <select className={selectClass} value={rowDim} onChange={(e) => setRow(e.target.value as Dim)}>
                {DIMS.map((d) => <option key={d} value={d}>{DIM_LABEL[d]}</option>)}
              </select>
            </label>
            <button onClick={swap} aria-label="Swap rows and columns"
              className="rounded-lg border border-border p-2 text-muted-foreground transition hover:border-accent hover:text-accent">
              <ArrowLeftRight className="size-3.5" />
            </button>
            <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Columns
              <select className={selectClass} value={colDim} onChange={(e) => setCol(e.target.value as Dim)}>
                {DIMS.map((d) => <option key={d} value={d}>{DIM_LABEL[d]}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Measure
              <select className={selectClass} value={measure} onChange={(e) => setMeasure(e.target.value as Measure)}>
                {MEASURES.map((m) => <option key={m} value={m}>{MEASURE_LABEL[m]}</option>)}
              </select>
            </label>
          </div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="overflow-x-auto rounded-[1.5rem] bg-card shadow-soft ring-1 ring-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border">
                    {hg.headers.map((h) => (
                      <th key={h.id} className={cn("sticky top-0 bg-card px-3 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
                        h.column.id === "rowLabel" ? "text-left" : "text-right")}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-secondary/30">
                    {r.getVisibleCells().map((c) => (
                      <td key={c.id} className={cn("px-2 py-1", c.column.id === "rowLabel" && "px-3")}>
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-secondary/40 font-semibold">
                  <td className="px-3 py-3 font-mono text-[11px] uppercase tracking-wider">Total</td>
                  {pivot.cols.map((c) => (
                    <td key={c.key} className="px-2 py-3 text-right font-mono text-xs tabular-nums">{cmp(pivot.colTotals.get(c.key) ?? 0)}</td>
                  ))}
                  <td className="px-2 py-3 text-right font-mono text-xs tabular-nums">{cmp(pivot.grand)}</td>
                </tr>
              </tfoot>
            </table>
          </motion.div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {pivot.rows.length} × {pivot.cols.length} · {MEASURE_LABEL[measure]} · shaded by magnitude · (x) = credit / negative net
          </p>
        </div>
      )}
    </div>
  )
}
