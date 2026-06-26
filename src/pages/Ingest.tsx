import { useId, useState } from "react"
import { motion } from "motion/react"
import { UploadCloud } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { SimpleSelect } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth/useAuth"
import { useEntities } from "@/lib/data/useEntities"
import { useBatches, useUploadBatch, useApproveBatch } from "@/lib/data/useBatches"
import { useEntityRuleset, useSaveRuleset } from "@/lib/data/useRuleset"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { IngestRules } from "@/components/IngestRules"
import { IngestMapping } from "@/components/IngestMapping"

function canManage(role: string | null) {
  return role === "manager" || role === "admin" || role === "super_admin"
}

// Status → badge tone, across the cold palette (teal = done, periwinkle = in
// review, destructive = failed, muted = in-flight). Logic/semantics unchanged.
function statusTone(status: string): string {
  if (status === "loaded") return "bg-signal text-signal-foreground"
  if (status === "awaiting_review") return "bg-cold/15 text-cold ring-1 ring-cold/30"
  if (status === "rejected" || status === "failed")
    return "bg-destructive text-destructive-foreground"
  return "bg-secondary text-muted-foreground ring-1 ring-border" // in-flight
}

export function Ingest() {
  const { role } = useAuth()
  const { data: entities } = useEntities()
  const batches = useBatches()
  const upload = useUploadBatch()
  const approve = useApproveBatch()

  const [entityId, setEntityId] = useState("")
  const [period, setPeriod] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [mapping, setMapping] = useState<Record<string, string[]> | null>(null)

  const eff = useEntityRuleset(entityId || undefined)
  const saveRules = useSaveRuleset(entityId || undefined)

  const names = new Map((entities ?? []).map((e) => [e.id, e.name]))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !entityId || !period) return
    // Persist the column mapping onto the entity's ruleset so the worker reads
    // the right columns; abort the upload if that publish fails.
    if (mapping && eff.data) {
      try {
        await saveRules.mutateAsync({
          ...eff.data.rules,
          header_aliases: { ...eff.data.rules.header_aliases, ...mapping },
        })
      } catch { return }
    }
    upload.mutate({ entityId, period: `${period}-01`, file })
  }

  return (
    <div className="relative">
      <motion.header
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }}
        className="pb-10"
      >
        <h1 className="text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">Ingest</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Upload a CSV/XLSX. The worker validates, transforms and z-score-checks
          it; anomalies wait for a manager's approval before loading.
        </p>
      </motion.header>

      {/* Upload — only managers/admins may submit (submit_batch enforces it too). */}
      {!canManage(role) ? (
        <div className="rounded-2xl bg-card px-6 py-6 font-mono text-xs leading-relaxed text-muted-foreground shadow-soft ring-1 ring-border">
          Your role is read-only — uploading and approving batches is for managers
          and admins. The server enforces this regardless of the UI.
        </div>
      ) : (
      <form onSubmit={submit} className="grid gap-4 rounded-[1.5rem] bg-card p-6 shadow-soft ring-1 ring-border md:grid-cols-4 md:items-end">
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest">Entity</Label>
          <SimpleSelect
            size="default"
            className="w-full"
            aria-label="Entity"
            placeholder="select…"
            value={entityId}
            onValueChange={setEntityId}
            options={(entities ?? []).map((e) => ({ value: e.id, label: e.name }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest">Period</Label>
          <MonthPicker value={period} onChange={setPeriod} />
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest">File (CSV / XLSX)</Label>
          <FilePicker file={file} accept=".csv,.xlsx,text/csv" onPick={setFile} />
        </div>
        <Button type="submit" className="font-mono" disabled={upload.isPending || saveRules.isPending}>
          {upload.isPending || saveRules.isPending ? "Uploading…" : "Upload"}
        </Button>

        {/* Column mapping (CSV) — folds open once a file is chosen. */}
        <IngestMapping file={file} rules={eff.data?.rules} onChange={setMapping} />

        {saveRules.isError && (
          <p role="alert" className="font-mono text-xs text-destructive md:col-span-4">
            Could not save column mapping: {(saveRules.error as Error).message}
          </p>
        )}
        {upload.error && (
          <p role="alert" className="font-mono text-xs text-destructive md:col-span-4">
            {upload.error.message}
          </p>
        )}
        {upload.data && (
          <p className="font-mono text-xs text-accent md:col-span-4">
            {upload.data.status === "duplicate"
              ? "Already imported (duplicate file hash)."
              : `Batch submitted — watch it move through the statuses below.`}
          </p>
        )}
      </form>
      )}

      {/* Approval rules — what passes the import for this entity. */}
      {canManage(role) && entityId && (
        <IngestRules entityId={entityId} entityName={names.get(entityId)} />
      )}

      {/* Batches */}
      <section className="mt-12">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Batches <span className="text-accent">· live</span>
        </h2>
        {batches.isLoading ? (
          <LoadingNote label="loading batches…" />
        ) : batches.error ? (
          <ErrorNote message={batches.error.message} />
        ) : (batches.data?.length ?? 0) === 0 ? (
          <EmptyNote
            title="No batches visible"
            hint={
              canManage(role)
                ? "Upload a file above to start the pipeline."
                : "Your role doesn't manage ingest batches (RLS hides them)."
            }
          />
        ) : (
          <div className="overflow-hidden rounded-[1.5rem] bg-card shadow-soft ring-1 ring-border">
            <Table className="min-w-[640px]">
              <TableHeader className="bg-secondary/50">
                <TableRow>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">File</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">Entity</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">Period</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">Stats</TableHead>
                  <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.data!.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="max-w-40 truncate font-mono text-xs">{b.file_name}</TableCell>
                    <TableCell className="font-mono text-xs">{names.get(b.entity_id) ?? b.entity_id.slice(0, 8)}</TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">{b.period.slice(0, 7)}</TableCell>
                    <TableCell>
                      <Badge className={cn("rounded-full font-mono text-[10px] uppercase tracking-wider", statusTone(b.status))}>
                        {b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {summarizeStats(b.stats)}
                    </TableCell>
                    <TableCell className="text-right">
                      {b.status === "awaiting_review" && canManage(role) && (
                        <Button
                          size="xs"
                          className="font-mono text-[10px]"
                          disabled={approve.isPending}
                          onClick={() => approve.mutate(b.id)}
                        >
                          {approve.isPending ? "…" : "Approve"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {approve.error && (
          <p role="alert" className="mt-3 font-mono text-xs text-destructive">
            Approve failed: {approve.error.message}
          </p>
        )}
      </section>
    </div>
  )
}

function summarizeStats(stats: Record<string, unknown>): string {
  if (!stats || typeof stats !== "object") return "—"
  const parts: string[] = []
  if (typeof stats.rows_total === "number") parts.push(`${stats.rows_total} rows`)
  if (typeof stats.flagged_accounts === "number" && stats.flagged_accounts > 0)
    parts.push(`${stats.flagged_accounts} flagged`)
  if (typeof stats.rows_loaded === "number") parts.push(`${stats.rows_loaded} loaded`)
  return parts.length ? parts.join(" · ") : "—"
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** A custom YYYY-MM picker (two styled selects) — replaces the native month input.
 *  Emits "YYYY-MM"; the form appends "-01" before submitting. */
function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const thisYear = new Date().getFullYear()
  const years = [thisYear - 2, thisYear - 1, thisYear, thisYear + 1]
  const [y, m] = value ? value.split("-") : ["", ""]
  return (
    <div className="grid grid-cols-2 gap-2">
      <SimpleSelect
        size="default"
        className="w-full"
        aria-label="Year"
        placeholder="Year"
        value={y}
        onValueChange={(ny) => onChange(`${ny}-${m || "01"}`)}
        options={years.map((yr) => ({ value: String(yr), label: String(yr) }))}
      />
      <SimpleSelect
        size="default"
        className="w-full"
        aria-label="Month"
        placeholder="Month"
        value={m}
        onValueChange={(nm) => onChange(`${y || thisYear}-${nm}`)}
        options={MONTH_LABELS.map((label, i) => ({ value: String(i + 1).padStart(2, "0"), label }))}
      />
    </div>
  )
}

/** A custom file control — a styled trigger + filename, hiding the native input. */
function FilePicker({ file, accept, onPick }: { file: File | null; accept: string; onPick: (f: File | null) => void }) {
  const id = useId()
  return (
    <div>
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <label
        htmlFor={id}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs outline-none transition hover:border-accent/60 focus-within:ring-2 focus-within:ring-accent/50"
      >
        <UploadCloud className="size-4 shrink-0 opacity-60" />
        <span className={cn("truncate", file ? "text-foreground" : "text-muted-foreground")}>
          {file ? file.name : "Choose file…"}
        </span>
      </label>
    </div>
  )
}
