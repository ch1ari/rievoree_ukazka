import { ScanLine } from "lucide-react"
import { sliceStatement, sliceFrom } from "@/lib/code-xray"
import { useXray } from "@/components/XrayContext"
import reportSrc from "../../supabase/migrations/20260610000002_report_account_monthly.sql?raw"
import rlsSrc from "../../supabase/migrations/20260605000001_identity_and_tenancy.sql?raw"
import dbSrc from "../../worker/src/db.ts?raw"

/**
 * THE RIP — an organic hole torn in the lime "paper" page, filling the freed
 * right-hand space of the hero. Outside the tear everything is transparent, so
 * the page's own lime IS the surface (no panel/box). Through the hole you see the
 * DARK DEPTH beneath the paper: a slice of our REAL source (literal repo files via
 * Vite `?raw`) — the same code the X-ray reveals — glowing in emerald, with a
 * scan-line sweeping down it. The torn lime edge peels up (3D) and casts a shadow
 * into the hole; an emerald glow rises from the depth.
 *
 * The whole hole is a BUTTON: clicking it toggles the full-page X-ray (the same
 * action as "X-ray this page"). A "click to x-ray" hint sits in the depth.
 *
 * Honesty invariant: every snippet is the literal repo file via `?raw` — the RLS
 * tenant policy, the tenant-filtered report view, and the worker's skip-locked
 * queue claim. prefers-reduced-motion → flap held open, scan off.
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
      {/* Matte-paper grain for the peeled lime flap — two static feTurbulence passes
          (fine darkening tooth + anisotropic lightening fibre). Pure SVG, no image. */}
      <svg className="rip-grain-def" width="0" height="0" aria-hidden="true" focusable="false">
        <filter id="rip-tooth" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.86" numOctaves="2" stitchTiles="stitch" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.62 0.62 0.62 0 0" />
        </filter>
        <filter id="rip-fiber" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.30 0.13" numOctaves="2" stitchTiles="stitch" seed="42" result="f" />
          <feColorMatrix in="f" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.5 0.5 0.5 0 0" />
        </filter>
      </svg>

      <div className="rip-scene">
        {/* THE DARK DEPTH, seen through the organic torn hole. */}
        <div className="rip-depth">
          {/* A slice of the real source — reads like the X-ray editor pane. */}
          <div className="rip-code" aria-hidden="true">
            {FRAGMENTS.map((f, i) => (
              <pre key={i} className={`m-0 whitespace-pre font-mono text-[10.5px] leading-relaxed ${f.tone}`}>
                {f.code}
              </pre>
            ))}
          </div>
          {/* Scan-line sweeping down the depth (echoes the X-ray scan). */}
          <div className="rip-scan" />
          {/* Emerald glow rising from the depth (light from below). */}
          <div className="rip-floor" />
          {/* The overhanging torn paper casts a hard shadow into the hole. */}
          <div className="rip-overhang" />
          {/* Hint that the hole is the X-ray trigger. */}
          <span className="rip-hint"><ScanLine className="size-3.5" strokeWidth={2.25} aria-hidden /> click to x-ray</span>
        </div>

        {/* The peeled torn lime edge — the paper lifted off the top of the hole,
            tilted toward the viewer (3D), its torn bottom edge lit, casting a soft
            shadow down into the depth. Same lime as the page. */}
        <div className="rip-flap">
          <div className="rip-grain rip-grain--tooth" />
          <div className="rip-grain rip-grain--fiber" />
        </div>
      </div>
    </button>
  )
}
// #endregion
