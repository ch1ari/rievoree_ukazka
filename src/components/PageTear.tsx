import { ScanLine } from "lucide-react"
import { sliceStatement, sliceFrom } from "@/lib/code-xray"
import { useXray } from "@/components/XrayContext"
import reportSrc from "../../supabase/migrations/20260610000002_report_account_monthly.sql?raw"
import rlsSrc from "../../supabase/migrations/20260605000001_identity_and_tenancy.sql?raw"
import dbSrc from "../../worker/src/db.ts?raw"

/**
 * THE RIP — the lime PAGE itself torn down the middle. The left half stays lime (the
 * headline lives there); the right half is the dark machinery, revealed along a
 * full-height ragged vertical tear. The tear is procedural: an feTurbulence +
 * feDisplacementMap filter frays the dark panel's straight left edge into hand-torn
 * paper fibre, and a lit lime rim + inner shadow along that edge read as the curled
 * torn paper lifting off the recess. The dark panel is the X-ray trigger.
 *
 * Through the tear: a slice of our REAL source (literal repo files via Vite `?raw`),
 * an emerald glow and a scan-line. prefers-reduced-motion → scan off.
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
    <div className="riptear">
      {/* Torn-edge filter — two-scale displacement: coarse scallops + fine fibre. */}
      <svg className="rip-filter-def" width="0" height="0" aria-hidden="true" focusable="false">
        <filter id="tear-rough" x="-15%" y="-5%" width="130%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.014" numOctaves="4" seed="11" result="coarse" />
          <feTurbulence type="fractalNoise" baseFrequency="0.04 0.09" numOctaves="3" seed="5" result="fine" />
          <feDisplacementMap in="SourceGraphic" in2="coarse" scale="46" xChannelSelector="R" yChannelSelector="G" result="d1" />
          <feDisplacementMap in="d1" in2="fine" scale="9" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      {/* THE DARK MACHINERY — full-height panel; the filter frays ONLY this shape's
          left edge (no children, so the code/hint stay crisp). It is the X-ray trigger. */}
      <button type="button" onClick={toggle} className="riptear-dark group"
        aria-label="X-ray this page — reveal the real source beneath the surface" />

      {/* Crisp overlay (NOT filtered) — code, glow, scan and hint, held to the RIGHT of
          the ragged edge so they sit over the dark recess only. */}
      <div className="riptear-content" aria-hidden="true">
        <div className="rip-code">
          {FRAGMENTS.map((f, i) => (
            <pre key={i} className={`m-0 whitespace-pre font-mono text-[11px] leading-relaxed ${f.tone}`}>
              {f.code}
            </pre>
          ))}
        </div>
        <div className="rip-floor" />
        <div className="rip-scan" />
        <span className="rip-hint"><ScanLine className="size-3.5" strokeWidth={2.25} aria-hidden /> click to x-ray</span>
      </div>
    </div>
  )
}
// #endregion
