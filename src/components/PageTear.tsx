import { ScanLine } from "lucide-react"
import { sliceStatement, sliceFrom } from "@/lib/code-xray"
import { useXray } from "@/components/XrayContext"
import reportSrc from "../../supabase/migrations/20260610000002_report_account_monthly.sql?raw"
import rlsSrc from "../../supabase/migrations/20260605000001_identity_and_tenancy.sql?raw"
import dbSrc from "../../worker/src/db.ts?raw"

/**
 * THE RIP — a real VIDEO of paper tearing open (rawpixel), keyed + recoloured so the
 * lime page itself rips to expose the dark machinery. The green screen behind the tear
 * is chroma-keyed to a transparent hole and the white paper is recoloured to the brand
 * lime (see /torn-hole.webm, built from the source clip); the paper fills the whole
 * frame and its rectangular edges are feathered into the page, so there is NO visible
 * sheet — only the animated hole + torn rim, reading as a hole IN the page. A static
 * PNG (`/torn-page.png`) is the poster/fallback where VP9-alpha video isn't supported.
 *
 * Behind the hole: a dark recess with a slice of our REAL source (literal repo files
 * via Vite `?raw`), an emerald glow and a scan-line — all confined to the centre so
 * they only show through the tear. The whole tear is a BUTTON → toggles the X-ray.
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
        {/* THE DARK MACHINERY — a full dark recess behind the paper; the animated hole
            in the video reveals it (and the live source) as the paper tears open. */}
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
          {/* Scan-line sweeping down the opening. translateY only (composited). */}
          <div className="rip-scan" />
        </div>

        {/* THE REAL TORN PAGE — a video of paper actually tearing open (rawpixel),
            green-screen keyed to a transparent hole and recoloured to the page lime, so
            the paper fills the frame (no visible edges) and the animated hole reveals
            the machinery beneath. Static PNG poster is the fallback (e.g. Safari). */}
        <video className="rip-paper" src="/torn-hole.webm" poster="/torn-page.png"
          autoPlay loop muted playsInline aria-hidden="true" />

        {/* Hint that the tear is the X-ray trigger. */}
        <span className="rip-hint"><ScanLine className="size-3.5" strokeWidth={2.25} aria-hidden /> click to x-ray</span>
      </div>
    </button>
  )
}
// #endregion
