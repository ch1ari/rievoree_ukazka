import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { ScanLine, TriangleAlert } from "lucide-react"
import { sliceStatement, highlightCode } from "@/lib/code-xray"
import { useXray } from "@/components/XrayContext"
import reportSrc from "../../supabase/migrations/20260610000002_report_account_monthly.sql?raw"
import rlsSrc from "../../supabase/migrations/20260605000001_identity_and_tenancy.sql?raw"

/**
 * HERO X-RAY WINDOW — the project tagline made literal: "See the machinery".
 * The surface is a financial report (a P&L roll-up); a scan line loops over it
 * and x-rays the surface away to reveal the REAL machinery underneath — the
 * tenant-filtered report view + the RLS policy that produced exactly those rows.
 * The visitor sees the value prop immediately, no click. The button fires the
 * full-viewport version (shared XrayScan state).
 *
 * Perf: the loop is one registered custom property (--xloop) animated purely in
 * CSS — no per-frame React/JS. Paused off-screen + on reduced-motion (static).
 */
// #region xray
// Real machinery, sliced from the migrations at build time (?raw) — the view
// whose WHERE clause is the sole tenant barrier, and the matching RLS policy.
const MACHINERY = [
  sliceStatement(reportSrc, "create view public.report_account_monthly"),
  sliceStatement(rlsSrc, "create policy entities_select"),
].filter(Boolean).join("\n\n")

// The surface: a P&L roll-up. Each net obeys the view's `net = debit - credit`.
const ROWS = [
  { code: "4000", name: "Revenue", debit: 12_000, credit: 1_252_500, net: -1_240_500 },
  { code: "5000", name: "Cost of goods sold", debit: 612_300, credit: 0, net: 612_300 },
  { code: "6100", name: "Payroll", debit: 318_400, credit: 2_000, net: 316_400 },
  { code: "7200", name: "Marketing", debit: 64_900, credit: 0, net: 64_900, anomaly: "z 3.8" },
  { code: "8000", name: "Interest expense", debit: 9_800, credit: 0, net: 9_800 },
]
const fmt = (n: number) => (n === 0 ? "—" : n.toLocaleString("en-US"))

export function HeroXray() {
  const { toggle } = useXray()
  const ref = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState<string | null>(null)

  // Highlight the revealed SQL — deferred to idle so it never blocks first paint.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 250))
    const id = idle(() => { highlightCode(MACHINERY, "sql").then(setHtml).catch(() => {}) })
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(id as number)
  }, [])

  // Loop only while on-screen and motion is allowed (battery + accessibility).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce) { el.dataset.animate = "false"; el.style.setProperty("--xloop", "0.5"); return }
    const io = new IntersectionObserver(([e]) => { el.dataset.animate = e.isIntersecting ? "true" : "false" })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div className="relative">
      {/* Soft accent glow so the exhibit reads as a designed object, not a boxed screenshot. */}
      <div aria-hidden className="absolute -inset-5 -z-10 rounded-[2.5rem] bg-gradient-to-br from-accent/12 via-cold/10 to-signal/12 blur-3xl" />

      <div
        ref={ref}
        data-animate="true"
        className="xray-window relative overflow-hidden rounded-3xl bg-card shadow-soft ring-1 ring-border"
        style={{ ["--xloop" as string]: 0 }}
      >
        {/* Exhibit label — not a browser chrome. States what you're looking at. */}
        <div className="relative z-30 flex items-center gap-2.5 border-b border-border bg-secondary/50 px-5 py-3 backdrop-blur">
          <span className="size-1.5 animate-pulse rounded-full bg-accent" />
          <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-accent">Live demo</span>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">a report → the query behind it</span>
        </div>

        <div className="relative h-[360px] sm:h-[400px] lg:h-[460px]">
          {/* Machinery layer — the real SQL revealed beneath the report. */}
          <div className="code-shiki absolute inset-0 overflow-hidden bg-[#1e1e1e]">
            {html != null ? (
              <div dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <pre className="px-4 py-4 text-[12px] leading-[1.6] text-white/70">{MACHINERY}</pre>
            )}
          </div>

          {/* Surface layer — a financial report, clipped away top-down by the scan. */}
          <div className="xray-window-ui absolute inset-0 flex flex-col bg-background px-5 py-4 sm:px-6">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="font-mono text-xs text-muted-foreground">report_account_monthly</div>
                <div className="mt-0.5 text-lg font-semibold tracking-tight">Profit &amp; Loss</div>
              </div>
              <span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-muted-foreground ring-1 ring-border">
                viewer · 2026-05
              </span>
            </div>

            {/* Column header */}
            <div className="mt-4 grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-5 border-b border-border pb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:gap-x-8">
              <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span className="text-right">Net</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/70">
              {ROWS.map((r) => (
                <div key={r.code} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-5 py-2.5 sm:gap-x-8">
                  <span className="flex items-center gap-2 truncate">
                    <span className="font-mono text-[11px] text-muted-foreground">{r.code}</span>
                    <span className="truncate text-sm">{r.name}</span>
                    {r.anomaly && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/12 px-1.5 py-0.5 font-mono text-[9px] font-medium text-destructive">
                        <TriangleAlert className="size-2.5" strokeWidth={2.5} /> {r.anomaly}
                      </span>
                    )}
                  </span>
                  <span className="text-right font-mono text-[12px] tabular-nums text-muted-foreground">{fmt(r.debit)}</span>
                  <span className="text-right font-mono text-[12px] tabular-nums text-muted-foreground">{fmt(r.credit)}</span>
                  <span className={`text-right font-mono text-[12px] font-medium tabular-nums ${r.net < 0 ? "text-signal" : "text-foreground"}`}>
                    {r.net < 0 ? `(${fmt(-r.net)})` : fmt(r.net)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-auto flex items-center gap-2 pt-3 font-mono text-[10px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-signal" />
              row-level security · entity-scoped · anomalies z-scored
            </div>
          </div>

          {/* The scan line riding the reveal edge. */}
          <div aria-hidden className="xray-window-scan" />
        </div>
      </div>

      {/* What you're looking at — frames the demo as a skill showcase, not the pitch. */}
      <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
        The report you'd see in the app, x-rayed down to the real view and row-level-security
        policy that produced it. Same trick, whole page:
      </p>

      {/* Trigger — fires the full-viewport x-ray of the landing itself. */}
      <motion.button
        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}
        onClick={toggle}
        className="group mt-3 inline-flex items-center gap-2.5 rounded-full bg-foreground px-6 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-background shadow-soft"
      >
        <ScanLine className="size-4 transition-transform group-hover:rotate-180" strokeWidth={2.25} />
        X-ray this page
      </motion.button>
    </div>
  )
}
// #endregion
