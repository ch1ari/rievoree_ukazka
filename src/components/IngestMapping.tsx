import { useEffect, useMemo, useState } from "react"
import { Columns3, Eye, EyeOff } from "lucide-react"
import { SimpleSelect } from "@/components/ui/select"
import { splitLine, type AmountMode } from "@/lib/data/parseCsv"
import type { RulesetRules } from "@/lib/data/useRuleset"

/**
 * Column mapping — when a CSV is chosen, read its header row (plus a few sample
 * data rows) and let the user say which of their columns is the account code,
 * date, debit/credit, etc. To make mapping easy even with cryptic or foreign
 * headers, the picker shows a live sample value for every column, and the user
 * picks how amounts are stored (separate debit/credit vs a single signed amount).
 * The chosen mapping is handed up as header_aliases (+ amount mode); the upload
 * step publishes it on the entity's ruleset so the parser reads the right columns.
 * (XLSX is mapped by header name directly — no client-side parse — so CSV-only.)
 */

export const MAP_FIELDS: { key: string; label: string; required?: boolean; hint?: string }[] = [
  { key: "account_code", label: "Account code", required: true, hint: "e.g. 311000, 4000" },
  { key: "txn_date", label: "Date", required: true, hint: "the posting / transaction date" },
  { key: "debit", label: "Debit", hint: "debit-side amount" },
  { key: "credit", label: "Credit", hint: "credit-side amount" },
  { key: "amount", label: "Amount (signed)", hint: "one column, + debit / − credit" },
  { key: "currency", label: "Currency", hint: "3-letter code, e.g. EUR" },
  { key: "description", label: "Description", hint: "memo / note" },
]

const NONE = "__none__"
const SAMPLE_ROWS = 3

interface Parsed {
  headers: string[]
  /** sample[colIndex] = up to SAMPLE_ROWS example values from the data rows */
  samples: string[][]
}

async function readCsvPreview(file: File): Promise<Parsed> {
  const text = await file.text()
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length)
  if (lines.length === 0) return { headers: [], samples: [] }
  const headers = splitLine(lines[0])
  const samples: string[][] = headers.map(() => [])
  for (let r = 1; r < lines.length && r <= SAMPLE_ROWS; r++) {
    const cells = splitLine(lines[r])
    headers.forEach((_, i) => { if (cells[i]?.trim()) samples[i].push(cells[i].trim()) })
  }
  return { headers, samples }
}

/** Best-guess a field→column map from the ruleset's existing aliases (case-insensitive). */
function guessMapping(headers: string[], rules: RulesetRules): Record<string, string> {
  const lower = new Map(headers.map((h) => [h.toLowerCase(), h]))
  const out: Record<string, string> = {}
  for (const f of MAP_FIELDS) {
    const aliases = [f.key, ...(rules.header_aliases?.[f.key] ?? [])].map((a) => a.toLowerCase())
    const hit = aliases.map((a) => lower.get(a)).find(Boolean)
    if (hit) out[f.key] = hit
  }
  return out
}

/** Truncated first sample value for a header, for inline previews. */
function sampleFor(parsed: Parsed, header: string): string {
  const i = parsed.headers.indexOf(header)
  const v = i >= 0 ? parsed.samples[i]?.[0] ?? "" : ""
  return v.length > 22 ? v.slice(0, 21) + "…" : v
}

export function IngestMapping({
  file,
  rules,
  onChange,
  onAmountMode,
}: {
  file: File | null
  rules: RulesetRules | undefined
  onChange: (aliases: Record<string, string[]> | null) => void
  onAmountMode?: (mode: AmountMode | null) => void
}) {
  const [parsed, setParsed] = useState<Parsed>({ headers: [], samples: [] })
  const [map, setMap] = useState<Record<string, string>>({})
  const [amountMode, setAmountMode] = useState<AmountMode>("split")
  const [showPreview, setShowPreview] = useState(false)
  const isCsv = !!file && /\.csv$/i.test(file.name)
  const headers = parsed.headers

  // Parse headers + sample rows when a CSV file is chosen.
  useEffect(() => {
    let active = true
    if (!file || !isCsv) { setParsed({ headers: [], samples: [] }); setMap({}); onChange(null); onAmountMode?.(null); return }
    readCsvPreview(file).then((p) => {
      if (!active) return
      setParsed(p)
      const guessed = rules ? guessMapping(p.headers, rules) : {}
      setMap(guessed)
      // Default the amount layout to whatever the guess found (signed amount vs split).
      setAmountMode(guessed.amount && !guessed.debit && !guessed.credit ? "signed" : "split")
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  // Emit the mapping as header_aliases (+ amount mode) whenever it changes.
  useEffect(() => {
    if (!isCsv || headers.length === 0) { onChange(null); onAmountMode?.(null); return }
    const aliases: Record<string, string[]> = {}
    for (const [field, col] of Object.entries(map)) {
      if (!col) continue
      // Only emit the amount fields relevant to the chosen layout.
      if (amountMode === "signed" && (field === "debit" || field === "credit")) continue
      if (amountMode === "split" && field === "amount") continue
      aliases[field] = [col]
    }
    onChange(Object.keys(aliases).length ? aliases : null)
    onAmountMode?.(amountMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, headers, isCsv, amountMode])

  // Fields shown depend on the amount layout the user picked.
  const fields = useMemo(
    () => MAP_FIELDS.filter((f) =>
      amountMode === "signed" ? f.key !== "debit" && f.key !== "credit" : f.key !== "amount"),
    [amountMode],
  )

  if (!file) return null

  if (!isCsv) {
    return (
      <p className="md:col-span-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
        XLSX is mapped by its header names automatically. For custom column mapping, upload a CSV.
      </p>
    )
  }

  // Each option shows the column name + a sample value so cryptic headers are identifiable.
  const options = [
    { value: NONE, label: "— none —" },
    ...headers.map((h) => {
      const s = sampleFor(parsed, h)
      return { value: h, label: s ? `${h}  ·  ${s}` : h }
    }),
  ]
  const usedCols = new Set(Object.entries(map).filter(([, v]) => v).map(([, v]) => v))

  return (
    <div className="md:col-span-4 rounded-xl border border-border bg-background/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Columns3 className="size-4 text-accent" />
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Map your columns <span className="text-foreground">· {file.name}</span>
        </h3>
        <button
          type="button"
          onClick={() => setShowPreview((s) => !s)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition hover:bg-secondary"
        >
          {showPreview ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          {showPreview ? "Hide data" : "Preview data"}
        </button>
      </div>

      {/* How are amounts stored? — a second way to map money columns. */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Amounts</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          {([["split", "Separate Debit & Credit"], ["signed", "One signed Amount"]] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setAmountMode(mode)}
              className={
                "px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition " +
                (amountMode === mode ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Optional preview of the file's columns + sample values. */}
      {showPreview && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card/60">
          <table className="w-full border-collapse text-left font-mono text-[11px]">
            <thead>
              <tr className="text-muted-foreground">
                {headers.map((h, i) => (
                  <th key={i} className={"whitespace-nowrap px-3 py-2 " + (usedCols.has(h) ? "text-accent" : "")}>
                    {h || `col${i}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.max(0, ...parsed.samples.map((s) => s.length)) }).map((_, r) => (
                <tr key={r} className="border-t border-border/60">
                  {headers.map((_, i) => (
                    <td key={i} className="whitespace-nowrap px-3 py-1.5 text-foreground/80">
                      {parsed.samples[i]?.[r] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => {
          const chosen = map[f.key] ?? ""
          const preview = chosen ? sampleFor(parsed, chosen) : ""
          return (
            <label key={f.key} className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {f.label}{f.required && <span className="text-accent"> *</span>}
              </span>
              <SimpleSelect
                size="default" className="w-full" aria-label={f.label}
                value={chosen || NONE}
                onValueChange={(v) => setMap((m) => ({ ...m, [f.key]: v === NONE ? "" : v }))}
                options={options}
              />
              <span className="font-mono text-[10px] leading-tight text-muted-foreground">
                {chosen
                  ? <>→ <span className="text-foreground/80">{preview || "(empty in sample)"}</span></>
                  : f.hint}
              </span>
            </label>
          )
        })}
      </div>
      <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
        Each column shows a sample value so you can map by content, not just the header name.
        Mapping is saved to this entity's rules on upload.
        <span className="text-accent"> *</span> required.
      </p>
    </div>
  )
}
