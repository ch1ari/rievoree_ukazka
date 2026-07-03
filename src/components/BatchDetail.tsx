import { useMemo, useState } from "react"
import { X, Check, AlertTriangle, Ban, Scale, Wand2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { SimpleSelect } from "@/components/ui/select"
import { useBatchRows, useReprocessBatch, type StagingRowView } from "@/lib/data/useBatches"
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

          {/* Review-time column remap — fix mis-mapped source columns (common with
              connector/webhook data whose headers we don't control) and re-run the
              real validation + z-score without re-uploading. */}
          {canApprove && status === "awaiting_review" && <RemapPanel batchId={batchId} rows={rows!} />}

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

// Sentinel for "no column" — Radix Select items can't have an empty value.
const NONE = "__none__"

// The fields we can map a source column onto. txn_date + account_code are the
// ones that, missing, error every row — so they lead.
const REMAP_FIELDS: { key: string; label: string; aliases: string[] }[] = [
  { key: "account_code", label: "Account code", aliases: ["account code", "account_code", "account", "code", "acct"] },
  { key: "txn_date", label: "Date", aliases: ["txn date", "txn_date", "date", "posting date", "datum"] },
  { key: "debit", label: "Debit", aliases: ["debit", "dr", "md"] },
  { key: "credit", label: "Credit", aliases: ["credit", "cr", "dal"] },
  { key: "currency", label: "Currency", aliases: ["currency", "ccy", "mena"] },
  { key: "description", label: "Description", aliases: ["description", "desc", "memo", "popis"] },
]

function parseNumLoose(v: string): number | null {
  const t = v.trim().replace(/\s/g, "").replace(/,(?=\d{3}\b)/g, "")
  if (!t) return null
  const cleaned = t.includes(",") && !t.includes(".") ? t.replace(",", ".") : t
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null
}

function parseDateLoose(v: string): string | null {
  const t = v.trim()
  if (!t) return null
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)        // dd.mm.yyyy or dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  m = t.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
  return null
}

/** Map source columns (from each row's `raw`) onto the canonical fields and
 *  re-stage via process_uploaded_rows — the same server path a CSV upload uses. */
function RemapPanel({ batchId, rows }: { batchId: string; rows: StagingRowView[] }) {
  const reprocess = useReprocessBatch()

  // All source columns present across the batch's raw rows.
  const columns = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.raw) for (const k of Object.keys(r.raw)) set.add(k)
    return [...set]
  }, [rows])

  // Initial guess: match each field's aliases against the available columns.
  const initial = useMemo(() => {
    const map: Record<string, string> = {}
    for (const f of REMAP_FIELDS) {
      const hit = columns.find((c) => f.aliases.includes(c.trim().toLowerCase()))
      if (hit) map[f.key] = hit
    }
    return map
  }, [columns])

  const [map, setMap] = useState<Record<string, string>>(initial)
  const sample = rows.find((r) => r.raw)?.raw ?? {}

  if (!columns.length) return null

  function apply() {
    const built = rows.map((r) => {
      const raw = (r.raw ?? {}) as Record<string, unknown>
      const pick = (key: string) => {
        const col = map[key]
        return col && col !== NONE ? String(raw[col] ?? "") : ""
      }
      return {
        account_code: pick("account_code").trim() || null,
        txn_date: parseDateLoose(pick("txn_date")),
        description: pick("description").trim() || null,
        debit: parseNumLoose(pick("debit")),
        credit: parseNumLoose(pick("credit")),
        currency: pick("currency").trim().toUpperCase() || null,
        raw,
      }
    })
    reprocess.mutate({ batchId, rows: built })
  }

  // Radix Select forbids an empty-string item value, so "none" uses a sentinel.
  const options = [{ value: NONE, label: "— none —" }, ...columns.map((c) => ({ value: c, label: c }))]

  return (
    <details className="mt-4 rounded-xl border border-border bg-background/40 p-4 open:bg-background/60">
      <summary className="flex cursor-pointer select-none items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        <Wand2 className="size-3.5 text-accent" /> Remap columns
        <span className="text-foreground/50">(fix mis-read columns &amp; re-check)</span>
      </summary>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Pick which source column feeds each field, then re-run validation — no re-upload.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REMAP_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{f.label}</span>
            <SimpleSelect size="sm" className="w-full" aria-label={f.label}
              value={map[f.key] ?? NONE} onValueChange={(v) => setMap((m) => ({ ...m, [f.key]: v }))}
              options={options} />
            {map[f.key] && map[f.key] !== NONE && (
              <span className="truncate font-mono text-[10px] text-foreground/50">
                e.g. {String((sample as Record<string, unknown>)[map[f.key]] ?? "—")}
              </span>
            )}
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" className="font-mono" disabled={reprocess.isPending} onClick={apply}>
          {reprocess.isPending ? "Re-checking…" : "Apply mapping & re-check"}
        </Button>
        {reprocess.isError && <span className="font-mono text-[11px] text-destructive">{(reprocess.error as Error).message}</span>}
        {reprocess.isSuccess && <span className="font-mono text-[11px] text-accent">✓ Re-checked — see updated rows above.</span>}
      </div>
    </details>
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
