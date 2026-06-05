/**
 * X-ray event model — the contract between instrumentation (collector,
 * instrumented fetch) and the panel UI.
 *
 * `meta` is deliberately open-ended: Phase 4 adds RLS policy names, SQL,
 * EXPLAIN output and security-layer info by enriching `meta`, without
 * touching this contract or any call site.
 */
export type XRayEventKind = "rest" | "rpc" | "auth" | "storage" | "functions"

export interface XRayEvent {
  id: string
  kind: XRayEventKind
  /** Human target: table name, rpc name, auth action… */
  target: string
  method: string
  startedAt: number
  durationMs: number
  /** HTTP status, or -1 for network failure */
  status: number
  meta?: Record<string, unknown>
}
