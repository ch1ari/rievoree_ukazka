import { ScanLine } from "lucide-react"
import { sliceStatement, sliceFrom } from "@/lib/code-xray"
import { useXray } from "@/components/XrayContext"
import reportSrc from "../../supabase/migrations/20260610000002_report_account_monthly.sql?raw"
import rlsSrc from "../../supabase/migrations/20260605000001_identity_and_tenancy.sql?raw"
import dbSrc from "../../worker/src/db.ts?raw"

/**
 * THE RIP — the lime "paper" page torn open at its RIGHT EDGE, exposing the dark
 * machinery beneath. There is NO lime overlay: the dark depth is clipped to a hole
 * and the real page shows around it, so the surface is seamless. The torn edge is
 * organic, not a sawtooth: the depth's inner layer is clipped to a SMOOTH rounded
 * shape, and an feTurbulence + feDisplacementMap filter on the PARENT roughens that
 * already-clipped alpha edge into hand-torn paper fibre. The right side bleeds off
 * the page edge, so the tear is anchored — not a square floating in the middle.
 *
 * Through the hole: a slice of our REAL source (literal repo files via Vite `?raw`),
 * an emerald glow rising from the depth, and a scan-line sweeping down. The whole
 * hole is a BUTTON → toggles the full-page X-ray.
 *
 * Honesty invariant: every snippet is the literal repo file via `?raw` — the RLS
 * tenant policy, the tenant-filtered report view, and the worker's skip-locked
 * queue claim. prefers-reduced-motion → scan off (the edge is already static).
 */

// #region xray
const FRAGMENTS: { code: string; tone: string }[] = [
  // RLS — the row-level policy that seals every entity to its owner.
  { code: sliceStatement(rlsSrc, "create policy entities_select"), tone: "text-accent/85" },
  // The public door — the tenant-filtered SQL view (teal: "the data window").
  { code: sliceStatement(reportSrc, "create view public.report_account_monthly"), tone: "text-signal/80" },
  // The Deno worker — the atomic, crash-safe queue claim (FOR UPDATE SKIP LOCKED).
  { code: sliceFrom(dbSrc, "update public.ingest_queue q", 13), tone: "text-accent/80" },
]

export function PageTear() {
  const { toggle } = useXray()
  return (
    <button type="button" onClick={toggle} className="rip group"
      aria-label="X-ray this page — reveal the real source beneath the surface">

      <div className="rip-scene">
        {/* THE DARK DEPTH — a clean dark window cut into the lime page, recessed
            with inner shadows so it reads as a deep opening, not a flat rectangle. */}
        <div className="rip-depth">
          <div className="rip-depth-inner">
            {/* A slice of the real source — reads like the X-ray editor pane. */}
            <div className="rip-code" aria-hidden="true">
              {FRAGMENTS.map((f, i) => (
                <pre key={i} className={`m-0 whitespace-pre font-mono text-[10.5px] leading-relaxed ${f.tone}`}>
                  {f.code}
                </pre>
              ))}
            </div>
            {/* Emerald glow rising from the depth (light from below). */}
            <div className="rip-floor" />
            {/* The overhanging torn lip casts a hard shadow DOWN into the hole. */}
            <div className="rip-overhang" />
          </div>
        </div>

        {/* Scan-line sweeping down the hole (clipped to the hole, not displaced — so
            it never re-runs the filter per frame). */}
        <div className="rip-scan" aria-hidden="true" />

        {/* Hint that the hole is the X-ray trigger. */}
        <span className="rip-hint"><ScanLine className="size-3.5" strokeWidth={2.25} aria-hidden /> click to x-ray</span>
      </div>
    </button>
  )
}
// #endregion
