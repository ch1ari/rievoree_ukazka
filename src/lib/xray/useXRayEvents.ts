import { useSyncExternalStore } from "react"
import { xrayCollector } from "./collector"
import type { XRayEvent } from "./types"

/** Live view of collected X-ray events (newest last). */
export function useXRayEvents(): XRayEvent[] {
  return useSyncExternalStore(xrayCollector.subscribe, xrayCollector.getSnapshot)
}
