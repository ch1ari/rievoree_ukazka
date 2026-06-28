import { useMemo } from "react"
import { X, Check, AlertTriangle, Ban, Scale } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useBatchRows, type StagingRowView } from "@/lib/data/useBatches"
import { LoadingNote, ErrorNote } from "@/components/StateNote"

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

type RowState = "ok" | "flagged" | "error"
function rowState(r: StagingRowView): RowState {
  if (r.validation_errors && r.validation_errors.length) return "error"
  if (r.is_anomaly) return "flagged"
  return "ok"
}

/**
 * Batch detail — opens when you click a batch. Shows WHY each row will or won't
 * load: validation errors, anomaly (z-score) reasons, and the debit=credit
 * balance check. Makes "Approve" meaningful — you see exactly what gets promoted.
 */
export function BatchDetail({
  batchId, fileName, period, status, canApprove, approving, onApprove, onClose,
}: {
  batchId: string
  fileName: string
  period: string
  status: string
  canApprove: boolean
  approving: boolean
  onApprove: () => void
  onClose: () => void
}) {
  const { data: rows, isLoading, error } = useBatchRows(batchId)

  const summary = useMemo(() => {
    const rs = rows ?? []
    let debit = 0, credit = 0, ok = 0, flagged = 0, errors = 0
    for (const r of rs) {
      debit += Number(r.debit ?? 0)
      credit += Number(r.credit ?? 0)
      const s = rowState(r)
      if (s === "ok") ok++; else if (s === "flagged") flagged++; else errors++
    }
    return { total: rs.length, debit, credit, ok, flagged, errors, balanced: Math.abs(debit - credit) < 0.01 }
  }, [rows])

  return (
    <div className="mt-4 rounded-[1.5rem] border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-mono text-sm font-semibold">{fileName}</h3>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {period.slice(0, 7)} · {status}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-md p-2 text-muted-foreground hover:bg-foreground/[0.05]">
          <X className="size-4" />
        </button>
      </div>

      {isLoading ? (
        <LoadingNote label="loading rows…" />
      ) : error ? (
        <ErrorNote message={error.message} />
      ) : (rows?.length ?? 0) === 0 ? (
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          No rows staged for this batch yet (still processing, or it failed before parsing).
        </p>
      ) : (
        <>
          {/* Summary + the checks that make approval mean something */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Will load" value={summary.ok} tone="ok" />
            <Stat label="Flagged (held)" value={summary.flagged} tone={summary.flagged ? "flagged" : "muted"} />
            <Stat label="Errors (skipped)" value={summary.errors} tone={summary.errors ? "error" : "muted"} />
            <Stat label="Rows total" value={summary.total} tone="muted" />
          </div>

          <div className={cn(
            "mt-3 flex items-center gap-2 rounded-xl border p-3 font-mono text-xs",
            summary.balanced ? "border-accent/40 bg-accent/10 text-accent" : "border-destructive/40 bg-destructive/10 text-destructive",
          )}>
            <Scale className="size-4" />
            {summary.balanced ? (
              <span>Balanced — debits {eur.format(summary.debit)} = credits {eur.format(summary.credit)}.</span>
            ) : (
              <span>Unbalanced — debits {eur.format(summary.debit)} vs credits {eur.format(summary.credit)} (off by {eur.format(Math.abs(summary.debit - summary.credit))}).</span>
            )}
          </div>

          {/* Per-row detail */}
          <div className="mt-4 max-h-[42vh] overflow-auto rounded-xl border border-border">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-secondary/60">
                <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows!.map((r) => {
                  const s = rowState(r)
                  return (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{r.row_num}</td>
                      <td className="px-3 py-2">{r.account_code ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{r.txn_date ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.debit ? eur.format(Number(r.debit)) : "·"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.credit ? eur.format(Number(r.credit)) : "·"}</td>
                      <td className="px-3 py-2">
                        <RowStatus state={s} row={r} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {canApprove && status === "awaiting_review" && (
            <div className="mt-5 flex items-center gap-3">
              <Button onClick={onApprove} disabled={approving} className="font-mono">
                {approving ? "Approving…" : `Approve — load ${summary.ok} row${summary.ok === 1 ? "" : "s"}`}
              </Button>
              <span className="font-mono text-[11px] text-muted-foreground">
                Flagged &amp; error rows stay behind; only the {summary.ok} clean rows load.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "ok" | "flagged" | "error" | "muted" }) {
  const toneClass = {
    ok: "text-accent",
    flagged: "text-cold",
    error: "text-destructive",
    muted: "text-foreground",
  }[tone]
  return (
    <div className="rounded-xl border border-border p-3">
      <div className={cn("font-mono text-2xl font-semibold tabular-nums", toneClass)}>{value}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  )
}

function RowStatus({ state, row }: { state: RowState; row: StagingRowView }) {
  if (state === "error") {
    return (
      <span className="inline-flex items-start gap-1.5 text-destructive">
        <Ban className="mt-0.5 size-3.5 shrink-0" />
        <span className="not-italic">{(row.validation_errors ?? []).map((e) => `${e.field}: ${e.error}`).join("; ")}</span>
      </span>
    )
  }
  if (state === "flagged") {
    return (
      <span className="inline-flex items-start gap-1.5 text-cold">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span>{row.anomaly_reason ?? "anomaly vs history"}</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-accent">
      <Check className="size-3.5" /> will load
    </span>
  )
}
