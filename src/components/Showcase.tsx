import { motion } from "motion/react"
import { sliceStatement, sliceFrom } from "@/lib/code-xray"
import { PanelShot } from "@/components/showcase/PanelShot"
import dbSrc from "../../worker/src/db.ts?raw"
import rlsSrc from "../../supabase/migrations/20260605000001_identity_and_tenancy.sql?raw"
import instrSrc from "@/lib/xray/instrumentedFetch.ts?raw"

/**
 * SHOWCASE — the "Three things" section as a vertical timeline. Each station pairs
 * a LIVE mini-UI of OUR app (ingest batches, RLS-scoped report, x-ray call stream)
 * with a big index, a Big Shoulders title, a hand-drawn SVG of what it does, and a
 * faint real ?raw code fragment. A green spine draws down the rail as each station
 * reveals on scroll. The mini-UIs are built in code (no screenshots), so they stay
 * on-brand and never go stale. Respects prefers-reduced-motion via MotionConfig.
 */
type Kind = "pipeline" | "rls" | "signal"

// Real, full-page product screenshots (public/showcase), captured from the live
// app. Paired with the three stations — the ingest page, the RLS-scoped
// dashboard, and the dashboard with the X-ray call stream open.
const SHOTS: Record<Kind, { src: string; alt: string }> = {
  pipeline: { src: "/showcase/ingest-batches.png", alt: "Ingest — upload data and the live batches table with validated and flagged uploads" },
  rls: { src: "/showcase/dashboard-overview.png", alt: "Dashboard — RLS-filtered KPIs and the revenue / operating-margin chart, scoped to your entities" },
  signal: { src: "/showcase/xray-calls.png", alt: "X-ray panel — the live Supabase call stream across the session" },
}

const STATIONS: { n: string; title: string; lead: string; code: string; kind: Kind }[] = [
  {
    n: "01", title: "Ingest, transformed", kind: "pipeline",
    lead: "Messy spreadsheets land, get validated, z-score-screened for anomalies, then loaded — a Deno worker and Postgres do the real work. Nothing simulated.",
    code: sliceFrom(dbSrc, "update public.ingest_queue", 7),
  },
  {
    n: "02", title: "Isolated by row", kind: "rls",
    lead: "One query, different rows per role. Tenant isolation is enforced in the database with row-level security — not patched on in the client.",
    code: sliceStatement(rlsSrc, "create policy entities_select"),
  },
  {
    n: "03", title: "Observable, live", kind: "signal",
    lead: "Every call, pipeline event and policy streams into the X-ray panel as it fires. The backend runs in the open — no black boxes.",
    code: sliceFrom(instrSrc, "xrayCollector.record", 7),
  },
]

const draw = {
  initial: { pathLength: 0, opacity: 0 },
  whileInView: { pathLength: 1, opacity: 1 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 1, ease: [0.22, 0.7, 0.2, 1] as const },
}

function Accent({ kind }: { kind: Kind }) {
  const common = "h-12 w-28 shrink-0 text-accent"
  if (kind === "pipeline") {
    return (
      <svg viewBox="0 0 112 48" fill="none" className={common} stroke="currentColor">
        <motion.path d="M6 24 H46" strokeWidth="1.5" {...draw} />
        <motion.path d="M62 24 H100 M92 18 L100 24 L92 30" strokeWidth="1.5" {...draw} transition={{ ...draw.transition, delay: 0.15 }} />
        {[[6, 24], [54, 24], [106, 24]].map(([cx, cy], i) => (
          <motion.circle key={i} cx={cx} cy={cy} r="5" fill="currentColor" fillOpacity="0.5" stroke="currentColor"
            initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.1 }} />
        ))}
      </svg>
    )
  }
  if (kind === "rls") {
    return (
      <svg viewBox="0 0 112 48" fill="none" className={common} stroke="currentColor">
        {[6, 18, 30].map((y, i) => (
          <motion.rect key={i} x="6" y={y} width="70" height="9" rx="2" strokeWidth="1.4"
            initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.12 }} />
        ))}
        <motion.path d="M90 24 v-4 a6 6 0 0 1 12 0 v4" strokeWidth="1.4" {...draw} transition={{ ...draw.transition, delay: 0.2 }} />
        <motion.rect x="86" y="24" width="20" height="16" rx="2" fill="currentColor" fillOpacity="0.18" strokeWidth="1.4"
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.45 }} />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 112 48" fill="none" className={common} stroke="currentColor">
      <motion.path d="M4 38 L24 28 L40 32 L60 14 L78 22 L96 8 L108 18" strokeWidth="1.6" {...draw} />
      <motion.circle cx="108" cy="18" r="3.5" fill="currentColor"
        initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.9 }} />
    </svg>
  )
}

export function Showcase() {
  return (
    <section>
      <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">What it does</span>
      <h2 className="display mt-3 max-w-3xl text-4xl uppercase tracking-tight md:text-5xl lg:text-6xl">
        Three things, done at the data layer.
      </h2>

      <div className="mt-14 md:mt-20">
        {STATIONS.map((s, i) => (
          <div key={s.n} className="grid grid-cols-[auto_1fr] gap-6 pb-14 last:pb-0 md:gap-10 md:pb-24">
            {/* Rail — node + drawing spine segment. */}
            <div className="flex flex-col items-center pt-1.5">
              <span className="size-3.5 rounded-full bg-accent ring-4 ring-accent/15" />
              {i < STATIONS.length - 1 && (
                <motion.span initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                  className="mt-3 w-px flex-1 origin-top bg-gradient-to-b from-accent/70 via-accent/25 to-transparent" />
              )}
            </div>

            {/* Content — text + framed product screenshot. */}
            <div className="grid items-center gap-8 pb-2 lg:grid-cols-2 lg:gap-14">
              <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, ease: [0.22, 0.7, 0.2, 1] }}>
                <div className="display text-6xl leading-none text-accent md:text-7xl">{s.n}</div>
                <h3 className="display mt-2 text-3xl uppercase tracking-tight md:text-4xl">{s.title}</h3>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">{s.lead}</p>
                <div className="mt-6 flex items-center gap-4">
                  <Accent kind={s.kind} />
                  <pre className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-foreground/[0.03] px-3 py-2 font-mono text-[10px] leading-snug text-foreground/65">{s.code}</pre>
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 0.7, 0.2, 1] }}>
                <PanelShot src={SHOTS[s.kind].src} alt={SHOTS[s.kind].alt} />
              </motion.div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
