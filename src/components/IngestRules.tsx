import { useEffect, useState } from "react"
import { ChevronDown, ShieldCheck, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEntityRuleset, useSaveRuleset, type RulesetRules } from "@/lib/data/useRuleset"

/**
 * Approval-rules editor — lets a manager set what passes the import for the
 * selected entity. The control is framed in plain language: pick how strict the
 * "unusual number" check should be (the three presets) and which currencies are
 * allowed. The raw statistical threshold (a z-score in σ) still drives the
 * worker, but it's tucked behind an "Advanced" disclosure so non-technical users
 * never have to reason about standard deviations. Writes a new active ruleset
 * version via set_entity_ruleset; the worker reads it on the next upload.
 */

const CURRENCIES = ["EUR", "USD", "GBP", "CZK", "PLN"]

// Ordered loosest → tightest. `threshold` is the σ the worker actually uses; the
// label/blurb the user sees never mentions it.
const PRESETS: { key: string; label: string; blurb: string; threshold: number; currencies: string[]; recommended?: boolean }[] = [
  { key: "lenient", label: "Relaxed", blurb: "Only flags really extreme numbers. Fewer interruptions, lighter checking.", threshold: 4.0, currencies: ["EUR", "USD", "GBP", "CZK"] },
  { key: "standard", label: "Balanced", blurb: "Flags numbers that look clearly out of line with the account's history.", threshold: 3.0, currencies: ["EUR", "USD", "GBP"], recommended: true },
  { key: "strict", label: "Strict", blurb: "Flags more for review and accepts EUR only. Tightest control.", threshold: 2.5, currencies: ["EUR"] },
]

// Map a σ threshold back to a plain-language sensitivity, for the summary line.
function sensitivityLabel(t: number): string {
  if (t >= 3.6) return "Relaxed — only extreme outliers are flagged."
  if (t <= 2.7) return "Strict — even mildly unusual numbers are flagged."
  return "Balanced — clearly unusual numbers are flagged."
}

export function IngestRules({ entityId, entityName }: { entityId: string | undefined; entityName?: string }) {
  const { data: eff, isLoading } = useEntityRuleset(entityId)
  const save = useSaveRuleset(entityId)

  const [threshold, setThreshold] = useState(3.0)
  const [currencies, setCurrencies] = useState<string[]>(["EUR", "USD", "GBP"])
  const [dirty, setDirty] = useState(false)
  const [advanced, setAdvanced] = useState(false)

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
          Checking rules{entityName ? ` · ${entityName}` : ""}
        </h2>
        {eff && (
          <span className="ml-auto rounded-full bg-secondary px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground ring-1 ring-border">
            {eff.scope === "entity" ? `entity · v${eff.version}` : "global default"}
          </span>
        )}
      </div>

      {/* Plain-language explanation of what these rules do, up front. */}
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        When you upload a file, every account's monthly total is compared with its
        own past months. Anything that looks <span className="text-foreground">unusually
        high or low</span> is held back and marked <span className="text-foreground">“Needs review”</span> so
        you can check it before it reaches your reports — nothing wrong loads silently.
      </p>

      {isLoading ? (
        <p className="mt-4 font-mono text-xs text-muted-foreground">loading rules…</p>
      ) : (
        <div className="mt-5 space-y-6">
          {/* Sensitivity — the primary control, in plain language. */}
          <div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              How strict should the check be?
            </span>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {PRESETS.map((p) => {
                const active = threshold === p.threshold
                return (
                  <button key={p.key} type="button" onClick={() => applyPreset(p)}
                    aria-pressed={active}
                    className={cn(
                      "relative rounded-xl border p-3 text-left transition",
                      active ? "border-accent bg-accent/10 ring-1 ring-accent/40" : "border-border hover:border-accent/60 hover:bg-foreground/[0.03]",
                    )}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold uppercase tracking-wider">{p.label}</span>
                      {p.recommended && (
                        <span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-accent">Recommended</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.blurb}</div>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
              Currently: <span className="text-foreground">{sensitivityLabel(threshold)}</span>
            </p>
          </div>

          {/* Allowed currencies */}
          <div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Accepted currencies</span>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Rows in any other currency are flagged for review. Tap to add or remove.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CURRENCIES.map((c) => {
                const on = currencies.includes(c)
                return (
                  <button key={c} type="button" onClick={() => toggleCurrency(c)}
                    aria-pressed={on}
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

          {/* Advanced — the exact statistical threshold, for power users only. */}
          <div className="rounded-xl border border-border/70">
            <button type="button" onClick={() => setAdvanced((a) => !a)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition hover:text-foreground">
              <ChevronDown className={cn("size-3.5 transition-transform", advanced && "rotate-180")} />
              Advanced — exact threshold
            </button>
            {advanced && (
              <div className="flex flex-wrap items-end gap-4 border-t border-border/70 px-4 py-4">
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Sensitivity (σ)
                  </span>
                  <input
                    type="number" step="0.1" min="1" max="10" value={threshold}
                    onChange={(e) => { setThreshold(Number(e.target.value)); setDirty(true) }}
                    className="w-28 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm tabular-nums outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50"
                  />
                </label>
                <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                  The number of standard deviations from an account's 12-month history at
                  which a row is flagged. <span className="text-foreground">Lower = stricter</span> (catches
                  more); higher = more relaxed. The presets above set this for you.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={onSave} disabled={!dirty || save.isPending}
              className="rounded-md bg-accent px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110 disabled:opacity-50">
              {save.isPending ? "Saving…" : "Save rules"}
            </button>
            {save.isError && <span className="font-mono text-xs text-destructive">{(save.error as Error).message}</span>}
            {save.isSuccess && !dirty && (
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-accent">
                <ShieldCheck className="size-3.5" /> Saved — applies to your next upload.
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
