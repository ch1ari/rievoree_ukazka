import { useEffect, useRef } from "react"
import { sliceStatement, sliceFrom } from "@/lib/code-xray"
import reportSrc from "../../supabase/migrations/20260610000002_report_account_monthly.sql?raw"
import rlsSrc from "../../supabase/migrations/20260605000001_identity_and_tenancy.sql?raw"
import dbSrc from "../../worker/src/db.ts?raw"
import edgeSrc from "../../supabase/functions/ingest-submit/index.ts?raw"

/**
 * TORN BACKGROUND — own "torn paper / collage" surface on the dark canvas. Faint
 * graphite sheets with ripped (clip-path) edges sit over a substrate of REAL repo
 * machinery — different files in different tears (report view, RLS policy, worker
 * queue-claim, ingest edge fn) plus real demo data (P&L lines, pipeline events) —
 * so through the tears you glimpse the machinery + data beneath. A faint own SVG
 * layer (pipeline graph, chart curve, blueprint grid) adds technical/finance
 * texture on the surface. The cursor casts a soft emerald light; the buried code
 * drifts on scroll. No foreign assets — every fragment is real repo code/data or
 * hand-drawn SVG.
 *
 * Perf/a11y: only the cursor light + substrate drift move (one rAF, passive
 * listeners) — no per-frame React. prefers-reduced-motion → light hidden, no
 * drift. Touch → light off-screen, static. Low-opacity throughout + a scrim, so
 * text/code stay legible.
 */
const PNL = `4000  Revenue              12,000   1,252,500  (1,240,500)
5000  Cost of goods sold        —      612,300     612,300
6100  Payroll             318,400       2,000     316,400
7200  Marketing            64,900          —       64,900   z 3.8
8000  Interest expense      9,800          —        9,800`

const EVENTS = `queued → processing → loaded    batch #1184
admin 42 · manager 12 · viewer 0    rows
refresh_report_mv    11098 runs · 0 failed
€3.06M processed · 4 entities · 18 periods`

// Buried machinery — real fragments, distinct files, placed near the torn gaps.
const FRAGMENTS: { text: string; cls: string; tone?: string }[] = [
  { text: sliceStatement(reportSrc, "create view public.report_account_monthly"), cls: "left-[2%] top-[40%]" },
  { text: PNL, cls: "right-[3%] top-[42%]", tone: "text-accent/[0.12]" },
  { text: sliceFrom(dbSrc, "update public.ingest_queue", 9), cls: "left-[3%] top-[72%]" },
  { text: sliceStatement(rlsSrc, "create policy entities_select"), cls: "left-[40%] top-[73%]" },
  { text: sliceFrom(edgeSrc, "createSignedUploadUrl", 2), cls: "right-[4%] top-[74%]" },
  { text: EVENTS, cls: "right-[26%] top-[2%]", tone: "text-accent/[0.12]" },
  { text: sliceStatement(reportSrc, "create view public.report_account_monthly"), cls: "left-[18%] top-[6%]" },
]

// Four graphite sheets, alternating lighter/darker than the base (0.15) so the
// ripped strata read clearly; wide ragged tears between them expose the code.
const SHEETS = [
  {
    style: { top: "0", height: "30%" },
    clip: "polygon(0 0,100% 0,100% 76%,92% 92%,84% 78%,76% 94%,68% 80%,60% 96%,52% 80%,44% 94%,36% 78%,28% 95%,20% 80%,12% 93%,4% 79%,0 94%)",
    shade: "oklch(0.215 0.006 250)",
  },
  {
    style: { top: "37%", height: "20%" },
    clip: "polygon(0 14%,8% 1%,16% 16%,24% 2%,32% 15%,40% 1%,48% 16%,56% 2%,64% 15%,72% 1%,80% 16%,88% 3%,96% 14%,100% 5%,100% 86%,92% 98%,84% 84%,76% 97%,68% 86%,60% 98%,52% 84%,44% 97%,36% 86%,28% 98%,20% 84%,12% 97%,4% 87%,0 97%)",
    shade: "oklch(0.122 0.006 250)",
  },
  {
    style: { top: "64%", height: "18%" },
    clip: "polygon(0 15%,8% 2%,16% 16%,24% 1%,32% 15%,40% 3%,48% 16%,56% 1%,64% 15%,72% 2%,80% 16%,88% 3%,96% 15%,100% 5%,100% 85%,92% 98%,84% 85%,76% 97%,68% 86%,60% 98%,52% 84%,44% 97%,36% 86%,28% 98%,20% 85%,12% 97%,4% 86%,0 97%)",
    shade: "oklch(0.198 0.006 250)",
  },
  {
    style: { top: "88%", height: "12%" },
    clip: "polygon(0 18%,8% 3%,16% 17%,24% 2%,32% 16%,40% 4%,48% 17%,56% 2%,64% 16%,72% 3%,80% 17%,88% 4%,96% 15%,100% 6%,100% 100%,0 100%)",
    shade: "oklch(0.118 0.006 250)",
  },
]

export function TornBackground() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let raf = 0
    let mx = -9999, my = -9999, sy = 0
    const apply = () => {
      raf = 0
      el.style.setProperty("--mx", `${mx}px`)
      el.style.setProperty("--my", `${my}px`)
      el.style.setProperty("--sy", `${sy * 0.04}px`)
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(apply) }
    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; schedule() }
    const onScroll = () => { sy = window.scrollY; schedule() }
    window.addEventListener("mousemove", onMove, { passive: true })
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      {/* Buried machinery substrate — real code + data, very faint, drifts on scroll. */}
      <div className="torn-code absolute inset-0">
        {FRAGMENTS.map((f, i) => (
          <pre key={i}
            className={`absolute whitespace-pre font-mono text-[11px] leading-relaxed ${f.cls} ${f.tone ?? "text-foreground/[0.1]"}`}>
            {f.text}
          </pre>
        ))}
      </div>

      {/* Ripped graphite sheets — the tears between them expose the substrate. */}
      {SHEETS.map((s, i) => (
        <div key={i} className="absolute right-0 left-0"
          style={{ ...s.style, background: s.shade, clipPath: s.clip, filter: "drop-shadow(0 7px 11px oklch(0 0 0 / 0.8))" }} />
      ))}

      {/* Own machinery decor on the surface — pipeline graph, chart curve, grid. */}
      <div className="absolute inset-0 text-accent">
        {/* blueprint grid */}
        <div className="absolute inset-0" style={{
          backgroundImage:
            "repeating-linear-gradient(to right, oklch(0.72 0.12 158 / 0.025) 0 1px, transparent 1px 60px)," +
            "repeating-linear-gradient(to bottom, oklch(0.72 0.12 158 / 0.025) 0 1px, transparent 1px 60px)",
        }} />
        {/* pipeline node-graph (lower-left negative space) */}
        <svg viewBox="0 0 360 140" fill="none" className="absolute bottom-[6%] left-[3%] w-[clamp(220px,22vw,420px)] opacity-[0.5]" stroke="currentColor">
          <path d="M28 96 L112 50 L196 92 L280 44 L344 86" strokeWidth="1" opacity="0.5" />
          <path d="M28 96 L196 92 M112 50 L280 44" strokeWidth="0.75" opacity="0.3" />
          {[[28,96],[112,50],[196,92],[280,44],[344,86]].map(([x,y],i)=>(
            <circle key={i} cx={x} cy={y} r="4.5" fill="currentColor" fillOpacity="0.55" stroke="currentColor" />
          ))}
        </svg>
        {/* finance line/area curve (upper-right, away from content) */}
        <svg viewBox="0 0 300 120" fill="none" className="absolute right-[2%] top-[14%] w-[clamp(180px,18vw,340px)] opacity-[0.45]">
          <path d="M0 95 L37 78 L75 84 L112 50 L150 62 L187 30 L225 46 L262 18 L300 32 L300 120 L0 120 Z" fill="currentColor" fillOpacity="0.05" />
          <path d="M0 95 L37 78 L75 84 L112 50 L150 62 L187 30 L225 46 L262 18 L300 32" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.55" />
        </svg>
      </div>

      {/* Readability scrim so the faint machinery never competes with content. */}
      <div className="absolute inset-0 bg-background/20" />

      {/* Cursor light — soft emerald, catches the tears (off-screen until moved). */}
      <div className="torn-glow" />
    </div>
  )
}
