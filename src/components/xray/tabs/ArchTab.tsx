import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { useXRayEvents } from "@/lib/xray/useXRayEvents"
import { usePipelineEvents } from "@/lib/xray/usePipelineEvents"

/**
 * ARCH — where it physically runs, with "exercised this session" highlighting
 * derived ONLY from real signals:
 *   - CALLS kinds (rest/rpc/auth/storage/functions) → client-observable layers
 *   - PIPELINE stages (refresh_enqueued/mv_refreshed/review_notified/…) → the
 *     server-internal layers those events prove ran (triggers/pg_cron/pg_net)
 *
 * Layers the browser genuinely cannot observe (the Docker ETL worker) are NEVER
 * given a fake "active" highlight — they render muted with an honest note. If a
 * signal isn't there, the layer stays dim; nothing here pretends.
 */
type Activity = "active" | "idle" | "unobservable"

interface Layer {
  id: string
  title: string
  detail: string
  indent?: boolean
}

const LAYERS: Layer[] = [
  { id: "browser", title: "Browser — React + instrumented fetch", detail: "this app; the seam taps every call" },
  { id: "auth", title: "Auth — GoTrue (JWT)", detail: "sign-in / session; issues the JWT RLS reads" },
  { id: "edge", title: "Edge Functions — Deno", detail: "ingest-submit · notify-review" },
  { id: "api", title: "Data API — PostgREST", detail: "REST + RPC over the SQL schema" },
  { id: "rls", title: "Postgres — RLS policies", detail: "every row filtered by auth.uid()", indent: true },
  { id: "triggers", title: "Postgres — trigger chains", detail: "journal write → enqueue refresh", indent: true },
  { id: "pgcron", title: "Postgres — pg_cron", detail: "scheduled MV refresh + housekeeping", indent: true },
  { id: "pgnet", title: "Postgres — pg_net", detail: "DB → edge fn (notify-review)", indent: true },
  { id: "storage", title: "Storage — object store", detail: "uploaded CSV/XLSX" },
  { id: "worker", title: "Docker — ETL worker", detail: "consumes ingest_queue (server-side)" },
]

export function ArchTab() {
  const calls = useXRayEvents()
  const { events: pipeline } = usePipelineEvents()

  const activity = useMemo(() => {
    const kinds = new Set(calls.map((e) => e.kind))
    const stages = new Set(pipeline.map((e) => e.stage))
    const db = kinds.has("rest") || kinds.has("rpc")

    const map: Record<string, Activity> = {
      browser: "active", // we are here
      auth: kinds.has("auth") ? "active" : "idle",
      edge: kinds.has("functions") ? "active" : "idle",
      api: db ? "active" : "idle",
      rls: db ? "active" : "idle", // RLS runs on every Data API query
      triggers:
        stages.has("refresh_enqueued") || stages.has("loaded") || stages.has("approved")
          ? "active"
          : "idle",
      pgcron: stages.has("mv_refreshed") ? "active" : "idle",
      pgnet:
        stages.has("review_notified") || stages.has("review_notify_requested")
          ? "active"
          : "idle",
      storage: kinds.has("storage") ? "active" : "idle",
      // The worker has no client-observable signal — never fake it.
      worker: "unobservable",
    }
    return map
  }, [calls, pipeline])

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <p className="border-b border-border px-4 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
        Where it runs. Highlighted = exercised this session, derived from real{" "}
        <span className="text-foreground">CALLS</span> +{" "}
        <span className="text-foreground">PIPELINE</span> signals. Server-internal
        layers the browser can't observe are marked, never faked.
      </p>

      <div className="space-y-1.5 px-4 py-3">
        {LAYERS.map((l) => (
          <ArchRow key={l.id} layer={l} activity={activity[l.id]} />
        ))}
      </div>

      <Legend />
    </div>
  )
}

function ArchRow({ layer, activity }: { layer: Layer; activity: Activity }) {
  const active = activity === "active"
  const unobservable = activity === "unobservable"
  return (
    <div
      className={cn(
        "flex items-start gap-3 border px-3 py-2",
        layer.indent && "ml-5",
        active && "border-accent",
        !active && !unobservable && "border-border border-dashed opacity-60",
        unobservable && "border-border border-dashed opacity-40",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-1 size-1.5 shrink-0 rounded-full",
          active ? "animate-pulse bg-accent" : "bg-muted-foreground",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("font-mono text-xs", active ? "text-accent" : "text-foreground")}>
            {layer.title}
          </span>
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            {unobservable ? "server-side" : active ? "active" : "idle"}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-[10px] leading-snug text-muted-foreground">
          {layer.detail}
        </p>
      </div>
    </div>
  )
}

function Legend() {
  return (
    <p className="mt-auto border-t border-border px-4 py-3 font-mono text-[10px] leading-snug text-muted-foreground">
      <span className="text-accent">●</span> active this session ·{" "}
      <span className="opacity-60">▢ idle</span> · server-side = no
      client-observable signal (e.g. the ETL worker runs even when the browser
      sees nothing).
    </p>
  )
}
