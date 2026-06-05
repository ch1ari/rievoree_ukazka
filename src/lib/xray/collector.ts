import type { XRayEvent } from "./types"

/**
 * In-memory ring buffer + subscription — the single place every
 * instrumented call reports to and the panel reads from.
 *
 * Deliberately framework-free: components consume it through
 * `useSyncExternalStore` (see useXRayEvents), the instrumented fetch
 * pushes into it from plain TS.
 */
const MAX_EVENTS = 200

let events: XRayEvent[] = []
const listeners = new Set<() => void>()
let counter = 0

export const xrayCollector = {
  record(event: Omit<XRayEvent, "id">): void {
    counter += 1
    // New array reference on every push — required by useSyncExternalStore.
    events = [...events.slice(-(MAX_EVENTS - 1)), { ...event, id: `xr-${counter}` }]
    listeners.forEach((notify) => notify())
  },

  clear(): void {
    events = []
    listeners.forEach((notify) => notify())
  },

  getSnapshot(): XRayEvent[] {
    return events
  },

  subscribe(notify: () => void): () => void {
    listeners.add(notify)
    return () => listeners.delete(notify)
  },
}
