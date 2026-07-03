import { useState } from "react"
import { CheckCircle2, ListPlus, Wand2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { SimpleSelect } from "@/components/ui/select"
import { ACCOUNT_TYPES, guessAccountType, classifyAccountsRemote, type Account, type AccountType } from "@/lib/data/useAccounts"

/**
 * Shown when an upload contains account codes not yet in the entity's chart. The
 * user names each new account and confirms its type (pre-filled by a heuristic),
 * so any chart of accounts works. On confirm the accounts are created, then the
 * upload proceeds.
 *
 * The mapping is meant to feel reassuring: every code is pre-matched to the Slovak
 * chart of accounts on open, each row shows a colour-coded "recognised" tick, and
 * a green summary banner confirms the whole batch mapped cleanly so the user can
 * see at a glance that nothing slipped through.
 */

// Per-type colour + short word, so a row's classification reads at a glance.
const TYPE_META: Record<AccountType, { dot: string; word: string }> = {
  asset: { dot: "bg-signal", word: "Asset" },
  liability: { dot: "bg-amber-400", word: "Liability" },
  equity: { dot: "bg-cold", word: "Equity" },
  revenue: { dot: "bg-accent", word: "Revenue" },
  expense: { dot: "bg-destructive", word: "Expense" },
}

export function ClassifyAccounts({
  codes, busy, onConfirm, onCancel,
}: {
  codes: string[]
  busy: boolean
  onConfirm: (accounts: Account[]) => void
  onCancel: () => void
}) {
  const [rows, setRows] = useState<Record<string, { name: string; type: AccountType }>>(
    () => Object.fromEntries(codes.map((c) => [c, { name: "", type: guessAccountType(c) }])),
  )
  const [mapping, setMapping] = useState(false)
  const [mapped, setMapped] = useState(false)

  function set(code: string, patch: Partial<{ name: string; type: AccountType }>) {
    setRows((r) => ({ ...r, [code]: { ...r[code], ...patch } }))
    setMapped(false)
  }
  async function autoMap() {
    setMapping(true); setMapped(false)
    const m = await classifyAccountsRemote(codes)
    setRows((r) => Object.fromEntries(codes.map((c) => [c, { ...r[c], type: m[c] ?? guessAccountType(c) }])))
    setMapping(false); setMapped(true)
  }
  function confirm() {
    onConfirm(codes.map((c) => ({ code: c, name: rows[c].name.trim() || c, type: rows[c].type })))
  }

  // Every code always carries a type (the heuristic always returns one), so the
  // whole batch is considered mapped — the banner makes that obvious.
  const allMapped = codes.length > 0

  return (
    <div className="mt-4 rounded-[1.5rem] border border-accent/40 bg-accent/[0.06] p-6">
      <div className="flex flex-wrap items-center gap-2">
        <ListPlus className="size-4 text-accent" />
        <h3 className="font-mono text-xs uppercase tracking-widest text-accent">
          New accounts in this file ({codes.length})
        </h3>
        <button type="button" onClick={autoMap} disabled={busy || mapping}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-accent/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-accent transition hover:bg-accent/10 disabled:opacity-60">
          <Wand2 className="size-3.5" />
          {mapping ? "Mapping…" : mapped ? "✓ Re-mapped" : "Auto-map (SK chart)"}
        </button>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Types are auto-set from the Slovak chart of accounts (rámcová účtová osnova)
        by account class. Check them, change any if needed, then we'll add the accounts
        and continue the upload.
      </p>

      {/* Reassuring summary — the whole batch mapped cleanly. */}
      {allMapped && (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-accent/40 bg-accent/[0.08] px-4 py-3">
          <CheckCircle2 className="size-5 shrink-0 text-accent" />
          <p className="text-sm leading-snug text-foreground">
            <span className="font-semibold">All {codes.length} account{codes.length === 1 ? "" : "s"} matched</span>
            {mapped ? " the Slovak chart of accounts" : " a type"} — review the names below and confirm.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-2">
        <div className="grid grid-cols-[2rem_5rem_1fr_9rem] gap-3 px-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className="sr-only">OK</span><span>Code</span><span>Name</span><span>Type</span>
        </div>
        {codes.map((c) => {
          const meta = TYPE_META[rows[c].type]
          return (
            <div key={c} className="grid grid-cols-[2rem_5rem_1fr_9rem] items-center gap-3">
              {/* Per-row "recognised" tick — the code mapped to a known type. */}
              <span className="flex justify-center" title={`Recognised as ${meta.word}`}>
                <CheckCircle2 className="size-4 text-accent" />
              </span>
              <span className="font-mono text-sm">{c}</span>
              <input
                value={rows[c].name}
                onChange={(e) => set(c, { name: e.target.value })}
                placeholder={`e.g. account ${c}`}
                className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50"
              />
              <div className="relative">
                {/* Colour dot reflects the chosen type, so the classification is visible. */}
                <span className={cn("pointer-events-none absolute left-3 top-1/2 z-10 size-2 -translate-y-1/2 rounded-full", meta.dot)} />
                <SimpleSelect
                  size="default" className="w-full pl-7" aria-label={`Type for ${c}`}
                  value={rows[c].type}
                  onValueChange={(v) => set(c, { type: v as AccountType })}
                  options={ACCOUNT_TYPES}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button type="button" onClick={confirm} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110 disabled:opacity-50">
          {busy ? "Adding…" : <><CheckCircle2 className="size-3.5" /> Add accounts & upload</>}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}
          className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
    </div>
  )
}
