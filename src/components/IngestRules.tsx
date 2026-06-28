import { useEffect, useState } from "react"
import { SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEntityRuleset, useSaveRuleset, type RulesetRules } from "@/lib/data/useRuleset"

/**
 * Approval-rules editor — lets a manager set what passes the import for the
 * selected entity, from prepared presets they can then tweak. Writes a new
 * active ruleset version via set_entity_ruleset; the worker reads it on the next
 * upload (column mapping, allowed currencies, and the z-score threshold that
 * decides which rows are flagged and held back from approval).
 */

const CURRENCIES = ["EUR", "USD", "GBP", "CZK", "PLN"]

const PRESETS: { key: string; label: string; blurb: string; threshold: number; currencies: string[] }[] = [
  { key: "standard", label: "Standard", blurb: "Flags > 3σ vs 12-mo history.", threshold: 3.0, currencies: ["EUR", "USD", "GBP"] },
  { key: "strict", label: "Strict", blurb: "Catches more — flags > 2.5σ, EUR only.", threshold: 2.5, currencies: ["EUR"] },
  { key: "lenient", label: "Lenient", blurb: "Only extreme outliers — flags > 4σ.", threshold: 4.0, currencies: ["EUR", "USD", "GBP", "CZK"] },
]

export function IngestRules({ entityId, entityName }: { entityId: string | undefined; entityName?: string }) {
  const { data: eff, isLoading } = useEntityRuleset(entityId)
  const save = useSaveRuleset(entityId)

  const [threshold, setThreshold] = useState(3.0)
  const [currencies, setCurrencies] = useState<string[]>(["EUR", "USD", "GBP"])
  const [dirty, setDirty] = useState(false)

  // Sync the editable state when the effective ruleset (re)loads.
  useEffect(() => {
    if (!eff) return
    setThreshold(eff.rules.zscore?.threshold ?? 3.0)
    setCurrencies(eff.rules.allowed_currencies ?? ["EUR"])
    setDirty(false)
  }, [eff])

  function applyPreset(p: (typeof PRESETS)[number]) {
    setThreshold(p.threshold)
    setCurrencies(p.currencies)
    setDirty(true)
  }
  function toggleCurrency(c: string) {
    setCurrencies((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))
    setDirty(true)
  }
  function onSave() {
    if (!eff || !entityId) return
    const next: RulesetRules = {
      ...eff.rules,
      allowed_currencies: currencies.length ? currencies : ["EUR"],
      zscore: { ...eff.rules.zscore, threshold },
    }
    save.mutate(next)
    setDirty(false)
  }

  if (!entityId) return null

  return (
    <section className="mt-8 rounded-[1.5rem] bg-card p-6 shadow-soft ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="size-4 text-accent" />
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Approval rules{entityName ? ` · ${entityName}` : ""}
        </h2>
        {eff && (
          <span className="ml-auto rounded-full bg-secondary px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground ring-1 ring-border">
            {eff.scope === "entity" ? `entity · v${eff.version}` : "global default"}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="mt-4 font-mono text-xs text-muted-foreground">loading rules…</p>
      ) : (
        <div className="mt-5 space-y-6">
          {/* Presets */}
          <div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Preset</span>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {PRESETS.map((p) => {
                const active = threshold === p.threshold
                return (
                  <button key={p.key} type="button" onClick={() => applyPreset(p)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition",
                      active ? "border-accent bg-accent/10" : "border-border hover:border-accent/60 hover:bg-foreground/[0.03]",
                    )}>
                    <div className="font-mono text-xs font-semibold uppercase tracking-wider">{p.label}</div>
                    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.blurb}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Z-score threshold */}
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Anomaly threshold (σ)
              </span>
              <input
                type="number" step="0.1" min="1" max="10" value={threshold}
                onChange={(e) => { setThreshold(Number(e.target.value)); setDirty(true) }}
                className="w-28 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm tabular-nums outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50"
              />
            </label>
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              A row whose monthly total deviates more than this many standard deviations
              from its 12-month history is <span className="text-foreground">flagged</span> and
              held back when you approve the batch.
            </p>
          </div>

          {/* Allowed currencies */}
          <div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Allowed currencies</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {CURRENCIES.map((c) => {
                const on = currencies.includes(c)
                return (
                  <button key={c} type="button" onClick={() => toggleCurrency(c)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition",
                      on ? "border-accent bg-accent/12 text-accent" : "border-border text-muted-foreground hover:border-accent/60",
                    )}>
                    {c}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={onSave} disabled={!dirty || save.isPending}
              className="rounded-md bg-accent px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110 disabled:opacity-50">
              {save.isPending ? "Saving…" : "Save rules"}
            </button>
            {save.isError && <span className="font-mono text-xs text-destructive">{(save.error as Error).message}</span>}
            {save.isSuccess && !dirty && <span className="font-mono text-xs text-accent">Saved — applies to your next upload.</span>}
          </div>
        </div>
      )}
    </section>
  )
}
