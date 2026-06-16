import { useEffect, useRef, type ReactNode } from "react"

/**
 * X-RAY REVEAL — the page has a colourful surface (system-B orbs); the cursor
 * acts as an x-ray lens that makes the surface transparent in a ~90px circle,
 * revealing a dark "machinery" layer of monospace lines beneath. Embodies the
 * promise: "see the machinery / no black boxes".
 *
 * Performance: the pointer updates two CSS custom properties (--mx/--my) via
 * requestAnimationFrame, written straight to the DOM node — NO React state, no
 * re-render per move. The reveal is a single CSS `mask` (GPU-composited);
 * surface orbs animate with transform/opacity only.
 *
 * Honesty: the machinery lines are ILLUSTRATIVE marketing — real project
 * operations, but a teaser, not the live X-ray panel (that lives inside the app).
 *
 * Accessibility / fallbacks:
 *   - touch / coarse pointer → no cursor, so the lens auto-drifts on a slow path.
 *   - prefers-reduced-motion → no motion; a calm static reveal near the top.
 */

// Illustrative — real operations from this project, shown as a teaser.
const MACHINERY = [
  "GET /rest/v1/report_account_monthly        200   41ms",
  "RLS  using ( entity_id = any(my_entity_ids()) )",
  "rpc  approve_batch( p_batch_id )            FOR UPDATE",
  "z-score  3.4σ > 3.0  →  row flagged, held back",
  "trigger  journal_entries → refresh_enqueued",
  "pg_cron  refresh_report_mv()  REFRESH CONCURRENTLY",
  "worker   claim … FOR UPDATE SKIP LOCKED",
  "pg_net   → notify-review              202 queued",
  "GET /rest/v1/entities      RLS → 4 rows  (admin)",
  "GET /rest/v1/entities      RLS → 1 row   (viewer)",
  "submit_batch  coalesce(is_admin(), false) → 42501",
  "mv_account_monthly   refreshed  ·  936 rows",
  "pipeline_events  approved → loaded → mv_refreshed",
  "storage  signed upload url  ·  sha-256 verified",
]

export function XrayReveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const coarse = window.matchMedia("(pointer: coarse)").matches

    const set = (xPct: number, yPx: number) => {
      el.style.setProperty("--mx", `${xPct}%`)
      el.style.setProperty("--my", `${yPx}px`)
    }

    if (reduce) {
      // Calm static reveal near the headline; no listeners, no animation.
      const r = el.getBoundingClientRect()
      set(32, Math.min(320, r.height * 0.32))
      el.dataset.lens = "static"
      return
    }

    let raf = 0
    if (coarse) {
      // Touch: no cursor → auto-drift the lens on a slow Lissajous path so the
      // effect still reads. Confined to the upper area (the hero).
      let t = 0
      const loop = () => {
        t += 0.006
        const r = el.getBoundingClientRect()
        const x = 50 + 26 * Math.sin(t)
        const y = r.height * 0.22 + 90 * Math.sin(t * 1.4)
        set(x, Math.max(60, y))
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
      return () => cancelAnimationFrame(raf)
    }

    // Pointer: rAF-throttled, written straight to the DOM (no React state).
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        set(((e.clientX - r.left) / r.width) * 100, e.clientY - r.top)
      })
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      window.removeEventListener("pointermove", onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      ref={ref}
      className={`xray-reveal relative isolate overflow-hidden ${className}`}
      style={{ ["--mx" as string]: "50%", ["--my" as string]: "260px" }}
    >
      {/* Layer 0 — machinery (revealed under the lens) */}
      <div aria-hidden className="absolute inset-0 -z-20 bg-[oklch(0.18_0.02_265)]">
        <div className="bg-blueprint absolute inset-0 opacity-30" />
        <div className="xray-machinery absolute inset-0 flex flex-col justify-around gap-1.5 overflow-hidden px-6 py-8 font-mono text-[11px] leading-relaxed text-emerald-300/80 sm:text-xs md:px-16">
          {Array.from({ length: 8 }).flatMap((_, block) =>
            MACHINERY.map((line, i) => (
              <div key={`${block}-${i}`} className="xray-line whitespace-nowrap" style={{ animationDelay: `${((block * MACHINERY.length + i) % 9) * 0.4}s` }}>
                <span className="text-amber-300/70">›</span> {line}
              </div>
            )),
          )}
        </div>
      </div>

      {/* Layer 1 — colourful surface orbs, masked transparent under the lens */}
      <div aria-hidden className="xray-surface absolute inset-0 -z-10 bg-background">
        <div className="orb absolute left-[6%] top-[8%] size-72 bg-accent/45" style={{ animationDelay: "0s" }} />
        <div className="orb absolute right-[4%] top-[24%] size-80 bg-signal/40" style={{ animationDelay: "-4s" }} />
        <div className="orb absolute left-[30%] top-[52%] size-72 bg-amber-300/45" style={{ animationDelay: "-8s" }} />
        <div className="orb absolute right-[14%] top-[68%] size-80 bg-accent/35" style={{ animationDelay: "-2s" }} />
        <div className="orb absolute left-[10%] top-[86%] size-72 bg-signal/35" style={{ animationDelay: "-6s" }} />
      </div>

      {/* Lens ring — follows the cursor */}
      <div aria-hidden className="xray-lens" />

      {/* Content sits above everything; always readable */}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
