import { cn } from "@/lib/utils"
import {
  usePipelineEvents,
  type PipelineEvent,
  type RealtimeStatus,
} from "@/lib/xray/usePipelineEvents"

/**
 * PIPELINE — live timeline of public.pipeline_events over Supabase Realtime.
 * Each row is a backstage event the async machinery emitted (trigger chain,
 * approve_batch, pg_cron, pg_net). RLS-scoped: shows whoever is signed in.
 */

// Stage → visual weight. "success" stages get the accent; intents/dispatches
// stay hairline-muted so the eye lands on what actually completed.
const ACCENT_STAGES = new Set([
  "approved",
  "loaded",
  "mv_refreshed",
  "review_notified",
])

function relativeTime(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export function PipelineTab() {
  const { events, status, authed, entityNames } = usePipelineEvents()

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          pipeline_events · realtime
        </span>
        <ConnectionDot status={status} />
      </div>

      {events.length === 0 ? (
        <EmptyState authed={authed} />
      ) : (
        <ol className="flex-1 overflow-y-auto px-4 py-3 font-mono text-xs">
          {events.map((e) => (
            <TimelineRow
              key={e.id}
              event={e}
              entityName={entityNames[e.entity_id]}
            />
          ))}
        </ol>
      )}
    </div>
  )
}

function ConnectionDot({ status }: { status: RealtimeStatus }) {
  const label =
    status === "subscribed" ? "live" : status === "error" ? "error" : "connecting"
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          status === "subscribed" && "animate-pulse bg-accent",
          status === "error" && "bg-destructive",
          status === "idle" && "bg-muted-foreground",
        )}
      />
      {label}
    </span>
  )
}

function TimelineRow({
  event: e,
  entityName,
}: {
  event: PipelineEvent
  entityName?: string
}) {
  const accent = ACCENT_STAGES.has(e.stage)
  return (
    <li className="relative flex gap-3 border-l border-border pb-3 pl-4 last:pb-0">
      {/* node on the rail */}
      <span
        aria-hidden
        className={cn(
          "absolute -left-[3px] top-1.5 size-1.5",
          accent ? "bg-accent" : "bg-muted-foreground",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className={cn("truncate", accent ? "text-accent" : "text-foreground")}>
            {e.stage}
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {relativeTime(e.created_at)}
          </span>
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
          <span className="truncate">
            {entityName ?? `entity ${shortId(e.entity_id)}`}
            {e.batch_id ? ` · batch ${shortId(e.batch_id)}` : ""}
            {summarizeDetail(e.detail)}
          </span>
          {e.duration_ms != null && (
            <span className="shrink-0 tabular-nums">{e.duration_ms}ms</span>
          )}
        </div>
      </div>
    </li>
  )
}

function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : "—"
}

/** A compact hint from the detail jsonb (e.g. flagged_accounts, periods). */
function summarizeDetail(detail: Record<string, unknown>): string {
  if (!detail || typeof detail !== "object") return ""
  if (typeof detail.flagged_accounts === "number") {
    return ` · ${detail.flagged_accounts} flagged`
  }
  if (Array.isArray(detail.periods)) {
    return ` · ${detail.periods.length} period(s)`
  }
  return ""
}

function EmptyState({ authed }: { authed: boolean }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-2 px-4 text-center font-mono text-xs text-muted-foreground">
      {authed ? (
        <p>
          No pipeline events for your entities yet. Approve a batch or load data,
          then watch events stream in live.
        </p>
      ) : (
        <p>
          Signed out — RLS hides pipeline_events from anon.
          <br />
          Open the <span className="text-accent">RLS</span> tab and run as
          Manager or Admin to see your entities' events stream in live.
        </p>
      )}
    </div>
  )
}
