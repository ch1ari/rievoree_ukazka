import type { ReactNode } from "react"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { ResponsiveTreeMap } from "@nivo/treemap"
import type { PnlPoint, Slice } from "@/lib/data/aggregate"
import type { WfStep } from "@/lib/data/balance"

// Dark-theme palette (concrete hex — SVG fill attributes don't resolve CSS vars).
const EMERALD = "#4fc99a"
const TEAL = "#3fc6cf"
const AMBER = "#e0b341"
const GRID = "rgba(255,255,255,0.07)"
const AXIS = "rgba(255,255,255,0.45)"
const DONUT = ["#4fc99a", "#3fc6cf", "#e0b341", "#9b8cf0", "#e5584d", "#6ea8fe", "#f08ab4"]

export const COLORS = { emerald: EMERALD, teal: TEAL, amber: AMBER }
const BUCKET_COLORS = ["#4fc99a", "#e0b341", "#e0843e", "#e5584d"] // 0–30 … 90+

const REDUCE = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
const ANIM = !REDUCE

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
const eurK = (n: number) => (Math.abs(n) >= 1000 ? `€${Math.round(n / 1000)}k` : eur.format(n))

/** Dark card wrapper for a chart with a mono title + optional hint/action. */
export function ChartCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-[1.5rem] bg-card p-5 shadow-soft ring-1 ring-border md:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h3>
        {hint && <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function DarkTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-[#14151a] px-3 py-2 font-mono text-xs shadow-soft ring-1 ring-white/15">
      {label && <div className="mb-1 text-white/55">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 tabular-nums">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-white/60">{p.name}</span>
          <span className="ml-auto text-white/90">{/%/.test(p.name) ? `${Number(p.value).toFixed(1)}%` : eur.format(Number(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

/** Tiny inline sparkline for KPI cards (no axes/grid). */
export function Sparkline({ data, color = EMERALD }: { data: number[]; color?: string }) {
  const d = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={d} margin={{ top: 3, right: 0, bottom: 0, left: 0 }}>
        <Area dataKey="v" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.14} dot={false} isAnimationActive={ANIM} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function WfTooltip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; val: number } }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl bg-[#14151a] px-3 py-2 font-mono text-xs shadow-soft ring-1 ring-white/15">
      <span className="text-white/60">{d.name}: </span>
      <span className="text-white/90 tabular-nums">{eur.format(d.val)}</span>
    </div>
  )
}

/** Cash-flow WATERFALL — Recharts stacked bar with a transparent base. Flows are
 *  green/red; the closing total resets to zero. Ties to cash on the balance sheet. */
export function Waterfall({ steps }: { steps: WfStep[] }) {
  let run = 0
  const data = steps.map((s) => {
    if (s.isTotal) { run = s.value; return { name: s.name, base: 0, bar: Math.abs(s.value), color: TEAL, val: s.value } } // total: 0→value, and rebase the running line (supports leading-total bridges)
    const start = run
    run += s.value
    return { name: s.name, base: Math.min(start, run), bar: Math.abs(s.value), color: s.value >= 0 ? EMERALD : "#e5584d", val: s.value }
  })
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 11, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={{ fill: AXIS, fontSize: 11, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} tickFormatter={eurK} width={52} />
        <Tooltip content={<WfTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="bar" stackId="w" radius={[3, 3, 0, 0]} isAnimationActive={ANIM}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Stacked aging bars — one bar per entity, stacked by aging bucket. */
export function AgingStacked({ data, buckets }: { data: Record<string, string | number>[]; buckets: readonly string[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 11, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={{ fill: AXIS, fontSize: 11, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} tickFormatter={eurK} width={52} />
        <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Legend wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 11, color: AXIS }} />
        {buckets.map((b, i) => (
          <Bar key={b} dataKey={b} name={b} stackId="age" fill={BUCKET_COLORS[i % BUCKET_COLORS.length]}
            radius={i === buckets.length - 1 ? [3, 3, 0, 0] : undefined} isAnimationActive={ANIM} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Combo: revenue (bars, left axis) + operating margin % (line, right axis). */
export function RevenueMarginCombo({ data }: { data: { month: string; revenue: number; marginPct: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="month" tick={{ fill: AXIS, fontSize: 11, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
        <YAxis yAxisId="left" tick={{ fill: AXIS, fontSize: 11, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} tickFormatter={eurK} width={52} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: AXIS, fontSize: 11, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(Number(v))}%`} width={40} />
        <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Legend wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 11, color: AXIS }} />
        <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill={EMERALD} fillOpacity={0.8} radius={[3, 3, 0, 0]} isAnimationActive={ANIM} />
        <Line yAxisId="right" dataKey="marginPct" name="Margin %" stroke={AMBER} strokeWidth={2} dot={false} isAnimationActive={ANIM} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/** Revenue vs expenses (areas) + profit (line) over months. Clicking a month
 *  calls onSelectMonth (interactive drill into the table / period filter). */
export function PnlTrend({ data, onSelectMonth }: { data: PnlPoint[]; onSelectMonth?: (month: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
        onClick={(s) => { const m = s?.activeLabel; if (onSelectMonth && m != null) onSelectMonth(String(m)) }}
        style={{ cursor: onSelectMonth ? "pointer" : "default" }}>
        <defs>
          <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={EMERALD} stopOpacity={0.28} />
            <stop offset="100%" stopColor={EMERALD} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TEAL} stopOpacity={0.18} />
            <stop offset="100%" stopColor={TEAL} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="month" tick={{ fill: AXIS, fontSize: 11, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
        <YAxis tick={{ fill: AXIS, fontSize: 11, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} tickFormatter={eurK} width={52} />
        <Tooltip content={<DarkTooltip />} />
        <Legend wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 11, color: AXIS }} />
        <Area isAnimationActive={ANIM} type="monotone" dataKey="revenue" name="Revenue" stroke={EMERALD} strokeWidth={2} fill="url(#gRev)" />
        <Area isAnimationActive={ANIM} type="monotone" dataKey="expenses" name="Expenses" stroke={TEAL} strokeWidth={2} fill="url(#gExp)" />
        <Line isAnimationActive={ANIM} type="monotone" dataKey="profit" name="Profit" stroke={AMBER} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/** Expense mix as a TREEMAP (not a pie — pies read as unprofessional in B2B
 *  finance). Tile area = spend; bigger cost centres dominate at a glance. */
export function ExpenseTreemap({ data }: { data: Slice[] }) {
  const root = {
    name: "Expenses",
    children: data.map((d) => ({ name: d.name, value: d.value })),
  }
  return (
    <div style={{ height: 300 }}>
      <ResponsiveTreeMap
        data={root}
        identity="name"
        value="value"
        valueFormat={(v) => eur.format(Number(v))}
        leavesOnly
        innerPadding={3}
        outerPadding={0}
        enableParentLabel={false}
        colors={DONUT}
        nodeOpacity={0.92}
        borderWidth={0}
        labelSkipSize={26}
        label={(node) => String(node.id)}
        labelTextColor="#0c0d10"
        animate={ANIM}
        theme={{
          labels: { text: { fontFamily: "JetBrains Mono", fontSize: 11, fontWeight: 600 } },
          tooltip: { container: { background: "#14151a", color: "#fff", fontFamily: "JetBrains Mono", fontSize: 12, borderRadius: 10 } },
        }}
      />
    </div>
  )
}
