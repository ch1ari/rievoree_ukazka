import { useEffect, useState } from "react"
import { Columns3 } from "lucide-react"
import { SimpleSelect } from "@/components/ui/select"
import type { RulesetRules } from "@/lib/data/useRuleset"

/**
 * Column mapping — when a CSV is chosen, read its header row and let the user say
 * which of their columns is the account code, date, debit/credit, etc. The chosen
 * mapping is handed up as header_aliases; the upload step publishes it on the
 * entity's ruleset so the worker reads the right columns. (XLSX is mapped by
 * header name directly — no client-side parse — so the mapper is CSV-only.)
 */

export const MAP_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "account_code", label: "Account code", required: true },
  { key: "txn_date", label: "Date", required: true },
  { key: "debit", label: "Debit" },
  { key: "credit", label: "Credit" },
  { key: "amount", label: "Amount (signed)" },
  { key: "currency", label: "Currency" },
  { key: "description", label: "Description" },
]

const NONE = "__none__"

async function readCsvHeaders(file: File): Promise<string[]> {
  const text = await file.text()
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length) ?? ""
  return firstLine
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, ""))
    .filter(Boolean)
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

export function IngestMapping({
  file,
  rules,
  onChange,
}: {
  file: File | null
  rules: RulesetRules | undefined
  onChange: (aliases: Record<string, string[]> | null) => void
}) {
  const [headers, setHeaders] = useState<string[]>([])
  const [map, setMap] = useState<Record<string, string>>({})
  const isCsv = !!file && /\.csv$/i.test(file.name)

  // Parse headers when a CSV file is chosen.
  useEffect(() => {
    let active = true
    if (!file || !isCsv) { setHeaders([]); setMap({}); onChange(null); return }
    readCsvHeaders(file).then((h) => {
      if (!active) return
      setHeaders(h)
      setMap(rules ? guessMapping(h, rules) : {})
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  // Emit the mapping as header_aliases whenever it changes.
  useEffect(() => {
    if (!isCsv || headers.length === 0) { onChange(null); return }
    const aliases: Record<string, string[]> = {}
    for (const [field, col] of Object.entries(map)) if (col) aliases[field] = [col]
    onChange(Object.keys(aliases).length ? aliases : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, headers, isCsv])

  if (!file) return null

  if (!isCsv) {
    return (
      <p className="md:col-span-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
        XLSX is mapped by its header names automatically. For custom column mapping, upload a CSV.
      </p>
    )
  }

  const options = [{ value: NONE, label: "— none —" }, ...headers.map((h) => ({ value: h, label: h }))]

  return (
    <div className="md:col-span-4 rounded-xl border border-border bg-background/40 p-4">
      <div className="flex items-center gap-2">
        <Columns3 className="size-4 text-accent" />
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Map your columns <span className="text-foreground">· {file.name}</span>
        </h3>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MAP_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {f.label}{f.required && <span className="text-accent"> *</span>}
            </span>
            <SimpleSelect
              size="default" className="w-full" aria-label={f.label}
              value={map[f.key] ?? NONE}
              onValueChange={(v) => setMap((m) => ({ ...m, [f.key]: v === NONE ? "" : v }))}
              options={options}
            />
          </label>
        ))}
      </div>
      <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
        Mapping is saved to this entity's rules on upload, so the worker reads the right columns.
        <span className="text-accent"> *</span> required.
      </p>
    </div>
  )
}
