import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useXRayEvents } from "@/lib/xray/useXRayEvents"
import { xrayCollector } from "@/lib/xray/collector"
import type { XRayEvent, XRayEventKind } from "@/lib/xray/types"

/**
 * CALLS — the live fetch-layer stream. Every Supabase request on the current
 * page, classified and timed at the seam (instrumentedFetch), newest first.
 *
 * Refinements over the Phase-1c list: a latency sparkline + summary, a kind
 * filter, and expandable rows that reveal per-call detail (the open-ended
 * `meta` the seam records — path today, RLS/SQL enrichment later).
 */
const KINDS: readonly XRayEventKind[] = [
  "rest",
  "rpc",
  "auth",
  "storage",
  "functions",
]

function ok(status: number) {
  return status >= 200 && status < 300
}

export function CallsTab() {
  const events = useXRayEvents()
  const [filter, setFilter] = useState<XRayEventKind | "all">("all")
  const [expanded, setExpanded] = useState<string | null>(null)

  const shown = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.kind === filter)),
    [events, filter],
  )

  if (events.length === 0) {
    return (
      <p className="px-4 py-3 font-mono text-xs text-muted-foreground">
        No backend calls yet. Navigate or load data and watch this stream.
      </p>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Sparkline events={events} />

      {/* Kind filter — active chip uses the one accent, rest are hairline. */}
      <div className="flex flex-wrap gap-2 border-b border-border px-4 py-2">
        <FilterChip
          label={`all ${events.length}`}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {KINDS.map((k) => {
          const n = events.filter((e) => e.kind === k).length
          if (n === 0) return null
          return (
            <FilterChip
              key={k}
              label={`${k} ${n}`}
              active={filter === k}
              onClick={() => setFilter(k)}
            />
          )
        })}
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-2 font-mono text-xs">
        {shown
          .slice()
          .reverse()
          .map((e) => (
            <CallRow
              key={e.id}
              event={e}
              open={expanded === e.id}
              onToggle={() =>
                setExpanded((cur) => (cur === e.id ? null : e.id))
              }
            />
          ))}
      </div>

      <div className="border-t border-border p-4">
        <Button
          variant="outline"
          size="sm"
          className="font-mono text-xs"
          onClick={() => {
            xrayCollector.clear()
            setExpanded(null)
          }}
        >
          Clear
        </Button>
      </div>
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  )
}

function CallRow({
  event: e,
  open,
  onToggle,
}: {
  event: XRayEvent
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-b border-border">
      <button
        onClick={onToggle}
        className="flex w-full items-baseline justify-between gap-3 py-1.5 text-left"
        aria-expanded={open}
      >
        <span className="truncate">
          <span aria-hidden className="text-muted-foreground">
            {open ? "▾ " : "▸ "}
          </span>
          <span className="text-accent">{e.kind}</span>{" "}
          <span className="text-muted-foreground">{e.method}</span> {e.target}
        </span>
        <span className="shrink-0 tabular-nums">
          <span className={ok(e.status) ? "text-muted-foreground" : "text-destructive"}>
            {e.status === -1 ? "ERR" : e.status}
          </span>{" "}
          {e.durationMs}ms
        </span>
      </button>

      {open && (
        <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 border-t border-border bg-secondary/40 px-2 py-2 text-[11px] text-muted-foreground">
          <Detail term="kind" value={e.kind} />
          <Detail term="method" value={e.method} />
          <Detail term="status" value={e.status === -1 ? "network error" : String(e.status)} />
          <Detail term="duration" value={`${e.durationMs} ms`} />
          <Detail term="path" value={String(e.meta?.path ?? "—")} />
        </dl>
      )}
    </div>
  )
}

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt className="uppercase tracking-wider">{term}</dt>
      <dd className="break-all text-foreground">{value}</dd>
    </>
  )
}

/** Latency sparkline over recent calls — bars scaled to the slowest in view. */
function Sparkline({ events }: { events: XRayEvent[] }) {
  const recent = events.slice(-40)
  const max = Math.max(1, ...recent.map((e) => e.durationMs))
  const slowest = Math.max(0, ...recent.map((e) => e.durationMs))

  return (
    <div className="flex items-end justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex h-8 flex-1 items-end gap-px" aria-hidden>
        {recent.map((e) => (
          <span
            key={e.id}
            className={cn(
              "min-w-px flex-1",
              ok(e.status) ? "bg-accent/70" : "bg-destructive/70",
            )}
            style={{ height: `${Math.max(4, (e.durationMs / max) * 100)}%` }}
            title={`${e.target} · ${e.durationMs}ms`}
          />
        ))}
      </div>
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
        peak {slowest}ms
      </span>
    </div>
  )
}
