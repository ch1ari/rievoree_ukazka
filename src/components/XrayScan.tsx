import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react"
import { animate } from "motion/react"
import { ScanLine } from "lucide-react"
import { XrayContext } from "@/components/XrayContext"

/**
 * X-RAY SCAN — the whole landing transforms IN PLACE into a real code editor of
 * its own source. Tapping the toggle sweeps a scan line down the entire viewport;
 * a full-bleed VS Code editor is revealed top-down behind it. Tap again and it
 * retracts. It is a transformation of the same surface, not navigation away.
 *
 * Mechanics / performance:
 *   - one CSS var `--scan` (0→1) animated via motion's animate() straight on the
 *     DOM node — NO React re-render per frame.
 *   - the editor is a fixed inset-0 layer; clip-path inset() driven by --scan
 *     reveals it top-down (GPU-composited). When --scan is 0 the layer is fully
 *     clipped, so the landing underneath stays interactive.
 *   - prefers-reduced-motion → instant switch, no sweep, no scan line.
 *
 * Scope: this heavy full-page effect is the landing showcase only. Inner pages
 * keep the lighter, functional X-ray panel.
 */
const XrayEditor = lazy(() => import("@/components/XrayEditor"))

const REDUCE = "(prefers-reduced-motion: reduce)"

export function XrayScan({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false)
  const [mounted, setMounted] = useState(false) // keep editor in DOM once opened
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const reduce = window.matchMedia(REDUCE).matches

    el.dataset.scan = reduce ? "idle" : "run" // scan line visible during the sweep
    const controls = animate(
      el,
      { "--scan": on ? 1 : 0 },
      reduce ? { duration: 0 } : { duration: 0.95, ease: [0.45, 0, 0.2, 1] },
    )
    controls.finished.then(() => { el.dataset.scan = "idle" }).catch(() => {})

    // Lock body scroll while the editor owns the viewport.
    document.body.style.overflow = on ? "hidden" : ""

    return () => { controls.stop() }
  }, [on])

  useEffect(() => () => { document.body.style.overflow = "" }, [])

  function toggle() {
    setOn((v) => {
      const next = !v
      if (next) setMounted(true)
      return next
    })
  }

  return (
    <XrayContext.Provider value={{ on, toggle }}>
    <div ref={root} className="xray-scan relative" style={{ ["--scan" as string]: 0 }}>
      {/* The landing — always in normal flow; the editor reveals over it. */}
      {children}

      {/* Full-bleed editor — revealed top-down by the scan, clipped away at rest. */}
      {mounted && (
        <div className="xray-editor-clip fixed inset-0 z-50 overflow-hidden" aria-hidden={!on}>
          <Suspense
            fallback={
              <div className="grid h-full w-full place-items-center bg-[#1e1e1e] font-mono text-xs text-white/40">
                loading source…
              </div>
            }
          >
            <XrayEditor />
          </Suspense>
        </div>
      )}

      {/* Scan line riding the reveal edge. */}
      <div aria-hidden className="xray-scanline" />

      {/* Toggle — tap/click, mobile + desktop. */}
      <button
        onClick={toggle}
        aria-pressed={on}
        className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-foreground px-5 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-background shadow-soft transition hover:scale-[1.04] md:bottom-7 md:right-7"
      >
        <ScanLine className="size-4" strokeWidth={2.25} />
        {on ? "Exit x-ray" : "X-ray this page"}
      </button>
    </div>
    </XrayContext.Provider>
  )
}
