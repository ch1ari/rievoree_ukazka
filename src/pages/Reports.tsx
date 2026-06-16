import { useMemo, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useReport } from "@/lib/data/useReport"
import { useEntities } from "@/lib/data/useEntities"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"

const eur = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
})

const selectClass =
  "border border-border bg-background px-2 py-1 font-mono text-xs uppercase tracking-wider"

export function Reports() {
  const { data: rows, isLoading, error } = useReport()
  const { data: entities } = useEntities()
  const [entityId, setEntityId] = useState("all")
  const [period, setPeriod] = useState("all")

  const names = useMemo(
    () => new Map((entities ?? []).map((e) => [e.id, e.name])),
    [entities],
  )
  const periods = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.period))].sort().reverse(),
    [rows],
  )
  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          (entityId === "all" || r.entity_id === entityId) &&
          (period === "all" || r.period === period),
      ),
    [rows, entityId, period],
  )

  return (
    <div>
      <header className="border-b border-border pb-8">
        <h1 className="text-6xl font-bold tracking-tighter md:text-7xl">Reports</h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Per-account monthly roll-up from{" "}
          <code className="font-mono text-base">report_account_monthly</code>,
          filtered to your entities by RLS.
        </p>
      </header>

      <div className="mt-10">
        {isLoading ? (
          <LoadingNote label="loading report…" />
        ) : error ? (
          <ErrorNote message={error.message} />
        ) : (rows?.length ?? 0) === 0 ? (
          <EmptyNote
            title="No report data for your entities"
            hint="Approve and load a batch on the Ingest page and figures will appear here."
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Entity
                <select
                  className={selectClass}
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                >
                  <option value="all">All ({names.size})</option>
                  {[...names.entries()].map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Period
                <select
                  className={selectClass}
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <option value="all">All</option>
                  {periods.map((p) => (
                    <option key={p} value={p}>
                      {p.slice(0, 7)}
                    </option>
                  ))}
                </select>
              </label>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-muted-foreground tabular-nums">
                {filtered.length.toLocaleString("en")} rows
              </span>
            </div>

            {filtered.length === 0 ? (
              <EmptyNote title="No rows match this filter" />
            ) : (
              <div className="max-h-[60vh] overflow-y-auto border border-border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
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
            )}
          </>
        )}
      </div>
    </div>
  )
}
