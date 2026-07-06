import { useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import {
  Cable, HardDrive, Webhook, Plus, RefreshCw, Play, Pause, Trash2,
  Pencil, Check, X, Copy, KeyRound, Link2, AlertTriangle, Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { SimpleSelect } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"
import { ConnectorPipeline } from "@/components/ConnectorPipeline"
import { useAuth } from "@/lib/auth/useAuth"
import { useEntities } from "@/lib/data/useEntities"
import {
  useConnectors, useCreateConnector, useRenameConnector, useDeleteConnector,
  useSetConnectorStatus, useRotateSecret, useSyncConnector, useSimulateSync, startDriveOAuth,
  webhookUrl, type Connector, type ConnectorKind,
} from "@/lib/data/useConnectors"

function canManage(role: string | null) {
  return role === "manager" || role === "admin" || role === "super_admin"
}

const STATUS_TONE: Record<string, string> = {
  active: "bg-signal text-signal-foreground",
  pending_auth: "bg-cold/15 text-cold ring-1 ring-cold/30",
  paused: "bg-secondary text-muted-foreground ring-1 ring-border",
  error: "bg-destructive text-destructive-foreground",
}
const STATUS_LABEL: Record<string, string> = {
  active: "Active", pending_auth: "Needs connect", paused: "Paused", error: "Error",
}

export function Connectors() {
  const { role } = useAuth()
  const { data: entities } = useEntities()
  const connectors = useConnectors()
  const names = useMemo(() => new Map((entities ?? []).map((e) => [e.id, e.name])), [entities])

  // OAuth round-trip result (?connected= / ?connect_error= from the callback).
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const ok = p.get("connected")
    const err = p.get("connect_error")
    if (ok) setBanner({ ok: true, msg: "Google Drive connected — Sync now to pull files." })
    else if (err) setBanner({ ok: false, msg: `Could not connect Google Drive: ${err.replace(/_/g, " ")}` })
    if (ok || err) window.history.replaceState({}, "", "/connectors")
  }, [])

  return (
    <div className="relative">
      <motion.header
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }}
        className="pb-10">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">Connectors</span>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">Auto-ingest</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Wire an external source straight into the ETL pipeline. Connect a Google
          Drive folder (OAuth, resumable page token) or expose an HMAC-signed
          webhook — new files flow through the same validate → z-score → review
          path as a manual upload.
        </p>
      </motion.header>

      {banner && (
        <div className={cn(
          "mb-6 flex items-center gap-2 rounded-2xl px-5 py-3 text-sm ring-1",
          banner.ok ? "bg-accent/[0.07] text-foreground ring-accent/20" : "bg-destructive/10 text-destructive ring-destructive/20",
        )}>
          {banner.ok ? <Check className="size-4" /> : <AlertTriangle className="size-4" />}
          {banner.msg}
          <button onClick={() => setBanner(null)} className="ml-auto opacity-60 hover:opacity-100"><X className="size-4" /></button>
        </div>
      )}

      {!canManage(role) ? (
        <div className="rounded-2xl bg-card px-6 py-6 font-mono text-xs leading-relaxed text-muted-foreground shadow-soft ring-1 ring-border">
          Your role is read-only — connectors are managed by managers and admins.
          The server enforces this regardless of the UI.
        </div>
      ) : (
        <CreateConnector entities={entities ?? []} />
      )}

      <section className="mt-12">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Your connectors <span className="text-accent">· live</span>
        </h2>
        {connectors.isLoading ? (
          <LoadingNote label="loading connectors…" />
        ) : connectors.error ? (
          <ErrorNote message={connectors.error.message} />
        ) : (connectors.data?.length ?? 0) === 0 ? (
          <EmptyNote title="No connectors yet"
            hint={canManage(role) ? "Add one above to start auto-ingesting." : "Your role doesn't manage connectors."} />
        ) : (
          <div className="grid gap-4">
            {connectors.data!.map((c) => (
              <ConnectorCard key={c.id} connector={c} entityName={names.get(c.entity_id)} />
            ))}
          </div>
        )}
      </section>

      <HowItWorks />
    </div>
  )
}

/** Explains — for visitors — why Google Drive runs in demo mode, and how the
 *  whole connector machinery is actually built. Reassures that it's real code. */
function HowItWorks() {
  return (
    <section className="mt-16 grid gap-4 lg:grid-cols-2">
      <div className="rounded-[1.5rem] border border-accent/20 bg-accent/[0.05] p-6 md:p-7">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-accent" />
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Why Google Drive is in demo mode</h3>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The Google Drive connector is <span className="text-foreground">fully implemented</span> — real OAuth2
          (offline refresh token), the Drive <span className="text-foreground">Changes API</span> with a resumable
          page token, and an idempotent file-claim ledger. You can connect a real Drive folder above.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          It isn't published for the public, though, on purpose. Drive's <code className="rounded bg-secondary px-1 text-foreground">drive.readonly</code> is
          a Google <span className="text-foreground">“restricted” scope</span>: to remove the “unverified app”
          warning, Google requires app verification — a verified domain, a public privacy policy, and a
          <span className="text-foreground"> paid annual security assessment (~$540+)</span> that takes weeks.
          For a portfolio demo that's not worth it.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          So instead, <span className="text-foreground">“Simulate sync (demo)”</span> runs a synthetic file through
          the <span className="text-foreground">exact same pipeline</span> — no Google sign-in, no scary screen,
          fake data only. Same machinery, visible end-to-end.
        </p>
      </div>

      <div className="rounded-[1.5rem] bg-card p-6 shadow-soft ring-1 ring-border md:p-7">
        <div className="flex items-center gap-2">
          <Cable className="size-4 text-accent" />
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">How this is built</h3>
        </div>
        <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
          {[
            ["Edge functions (Deno)", "OAuth start/callback, Drive sync, and a public HMAC webhook receiver."],
            ["HMAC webhook", "constant-time signature verify — anyone can POST a signed CSV and watch it flow in."],
            ["SQL pipeline", "staging → transform (rules + account resolution) → z-score anomaly scan → awaiting_review."],
            ["Security", "row-level security per entity, secret columns hidden from the API, SECURITY DEFINER RPCs."],
            ["Resumable + idempotent", "Drive page-token cursor survives restarts; a file is ingested at most once."],
          ].map(([t, d]) => (
            <li key={t} className="flex gap-2.5">
              <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <span><span className="text-foreground">{t}</span> — {d}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 font-mono text-[11px] text-muted-foreground">
          Click <span className="text-accent">Simulate sync (demo)</span> on a Drive connector to watch the chain run live.
        </p>
      </div>
    </section>
  )
}

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50"

function CreateConnector({ entities }: { entities: { id: string; name: string }[] }) {
  const create = useCreateConnector()
  const [entityId, setEntityId] = useState("")
  const [kind, setKind] = useState<ConnectorKind>("gdrive")
  const [name, setName] = useState("")
  const [folder, setFolder] = useState("")
  const [created, setCreated] = useState<{ id: string; kind: ConnectorKind; secret: string | null } | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!entityId || !name.trim()) return
    const config = kind === "gdrive" && folder.trim() ? { folder_id: folder.trim() } : {}
    create.mutate(
      { entityId, kind, name: name.trim(), config },
      {
        onSuccess: (r) => {
          setCreated({ id: r.id, kind: r.kind, secret: r.webhook_secret })
          setName(""); setFolder("")
        },
      },
    )
  }

  return (
    <section className="rounded-[1.5rem] bg-card p-6 shadow-soft ring-1 ring-border md:p-7">
      <div className="flex items-center gap-2">
        <Cable className="size-4 text-accent" />
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Add a connector</h2>
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-4 md:items-end">
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest">Entity</Label>
          <SimpleSelect size="default" className="w-full" aria-label="Entity" placeholder="select…"
            value={entityId} onValueChange={setEntityId}
            options={entities.map((e) => ({ value: e.id, label: e.name }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest">Type</Label>
          <SimpleSelect size="default" className="w-full" aria-label="Connector type"
            value={kind} onValueChange={(v) => setKind(v as ConnectorKind)}
            options={[{ value: "gdrive", label: "Google Drive" }, { value: "webhook", label: "HMAC webhook" }]} />
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-[10px] uppercase tracking-widest">Name</Label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly exports" className={cn(inputClass, "w-full")} />
        </div>
        <Button type="submit" className="font-mono" disabled={create.isPending || !entityId || !name.trim()}>
          <Plus className="size-4" /> {create.isPending ? "Adding…" : "Add"}
        </Button>

        {kind === "gdrive" && (
          <div className="space-y-1.5 md:col-span-4">
            <Label className="font-mono text-[10px] uppercase tracking-widest">Drive folder ID (optional)</Label>
            <input value={folder} onChange={(e) => setFolder(e.target.value)}
              placeholder="paste a folder ID to watch only that folder; blank = whole Drive"
              className={cn(inputClass, "w-full")} />
          </div>
        )}
      </form>

      {create.isError && (
        <p role="alert" className="mt-3 font-mono text-xs text-destructive">{(create.error as Error).message}</p>
      )}

      {/* One-time secret reveal for a freshly created webhook connector. */}
      {created?.kind === "webhook" && created.secret && (
        <SecretReveal connectorId={created.id} secret={created.secret} onDone={() => setCreated(null)} />
      )}
      {created?.kind === "gdrive" && (
        <p className="mt-4 rounded-xl bg-accent/[0.07] px-4 py-3 font-mono text-xs text-foreground ring-1 ring-accent/20">
          Drive connector created — find it below and click <span className="text-accent">Connect Google Drive</span> to authorize.
        </p>
      )}
    </section>
  )
}

/** Shows a webhook secret exactly once (the server never returns it again). */
function SecretReveal({ connectorId, secret, onDone }: { connectorId: string; secret: string; onDone: () => void }) {
  const url = webhookUrl(connectorId)
  return (
    <div className="mt-4 rounded-xl border border-accent/30 bg-accent/[0.06] p-4">
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-accent">
        <KeyRound className="size-3.5" /> Signing secret — shown only once
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Store this now. Sign each request body with HMAC-SHA256 and send it as the <code className="rounded bg-secondary px-1">x-signature</code> header.
      </p>
      <CopyRow label="Secret" value={secret} mono />
      <CopyRow label="Endpoint" value={url} mono />
      <details className="mt-3">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Example (curl)</summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground/80">{curlExample(url, secret)}</pre>
      </details>
      <Button size="xs" variant="ghost" className="mt-3 font-mono text-[10px] uppercase tracking-wider" onClick={onDone}>Done</Button>
    </div>
  )
}

function curlExample(url: string, secret: string): string {
  return [
    `BODY='account_code,txn_date,debit,credit,currency`,
    `4000,2026-06-20,0,13000,EUR'`,
    `SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "${secret}" | awk '{print $2}')`,
    `curl -X POST "${url}" \\`,
    `  -H "content-type: text/csv" \\`,
    `  -H "x-signature: sha256=$SIG" \\`,
    `  --data-binary "$BODY"`,
  ].join("\n")
}

function ConnectorCard({ connector: c, entityName }: { connector: Connector; entityName?: string }) {
  const rename = useRenameConnector()
  const remove = useDeleteConnector()
  const setStatus = useSetConnectorStatus()
  const rotate = useRotateSecret()
  const sync = useSyncConnector()
  const simulate = useSimulateSync()

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(c.name)
  const [confirmDel, setConfirmDel] = useState(false)
  const [rotated, setRotated] = useState<string | null>(null)
  const [oauthBusy, setOauthBusy] = useState(false)
  const [oauthErr, setOauthErr] = useState<string | null>(null)
  const [showWebhook, setShowWebhook] = useState(false)
  const [playKey, setPlayKey] = useState(0)

  const Icon = c.kind === "gdrive" ? HardDrive : Webhook
  const isGdrive = c.kind === "gdrive"
  const needsConnect = isGdrive && (c.status === "pending_auth" || c.status === "error")

  async function connect() {
    setOauthBusy(true); setOauthErr(null)
    const { error } = await startDriveOAuth(c.id)
    if (error) { setOauthBusy(false); setOauthErr(error) }
    // On success the browser navigates away to Google.
  }

  return (
    <div className="rounded-[1.25rem] bg-card p-5 shadow-soft ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-foreground ring-1 ring-border">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} className={cn(inputClass, "flex-1")} />
              <button onClick={() => { if (editName.trim()) rename.mutate({ id: c.id, name: editName.trim() }); setEditing(false) }}
                aria-label="Save" className="rounded-md p-1.5 text-accent hover:bg-accent/10"><Check className="size-4" /></button>
              <button onClick={() => setEditing(false)} aria-label="Cancel" className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/[0.05]"><X className="size-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold">{c.name}</span>
              <button onClick={() => { setEditName(c.name); setEditing(true) }} aria-label="Rename"
                className="rounded-md p-1 text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground"><Pencil className="size-3.5" /></button>
            </div>
          )}
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {c.kind === "gdrive" ? "Google Drive" : "HMAC webhook"} · {entityName ?? c.entity_id.slice(0, 8)}
            {c.last_sync_at && <> · last sync {new Date(c.last_sync_at).toLocaleString()}</>}
          </p>
        </div>
        <Badge className={cn("rounded-full font-mono text-[10px] uppercase tracking-wider", STATUS_TONE[c.status])}>
          {STATUS_LABEL[c.status] ?? c.status}
        </Badge>
      </div>

      {c.last_error && (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive">{c.last_error}</p>
      )}
      {oauthErr && (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive">{oauthErr}</p>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {needsConnect && (
          <Button size="xs" className="font-mono text-[10px]" disabled={oauthBusy} onClick={connect}>
            <Link2 className="size-3.5" /> {oauthBusy ? "Redirecting…" : "Connect Google Drive"}
          </Button>
        )}
        {isGdrive && c.status === "active" && (
          <Button size="xs" variant="secondary" className="font-mono text-[10px]" disabled={sync.isPending} onClick={() => sync.mutate(c.id)}>
            <RefreshCw className={cn("size-3.5", sync.isPending && "animate-spin")} /> {sync.isPending ? "Syncing…" : "Sync now"}
          </Button>
        )}
        {isGdrive && (
          <Button size="xs" variant="secondary" className="font-mono text-[10px]" disabled={simulate.isPending}
            onClick={() => { setPlayKey((k) => k + 1); simulate.mutate(c.id) }}
            title="Runs a synthetic file through the real pipeline — no Google sign-in">
            <Sparkles className="size-3.5" /> {simulate.isPending ? "Simulating…" : "Simulate sync (demo)"}
          </Button>
        )}
        {!isGdrive && (
          <Button size="xs" variant="secondary" className="font-mono text-[10px]" onClick={() => setShowWebhook((v) => !v)}>
            <Link2 className="size-3.5" /> {showWebhook ? "Hide endpoint" : "Show endpoint"}
          </Button>
        )}
        {(c.status === "active" || c.status === "paused") && (
          <Button size="xs" variant="ghost" className="font-mono text-[10px]"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: c.id, status: c.status === "active" ? "paused" : "active" })}>
            {c.status === "active" ? <><Pause className="size-3.5" /> Pause</> : <><Play className="size-3.5" /> Resume</>}
          </Button>
        )}
        {!isGdrive && (
          <Button size="xs" variant="ghost" className="font-mono text-[10px]" disabled={rotate.isPending}
            onClick={() => rotate.mutate(c.id, { onSuccess: (s) => setRotated(s) })}>
            <KeyRound className="size-3.5" /> Rotate secret
          </Button>
        )}
        {confirmDel ? (
          <button onClick={() => { remove.mutate(c.id); setConfirmDel(false) }}
            className="ml-auto rounded-md bg-destructive/15 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-destructive">
            Confirm delete
          </button>
        ) : (
          <button onClick={() => setConfirmDel(true)} aria-label="Delete connector"
            className="ml-auto rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
        )}
      </div>

      {sync.isError && <p className="mt-2 font-mono text-[11px] text-destructive">{(sync.error as Error).message}</p>}
      {sync.data && <p className="mt-2 font-mono text-[11px] text-accent">Sync ok — {sync.data.ingested.length} file(s) ingested, {sync.data.skipped} skipped.</p>}
      {simulate.isError && <p className="mt-2 font-mono text-[11px] text-destructive">{(simulate.error as Error).message}</p>}
      {simulate.data && <p className="mt-2 font-mono text-[11px] text-accent">Demo file <span className="text-foreground">{simulate.data.file}</span> pushed through the pipeline — see it on Ingest.</p>}

      {/* Live animated ETL chain — replays on each Simulate sync. */}
      {isGdrive && playKey > 0 && <ConnectorPipeline playKey={playKey} running={simulate.isPending} />}

      {showWebhook && !isGdrive && (
        <div className="mt-3 rounded-xl border border-border bg-background/40 p-4">
          <CopyRow label="Endpoint" value={webhookUrl(c.id)} mono />
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            POST a CSV body signed with HMAC-SHA256 (header <code className="rounded bg-secondary px-1">x-signature: sha256=…</code>).
            The signing secret is shown only when created or rotated.
          </p>
        </div>
      )}
      {rotated && (
        <div className="mt-3 rounded-xl border border-accent/30 bg-accent/[0.06] p-4">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-accent">
            <KeyRound className="size-3.5" /> New secret — shown only once
          </p>
          <CopyRow label="Secret" value={rotated} mono />
          <Button size="xs" variant="ghost" className="mt-2 font-mono text-[10px]" onClick={() => setRotated(null)}>Done</Button>
        </div>
      )}
    </div>
  )
}

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <code className={cn("min-w-0 flex-1 truncate rounded-md bg-background px-2 py-1.5 text-xs", mono && "font-mono")}>{value}</code>
      <button onClick={copy} aria-label={`Copy ${label}`} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground">
        {copied ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
}
