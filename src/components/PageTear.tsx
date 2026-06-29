import { ScanLine } from "lucide-react"
import { sliceStatement, sliceFrom } from "@/lib/code-xray"
import { useXray } from "@/components/XrayContext"
import reportSrc from "../../supabase/migrations/20260610000002_report_account_monthly.sql?raw"
import rlsSrc from "../../supabase/migrations/20260605000001_identity_and_tenancy.sql?raw"
import dbSrc from "../../worker/src/db.ts?raw"

/**
 * THE RIP — a real photographed LIME sheet of paper torn open, exposing the dark
 * machinery beneath. The sheet (`/torn-page.png`) carries genuine torn-paper depth:
 * curled flaps, fibre grain, cracks and self-shadow — recoloured to the brand lime.
 * Its transparent central opening reveals the dark code; a companion mask
 * (`/torn-page-mask.png`) clips that dark interior to exactly the opening, so the
 * code never leaks past the paper into the (dark) page around it — the corners simply
 * fall back to the page, so the sheet reads as the page itself ripped, not a pasted-on
 * square.
 *
 * Through the hole: a slice of our REAL source (literal repo files via Vite `?raw`),
 * an emerald glow rising from the depth, and a scan-line sweeping down. The whole
 * tear is a BUTTON → toggles the full-page X-ray.
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
        {/* THE DARK MACHINERY — shown ONLY through the torn opening (masked to the
            paper's hole), so it never leaks past the sheet into the page. */}
        <div className="rip-hole" aria-hidden="true">
          {/* A slice of the real source — reads like the X-ray editor pane. */}
          <div className="rip-code">
            {FRAGMENTS.map((f, i) => (
              <pre key={i} className={`m-0 whitespace-pre font-mono text-[10.5px] leading-relaxed ${f.tone}`}>
                {f.code}
              </pre>
            ))}
          </div>
          {/* Emerald glow rising from the depth (light from below). */}
          <div className="rip-floor" />
          {/* The overhanging torn edge casts a hard shadow DOWN into the hole. */}
          <div className="rip-overhang" />
          {/* Scan-line sweeping down the opening. translateY only (composited). */}
          <div className="rip-scan" />
        </div>

        {/* THE REAL TORN PAGE — lime sheet ripped open; curled edges, fibre, cracks and
            self-shadow are all in the asset. Sits ON TOP; its hole reveals the code. */}
        <img className="rip-paper" src="/torn-page.png" alt="" aria-hidden="true" draggable={false} />

        {/* Hint that the tear is the X-ray trigger. */}
        <span className="rip-hint"><ScanLine className="size-3.5" strokeWidth={2.25} aria-hidden /> click to x-ray</span>
      </div>
    </button>
  )
}
// #endregion
