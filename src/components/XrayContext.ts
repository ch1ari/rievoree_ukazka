import { createContext, useContext } from "react"

/**
 * Shares the full-page X-ray toggle so any element inside <XrayScan> (e.g. the
 * hero's "X-ray this page" button) can trigger the same reveal that the floating
 * toggle drives. XrayScan is the provider/owner of the `on` state.
 */
export interface XrayState {
  on: boolean
  toggle: () => void
}

export const XrayContext = createContext<XrayState>({ on: false, toggle: () => {} })

export function useXray() {
  return useContext(XrayContext)
}
