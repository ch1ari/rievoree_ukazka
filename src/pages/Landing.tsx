import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { motion } from "motion/react"
import { Workflow, ShieldCheck, ScanLine } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { CursorGlow } from "@/components/CursorGlow"

// TODO(mariia): replace with your real links before deploy.
const GITHUB_URL = "https://github.com/your-handle/xray-reporting-engine"
const CV_URL = "https://your-portfolio.example/cv"

const VALUE = [
  { k: "Ingest, transformed", Icon: Workflow, tint: "from-accent to-amber-400",
    d: "Spreadsheets land, get validated, z-score-screened for anomalies, then loaded — a Deno worker and Postgres do the real work. Nothing simulated." },
  { k: "Isolated by row", Icon: ShieldCheck, tint: "from-signal to-emerald-400",
    d: "One query, different rows per role. Tenant isolation is enforced in the database with RLS — not patched on in the client." },
  { k: "Observable, live", Icon: ScanLine, tint: "from-amber-400 to-accent",
    d: "An X-ray panel streams every call, pipeline event and policy as it fires. The backend runs in the open — no black boxes." },
]
const STACK = ["React 19", "TypeScript", "Vite", "Tailwind v4", "TanStack", "recharts", "Supabase", "Postgres", "Edge / Deno", "Docker", "pg_cron", "pg_net", "RLS"]
const ARCH = [
  { layer: "Browser", detail: "React + instrumented fetch (the X-ray seam)" },
  { layer: "Edge / Deno", detail: "ingest-submit · notify-review" },
  { layer: "Postgres", detail: "RLS · trigger chains · pg_cron · pg_net" },
  { layer: "Docker worker", detail: "consumes the ingest queue" },
]

const HEADLINE = ["See", "the", "machinery"]
const SUBLINE =
  "Raw spreadsheets in. Validated, anomaly-screened reports out — and a live X-ray of every query, policy and job as it runs. No black boxes."

export function Landing() {
  const navigate = useNavigate()
  const [exploring, setExploring] = useState(false)
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)

  async function exploreDemo() {
    setExploring(true)
    const { error } = await supabase.auth.signInWithPassword({ email: "demo@demo.local", password: "demo123456" })
    if (error) { setExploring(false); return }
    navigate({ to: "/dashboard" })
  }
  async function submitEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    await supabase.from("leads").insert({ email, source: "landing" })
    setSent(true); setEmail("")
  }

  return (
    <div className="-mx-6 -my-16">
      {/* 1 — Hero */}
      <section className="relative overflow-hidden bg-background px-6 pb-24 pt-24 md:px-16 md:pb-32 md:pt-28">
        <CursorGlow intensity="rich" />

        <div className="relative mx-auto max-w-5xl">
          <motion.span
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 rounded-full bg-card/80 px-4 py-1.5 text-sm font-medium text-accent shadow-soft ring-1 ring-border backdrop-blur"
          >
            <span className="size-2 animate-pulse rounded-full bg-accent" /> Financial reporting engine
          </motion.span>

          {/* Headline — word-by-word reveal + shimmer on the accent word */}
          <h1 className="mt-7 flex flex-wrap gap-x-4 text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
            {HEADLINE.map((w, i) => (
              <motion.span
                key={w}
                initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.6, delay: 0.1 + i * 0.12, ease: "easeOut" }}
                className={i === HEADLINE.length - 1
                  ? "animate-shimmer bg-[linear-gradient(110deg,var(--color-accent),45%,var(--color-signal),60%,var(--color-accent))] bg-[length:200%_100%] bg-clip-text text-transparent"
                  : ""}
              >
                {w}{i === HEADLINE.length - 1 ? "." : ""}
              </motion.span>
            ))}
          </h1>

          {/* Subline — staggered word fade-in */}
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
            {SUBLINE.split(" ").map((w, i) => (
              <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.5 + i * 0.022 }}>
                {w}{" "}
              </motion.span>
            ))}
          </p>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.5 }}
            className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button onClick={exploreDemo} disabled={exploring} className="rounded-full bg-accent px-8 py-4 text-base font-semibold text-accent-foreground shadow-soft transition hover:scale-[1.03] disabled:opacity-60">
              {exploring ? "Entering…" : "Explore the demo"}
            </button>
            <Link to="/login" className="rounded-full bg-card px-8 py-4 text-center text-base font-semibold text-foreground ring-1 ring-border transition hover:ring-accent/40">
              Sign up
            </Link>
          </motion.div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }} className="mt-4 max-w-md text-sm text-muted-foreground">
            <span className="rounded-full bg-signal/15 px-2 py-0.5 font-medium text-signal">Read-only sandbox</span>{" "}
            — nothing you do is saved. Sign up for your own tenant to upload real data.
          </motion.p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-24 px-6 py-24 md:px-16">
        {/* 2 — Value prop: animated, interactive cards */}
        <Reveal>
          <div className="grid gap-5 md:grid-cols-3">
            {VALUE.map((v, i) => (
              <motion.div
                key={v.k}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.12, ease: "easeOut" }}
                whileHover={{ y: -6 }}
                className="group relative overflow-hidden rounded-3xl bg-card p-7 shadow-soft ring-1 ring-border"
              >
                {/* hover wash */}
                <div className={`pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-gradient-to-br ${v.tint} opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-40`} />
                <div className={`relative inline-flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br ${v.tint} text-white shadow-soft transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110`}>
                  <v.Icon className="size-6" strokeWidth={2.25} />
                </div>
                <div className="relative mt-5 flex items-baseline gap-2">
                  <span className="font-mono text-xs text-accent">0{i + 1}</span>
                  <h2 className="text-xl font-semibold">{v.k}</h2>
                </div>
                <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">{v.d}</p>
              </motion.div>
            ))}
          </div>
        </Reveal>

        {/* 3 — Architecture / stack */}
        <Reveal>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Architecture</h2>
          <div className="mt-5 overflow-hidden rounded-3xl bg-card shadow-soft ring-1 ring-border">
            {ARCH.map((a, i) => (
              <div key={a.layer} className="flex items-baseline gap-4 px-6 py-4 not-last:border-b not-last:border-border">
                <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, "0")}</span>
                <span className="w-40 shrink-0 font-semibold">{a.layer}</span>
                <span className="font-mono text-xs text-muted-foreground">{a.detail}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {STACK.map((s) => (
              <span key={s} className="rounded-full bg-secondary px-3 py-1 font-mono text-xs text-muted-foreground">{s}</span>
            ))}
          </div>
        </Reveal>

        {/* 4 — Demo preview */}
        <Reveal className="overflow-hidden rounded-3xl bg-card shadow-soft ring-1 ring-border">
          <div className="flex items-center gap-2 border-b border-border px-6 py-4 font-mono text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-accent" /> 🔬 X-ray panel · live on every page
          </div>
          <div className="grid gap-px bg-border md:grid-cols-3">
            {["CALLS — timed at the fetch seam", "PIPELINE — Realtime event timeline", "RLS — same query, three identities"].map((t) => (
              <div key={t} className="bg-card p-6 font-mono text-xs text-muted-foreground">{t}</div>
            ))}
          </div>
          <div className="px-6 py-5">
            <button onClick={exploreDemo} disabled={exploring} className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition hover:scale-[1.03]">
              {exploring ? "Entering…" : "See it live →"}
            </button>
          </div>
        </Reveal>

        {/* 5 — Soft email capture (optional) */}
        <Reveal className="max-w-xl">
          <h2 className="text-xl font-semibold">Keep me posted <span className="text-muted-foreground">(optional)</span></h2>
          {sent ? (
            <p className="mt-3 font-medium text-signal">Thanks — noted.</p>
          ) : (
            <form onSubmit={submitEmail} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                className="flex-1 rounded-full bg-card px-5 py-3 text-sm ring-1 ring-border outline-none focus:ring-accent/50" />
              <button type="submit" className="rounded-full bg-card px-6 py-3 text-sm font-semibold ring-1 ring-border transition hover:ring-accent/40">Notify me</button>
            </form>
          )}
          <p className="mt-2 text-xs text-muted-foreground">No account, no spam — just an email if you want updates. Totally optional.</p>
        </Reveal>

        {/* 6 — Footer */}
        <Reveal className="flex flex-wrap items-center gap-6 border-t border-border pt-8 text-sm">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="font-medium text-muted-foreground hover:text-accent">GitHub ↗</a>
          <a href={CV_URL} target="_blank" rel="noreferrer" className="font-medium text-muted-foreground hover:text-accent">CV / Portfolio ↗</a>
          <span className="ml-auto font-mono text-xs text-muted-foreground">Fake data only</span>
        </Reveal>
      </div>
    </div>
  )
}

/** Scroll-reveal wrapper — one shared fade+rise. */
function Reveal({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <motion.section className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.5, ease: "easeOut" }}>
      {children}
    </motion.section>
  )
}
