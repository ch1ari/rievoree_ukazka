import { useEffect, useState } from "react"
import { Boxes, Plus } from "lucide-react"
import { SimpleSelect } from "@/components/ui/select"
import {
  useEntityAccounts, useUpsertAccounts, ACCOUNT_TYPES, guessAccountType, type Account, type AccountType,
} from "@/lib/data/useAccounts"

/**
 * Chart of accounts editor — view the entity's accounts and add/rename/retype
 * them, so uploads with custom codes resolve. (Manager/admin via the
 * upsert_accounts RPC.) Lives on the Ingest page, tied to the selected entity.
 */
export function ChartEditor({ entityId, entityName }: { entityId: string; entityName?: string }) {
  const { data: existing, isLoading } = useEntityAccounts(entityId)
  const save = useUpsertAccounts(entityId)

  const [rows, setRows] = useState<Account[]>([])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (existing) { setRows(existing); setDirty(false) }
  }, [existing])

  function update(i: number, patch: Partial<Account>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
    setDirty(true)
  }
  function addRow() {
    setRows((r) => [...r, { code: "", name: "", type: "expense" }])
    setDirty(true)
  }
  function onSave() {
    const valid = rows.filter((r) => r.code.trim())
    save.mutate(valid.map((r) => ({ code: r.code.trim(), name: r.name.trim() || r.code.trim(), type: r.type })))
    setDirty(false)
  }

  const inputClass = "rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50"

  return (
    <details className="mt-8 rounded-[1.5rem] bg-card p-6 shadow-soft ring-1 ring-border">
      <summary className="flex cursor-pointer select-none items-center gap-2">
        <Boxes className="size-4 text-accent" />
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Chart of accounts{entityName ? ` · ${entityName}` : ""} <span className="text-accent">({existing?.length ?? 0})</span>
        </span>
      </summary>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        The accounts uploads are matched against. Add your own codes (or fix a type) so
        your files resolve. Type drives the reports — revenue/expense → P&amp;L, asset/liability/equity → balance sheet.
      </p>

      {isLoading ? (
        <p className="mt-4 font-mono text-xs text-muted-foreground">loading…</p>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-[6rem_1fr_9rem] gap-3 px-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>Code</span><span>Name</span><span>Type</span>
          </div>
          <div className="mt-2 max-h-[40vh] space-y-2 overflow-auto">
            {rows.map((r, i) => {
              const isNew = !existing?.some((e) => e.code === r.code)
              return (
                <div key={`${r.code}-${i}`} className="grid grid-cols-[6rem_1fr_9rem] items-center gap-3">
                  <input
                    value={r.code}
                    onChange={(e) => update(i, { code: e.target.value, ...(isNew ? { type: guessAccountType(e.target.value) } : {}) })}
                    disabled={!isNew}
                    placeholder="code"
                    className={`${inputClass} disabled:opacity-60`}
                  />
                  <input value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="name" className={inputClass} />
                  <SimpleSelect
                    size="default" className="w-full" aria-label={`Type for ${r.code}`}
                    value={r.type} onValueChange={(v) => update(i, { type: v as AccountType })} options={ACCOUNT_TYPES}
                  />
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={addRow}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-foreground transition hover:border-accent/60">
              <Plus className="size-3.5" /> Add account
            </button>
            <button type="button" onClick={onSave} disabled={!dirty || save.isPending}
              className="rounded-md bg-accent px-5 py-2 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110 disabled:opacity-50">
              {save.isPending ? "Saving…" : "Save chart"}
            </button>
            {save.isError && <span className="font-mono text-xs text-destructive">{(save.error as Error).message}</span>}
            {save.isSuccess && !dirty && <span className="font-mono text-xs text-accent">Saved.</span>}
          </div>
        </div>
      )}
    </details>
  )
}
