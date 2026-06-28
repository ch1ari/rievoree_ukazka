import { useState } from "react"
import { Boxes, Plus, Trash2, Check, X, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { SimpleSelect } from "@/components/ui/select"
import { useMyEntities, useCreateEntity, useRenameEntity, useDeleteEntity } from "@/lib/data/useMyEntities"
import type { ProvisionMode } from "@/lib/auth/mfa"

/**
 * Manage your own entities (personal sandboxes): create more (cloned demo data
 * or empty), rename, or delete. Scoped to entities you own — server RPCs enforce
 * it — so the showcase tenants are never touched.
 */
export function EntityManager() {
  const { data: entities, isLoading } = useMyEntities()
  const create = useCreateEntity()
  const rename = useRenameEntity()
  const remove = useDeleteEntity()

  const [newName, setNewName] = useState("")
  const [newMode, setNewMode] = useState<ProvisionMode>("own")
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [confirmId, setConfirmId] = useState<string | null>(null)

  function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    create.mutate({ name: newName.trim(), mode: newMode }, { onSuccess: () => setNewName("") })
  }
  function saveRename(id: string) {
    if (editName.trim()) rename.mutate({ id, name: editName.trim() })
    setEditId(null)
  }

  const inputClass =
    "rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50"

  return (
    <section className="mt-8 max-w-2xl rounded-[1.5rem] bg-card p-6 shadow-soft ring-1 ring-border md:p-7">
      <div className="flex items-center gap-2">
        <Boxes className="size-4 text-accent" />
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Your entities</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Each entity is an isolated set of books. Create more sandboxes, rename or delete them —
        only the ones you own.
      </p>

      {/* List */}
      <div className="mt-5 space-y-2">
        {isLoading ? (
          <p className="font-mono text-xs text-muted-foreground">loading…</p>
        ) : (entities?.length ?? 0) === 0 ? (
          <p className="font-mono text-xs text-muted-foreground">No entities yet — create one below.</p>
        ) : (
          entities!.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
              {editId === e.id ? (
                <>
                  <input autoFocus value={editName} onChange={(ev) => setEditName(ev.target.value)}
                    className={cn(inputClass, "flex-1")} />
                  <button onClick={() => saveRename(e.id)} aria-label="Save name"
                    className="rounded-md p-2 text-accent hover:bg-accent/10"><Check className="size-4" /></button>
                  <button onClick={() => setEditId(null)} aria-label="Cancel"
                    className="rounded-md p-2 text-muted-foreground hover:bg-foreground/[0.05]"><X className="size-4" /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate font-mono text-sm">{e.name}</span>
                  <button onClick={() => { setEditId(e.id); setEditName(e.name) }} aria-label="Rename"
                    className="rounded-md p-2 text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground"><Pencil className="size-4" /></button>
                  {confirmId === e.id ? (
                    <button onClick={() => { remove.mutate(e.id); setConfirmId(null) }}
                      className="rounded-md bg-destructive/15 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-destructive">
                      Confirm delete
                    </button>
                  ) : (
                    <button onClick={() => setConfirmId(e.id)} aria-label="Delete"
                      className="rounded-md p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create */}
      <form onSubmit={submitCreate} className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">New entity name</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. My second company" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Data</span>
          <SimpleSelect
            size="default" className="w-full sm:w-44" aria-label="Starting data"
            value={newMode} onValueChange={(v) => setNewMode(v as ProvisionMode)}
            options={[{ value: "own", label: "Empty" }, { value: "demo", label: "Clone demo data" }]}
          />
        </label>
        <button type="submit" disabled={create.isPending || !newName.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110 disabled:opacity-50">
          <Plus className="size-4" /> {create.isPending ? "Creating…" : "Create"}
        </button>
      </form>

      {(create.isError || rename.isError || remove.isError) && (
        <p role="alert" className="mt-3 font-mono text-xs text-destructive">
          {((create.error || rename.error || remove.error) as Error)?.message}
        </p>
      )}
    </section>
  )
}
