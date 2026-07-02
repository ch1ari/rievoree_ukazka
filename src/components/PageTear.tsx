import { useMemo } from "react"
import { ScanLine } from "lucide-react"
import { sliceStatement, sliceFrom } from "@/lib/code-xray"
import { useXray } from "@/components/XrayContext"
import reportSrc from "../../supabase/migrations/20260610000002_report_account_monthly.sql?raw"
import rlsSrc from "../../supabase/migrations/20260605000001_identity_and_tenancy.sql?raw"
import dbSrc from "../../worker/src/db.ts?raw"

/**
 * THE RIP — a real VIDEO of paper tearing open (rawpixel), rebuilt frame-by-frame
 * (scripts/build-torn-hole.py) so the paper IS the page: the white sheet is
 * flat-field corrected (vignette removed) and recoloured to the exact sheet
 * colour (#A3E635 — PaperBackground's field, which is what the landing actually
 * shows), the green screen is keyed to a transparent hole with
 * a baked-in inner rim shadow, and the alpha feathers to zero well inside every
 * object-fit:cover crop — so there is NO visible sheet edge at any viewport,
 * only the animated hole + torn rim reading as a hole IN the page itself.
 *
 * The clip plays ONCE (the tear opens with an ease-out settle) and freezes
 * fully open, so the source beneath stays readable. Safari (no VP9-alpha) and
 * prefers-reduced-motion get the same composition as a static alpha WebP —
 * the DOM recess + real code still show through the transparent hole.
 *
 * Behind the hole: a dark emerald recess with a slice of our REAL source
 * (literal repo files via Vite `?raw`), a floor glow and a scan-line — all
 * geometry is sized in the video's canvas space via container-query units
 * (--rs in index.css), so it tracks the hole across viewports. The whole tear
 * is a BUTTON → toggles the X-ray.
 *
 * Honesty invariant: every snippet is the literal repo file via `?raw` — the
 * RLS tenant policy, the tenant-filtered report view, and the worker's
 * skip-locked queue claim.
 */

// #region xray
const FRAGMENTS: { code: string; tone: string }[] = [
  // RLS — the row-level policy that seals every entity to its owner.
  { code: sliceStatement(rlsSrc, "create policy entities_select"), tone: "rip-tone-a" },
  // The public door — the tenant-filtered SQL view (teal: "the data window").
  { code: sliceStatement(reportSrc, "create view public.report_account_monthly"), tone: "rip-tone-b" },
  // The Deno worker — the atomic, crash-safe queue claim (FOR UPDATE SKIP LOCKED).
  { code: sliceFrom(dbSrc, "update public.ingest_queue q", 13), tone: "rip-tone-a" },
]

export function PageTear() {
  const { toggle } = useXray()
  // Static image instead of video when the browser can't compose VP9 alpha
  // (Safari/WebKit) or the user prefers reduced motion. The WebP keeps the
  // transparent hole, so the recess + live source still show through.
  const still = useMemo(
    () =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.createElement("video").canPlayType('video/webm; codecs="vp09.00.10.08"') === "",
    [],
  )
  return (
    <button type="button" onClick={toggle} className="rip group"
      aria-label="X-ray this page — reveal the real source beneath the surface">

      <div className="rip-scene">
        {/* THE DARK MACHINERY — an emerald recess behind the paper; the animated
            hole in the video reveals it (and the live source) as the page tears. */}
        <div className="rip-hole" aria-hidden="true">
          {/* A slice of the real source — reads like the X-ray editor pane. */}
          <div className="rip-code">
            {FRAGMENTS.map((f, i) => (
              <pre key={i} className={`m-0 whitespace-pre font-mono leading-relaxed ${f.tone}`}>
                {f.code}
              </pre>
            ))}
          </div>
          {/* Emerald glow rising from the depth (light from below), breathing. */}
          <div className="rip-floor" />
          {/* Scan-line sweeping down the opening. translateY only (composited). */}
          <div className="rip-scan" />
        </div>

        {/* THE PAGE ITSELF, TORN — alpha video recoloured to the exact sheet
            colour (#A3E635, PaperBackground's field); far field is flat lime with
            feathered alpha, so no sheet edge can ever show. Plays once and
            freezes open (no loop). */}
        {still ? (
          <img className="rip-paper" src="/torn-page.webp" alt="" aria-hidden="true" />
        ) : (
          <video className="rip-paper" src="/torn-hole.webm" poster="/torn-poster.webp"
            autoPlay muted playsInline aria-hidden="true" />
        )}

        {/* The SAME paper grain PaperBackground lays over the sheet, repeated
            over the torn paper (the video's flat lime carries no tooth — without
            this the patch reads airbrushed against the grainy page). Masked to
            the video's opaque footprint so the soft-light pass never veils the
            bare page around it; over the recess it reads as film grain. */}
        <div className="rip-grain" aria-hidden="true">
          <div className="absolute inset-0" style={{ filter: "url(#paper-tooth)", mixBlendMode: "multiply", opacity: 0.13 }} />
          <div className="absolute inset-0" style={{ filter: "url(#paper-fiber)", mixBlendMode: "soft-light", opacity: 0.18 }} />
        </div>

        {/* Hint that the tear is the X-ray trigger. */}
        <span className="rip-hint"><ScanLine className="size-3.5" strokeWidth={2.25} aria-hidden /> click to x-ray</span>
      </div>
    </button>
  )
}
// #endregion
