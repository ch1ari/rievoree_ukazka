/**
 * Live, on-brand mini-UIs for the "What it does" showcase — built in code, not
 * screenshots, so they never go stale and stay tuned to the lime palette. Each
 * is a small dark-green console panel that stands in for the real product view:
 * ingest batches, the RLS-scoped report chart, and the live x-ray call stream.
 */
import type { ReactNode } from "react"

function Shell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dark flex h-[280px] flex-col overflow-hidden rounded-2xl border border-accent/20 bg-[oklch(0.19_0.03_158)] text-foreground shadow-[0_24px_60px_-24px_oklch(0.15_0.05_158)] lg:h-[330px]">
      <div className="flex items-center gap-2 border-b border-accent/15 bg-[oklch(0.22_0.035_158)] px-4 py-2.5">
        <span className="size-2 rounded-full bg-accent shadow-[0_0_8px_oklch(0.72_0.12_158)]" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-accent/90">{label}</span>
      </div>
      <div className="min-h-0 flex-1 p-4">{children}</div>
    </div>
  )
}

const STATUS = {
  done: "bg-signal/15 text-signal ring-1 ring-signal/30",
  review: "bg-accent/15 text-accent ring-1 ring-accent/30",
} as const

export function PanelIngest() {
  const rows = [
    { file: "june-2026.csv", status: "Needs review", tone: STATUS.review, stat: "312 · 2 flagged" },
    { file: "may-2026.csv", status: "Done", tone: STATUS.done, stat: "298 loaded" },
    { file: "apr-2026.csv", status: "Done", tone: STATUS.done, stat: "305 loaded" },
    { file: "mar-2026.csv", status: "Done", tone: STATUS.done, stat: "287 loaded" },
  ]
  return (
    <Shell label="ingest · batches · live">
      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2.5">
        {rows.map((r) => (
          <div key={r.file} className="contents">
            <div className="min-w-0">
              <div className="truncate font-mono text-xs text-foreground">{r.file}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{r.stat}</div>
            </div>
            <span className={`self-center rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider ${r.tone}`}>
              {r.status}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-white/5 pt-3 font-mono text-[10px] text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-accent" /> worker draining queue…
      </div>
    </Shell>
  )
}

// Build a smooth-ish polyline across a 0..1 normalised viewport.
function line(vals: number[], w: number, h: number, pad = 4) {
  const max = Math.max(...vals), min = Math.min(...vals)
  const span = max - min || 1
  return vals
    .map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (w - pad * 2)
      const y = pad + (1 - (v - min) / span) * (h - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
}

export function PanelReports() {
  const W = 300, H = 150
  const revenue = [142, 150, 146, 158, 165, 160, 172, 168, 176]
  const expenses = [96, 101, 99, 104, 110, 107, 113, 109, 118]
  const profit = revenue.map((r, i) => r - expenses[i])
  return (
    <Shell label="reports · RLS-scoped">
      <div className="flex h-full flex-col">
        <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Revenue vs expenses</span>
          <span className="rounded-full bg-accent/12 px-2 py-0.5 text-accent">2 entities</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full flex-1" preserveAspectRatio="none">
          <defs>
            <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.72 0.12 158)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="oklch(0.72 0.12 158)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`4,${H - 4} ${line(revenue, W, H)} ${W - 4},${H - 4}`} fill="url(#rev-fill)" />
          <polyline points={line(revenue, W, H)} fill="none" stroke="oklch(0.72 0.12 158)" strokeWidth="2.5" />
          <polyline points={line(expenses, W, H)} fill="none" stroke="oklch(0.74 0.13 190)" strokeWidth="2.5" />
          <polyline points={line(profit, W, H)} fill="none" stroke="oklch(0.8 0.15 85)" strokeWidth="2" strokeDasharray="1 4" strokeLinecap="round" />
        </svg>
        <div className="mt-2 flex items-center gap-4 font-mono text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" /> Revenue</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-signal" /> Expenses</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[oklch(0.8_0.15_85)]" /> Profit</span>
        </div>
      </div>
    </Shell>
  )
}

export function PanelXray() {
  const calls = [
    { t: "report_account_monthly", ms: 41, w: "100%" },
    { t: "entities", ms: 16, w: "44%" },
    { t: "profiles", ms: 12, w: "32%" },
    { t: "accounts", ms: 9, w: "24%" },
  ]
  return (
    <Shell label="x-ray panel · calls">
      <div className="space-y-2.5 font-mono text-[11px]">
        {calls.map((c) => (
          <div key={c.t}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-foreground/85">
                <span className="text-muted-foreground">rest </span>
                <span className="text-accent">GET</span> {c.t}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                <span className="text-signal">200</span> · {c.ms}ms
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-gradient-to-r from-accent/60 to-accent" style={{ width: c.w }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-white/5 pt-3 font-mono text-[10px] text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-accent" /> timed at the fetch seam
      </div>
    </Shell>
  )
}
