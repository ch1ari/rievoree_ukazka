import { xrayCollector } from "./collector"
import type { XRayEventKind } from "./types"

/**
 * Timing seam for the Supabase client.
 *
 * supabase-js accepts a custom `fetch` — instrumenting here (instead of
 * proxying the query-builder) catches EVERY call the client makes: REST,
 * RPC, auth, storage and edge functions, with zero per-call-site code.
 * Phase 4 enriches the recorded meta (RLS, SQL, EXPLAIN) server-side;
 * this wrapper only ever measures and classifies.
 */
export function createInstrumentedFetch(): typeof fetch {
  return async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    )
    const startedAt = performance.now()
    try {
      const response = await fetch(input, init)
      record(url, init?.method ?? "GET", startedAt, response.status)
      return response
    } catch (error) {
      record(url, init?.method ?? "GET", startedAt, -1)
      throw error
    }
  }
}

function record(url: URL, method: string, startedAt: number, status: number) {
  const { kind, target } = classify(url)
  xrayCollector.record({
    kind,
    target,
    method,
    startedAt,
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    status,
    meta: { path: url.pathname },
  })
}

/** Map a Supabase API path onto a human-readable target. */
function classify(url: URL): { kind: XRayEventKind; target: string } {
  const path = url.pathname
  const rpc = path.match(/\/rest\/v1\/rpc\/([^/?]+)/)
  if (rpc) return { kind: "rpc", target: rpc[1] }
  const rest = path.match(/\/rest\/v1\/([^/?]+)/)
  if (rest) return { kind: "rest", target: rest[1] }
  if (path.includes("/auth/v1/")) {
    return { kind: "auth", target: path.split("/auth/v1/")[1] ?? "auth" }
  }
  if (path.includes("/storage/v1/")) return { kind: "storage", target: "storage" }
  if (path.includes("/functions/v1/")) {
    return { kind: "functions", target: path.split("/functions/v1/")[1] ?? "fn" }
  }
  return { kind: "rest", target: path }
}
