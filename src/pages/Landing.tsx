import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { motion } from "motion/react"
import { Workflow, ShieldCheck, ScanLine } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { OrbsBackground } from "@/components/OrbsBackground"
import { XrayScan } from "@/components/XrayScan"
import { HeroXray } from "@/components/HeroXray"

// TODO(mariia): replace with your real links before deploy.
const GITHUB_URL = "https://github.com/your-handle/xray-reporting-engine"
const CV_URL = "https://your-portfolio.example/cv"

const VALUE = [
  { k: "Ingest, transformed", Icon: Workflow, tint: "from-accent to-cold",
    d: "Spreadsheets land, get validated, z-score-screened for anomalies, then loaded — a Deno worker and Postgres do the real work. Nothing simulated." },
  { k: "Isolated by row", Icon: ShieldCheck, tint: "from-signal to-accent",
    d: "One query, different rows per role. Tenant isolation is enforced in the database with RLS — not patched on in the client." },
  { k: "Observable, live", Icon: ScanLine, tint: "from-cold to-signal",
    d: "An X-ray panel streams every call, pipeline event and policy as it fires. The backend runs in the open — no black boxes." },
]
const STACK = ["React 19", "TypeScript", "Vite", "Tailwind v4", "TanStack", "recharts", "Supabase", "Postgres", "Edge / Deno", "Docker", "pg_cron", "pg_net", "RLS"]
const ARCH = [
  { layer: "Browser", detail: "React 19 reaches Postgres through one instrumented fetch — the seam the X-ray panel taps.", tag: "instrumentedFetch.ts" },
  { layer: "Edge / Deno", detail: "Validated ingest and review notifications run as Deno edge functions.", tag: "ingest-submit · notify-review" },
  { layer: "Postgres", detail: "Row-level security, trigger chains, scheduled refresh and HTTP callbacks all live in the database.", tag: "RLS · pg_cron · pg_net" },
  { layer: "Docker worker", detail: "A containerised Deno service drains the ingest queue with atomic, skip-locked claims.", tag: "for update skip locked" },
]
const TABS = [
  { k: "Calls", d: "Every Supabase call, timed at the fetch seam.", line: "GET report_account_monthly · 200 · 41 ms" },
  { k: "Pipeline", d: "A realtime timeline of each ingest job and trigger as it fires.", line: "queued → processing → loaded · batch #1184" },
  { k: "RLS", d: "The same query, run as three identities — different rows each time.", line: "admin 42 rows · manager 12 · viewer 0" },
]

const HEADLINE = ["See", "the", "machinery"]
const SUBLINE =
  "A financial reporting engine: messy spreadsheets in, validated and anomaly-screened reports out. Built backend-first — row-level security, a real ETL pipeline and scheduled jobs — and you can watch every layer work."

export function Landing() {
  const navigate = useNavigate()
  const [exploring, setExploring] = useState(false)
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)

  // #region xray
  async function exploreDemo() {
    setExploring(true)
    const { error } = await supabase.auth.signInWithPassword({ email: "demo@demo.local", password: "demo123456" })
    if (error) { setExploring(false); return }
    navigate({ to: "/dashboard" })
  }
  // #endregion
  async function submitEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    await supabase.from("leads").insert({ email, source: "landing" })
    setSent(true); setEmail("")
  }

  return (
    <div className="-mx-6 -my-16">
      <OrbsBackground />

      <XrayScan>
      {/* 1 — Hero: wide two-column. Left = pitch, right = LIVE x-ray window. */}
      <section className="px-6 pb-16 pt-16 md:px-12 md:pt-20 lg:px-16">
        <div className="mx-auto grid max-w-[1600px] items-center gap-12 lg:grid-cols-[5fr_6fr] lg:gap-16">
          {/* Left — pitch */}
          <div className="max-w-2xl">
            <motion.span initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-2 rounded-full bg-card/85 px-4 py-1.5 text-sm font-medium text-accent shadow-soft ring-1 ring-border backdrop-blur">
              <span className="size-2 animate-pulse rounded-full bg-accent" /> Financial reporting engine
            </motion.span>

            {/* Full animated gradient headline — word reveal + shimmer on "machinery." */}
            {/* #region xray */}
            <h1 className="mt-6 flex flex-wrap gap-x-4 text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl xl:text-8xl">
              {HEADLINE.map((w, i) => (
                <motion.span key={w}
                  initial={{ opacity: 0, y: 28, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.6, delay: 0.1 + i * 0.12, ease: "easeOut" }}
                  className={i === HEADLINE.length - 1
                    ? "animate-shimmer bg-[linear-gradient(110deg,var(--color-accent),35%,var(--color-cold),50%,var(--color-signal),70%,var(--color-accent))] bg-[length:200%_100%] bg-clip-text text-transparent"
                    : ""}>
                  {w}{i === HEADLINE.length - 1 ? "." : ""}
                </motion.span>
              ))}
            </h1>
            {/* #endregion */}

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-foreground/75">
              {SUBLINE.split(" ").map((w, i) => (
                <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.5 + i * 0.022 }}>{w}{" "}</motion.span>
              ))}
            </p>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0, duration: 0.5 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button onClick={exploreDemo} disabled={exploring} className="rounded-full bg-accent px-8 py-4 text-base font-semibold text-accent-foreground shadow-soft transition hover:scale-[1.03] disabled:opacity-60">
                {exploring ? "Entering…" : "Explore the demo"}
              </button>
              <Link to="/login" className="rounded-full bg-card px-8 py-4 text-center text-base font-semibold text-foreground shadow-soft ring-1 ring-border transition hover:ring-accent/40">
                Sign up
              </Link>
            </motion.div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} className="mt-4 max-w-md text-sm text-foreground/65">
              <span className="rounded-full bg-signal/15 px-2 py-0.5 font-medium text-signal">Read-only sandbox</span>{" "}
              — nothing you do is saved. Jump into the demo, or see how it's built in the panel on the right.
            </motion.p>
          </div>

          {/* Right — live x-ray window (the star). */}
          <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.35, ease: "easeOut" }}>
            <HeroXray />
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] space-y-28 px-6 py-24 md:space-y-36 md:px-12 md:py-28 lg:px-16">
        {/* 2 — What it does */}
        <section>
          <SectionHead eyebrow="What it does" title="Three things, done at the data layer." />
          <div className="mt-12 grid gap-6 md:grid-cols-3 lg:gap-8">
            {VALUE.map((v, i) => (
              <motion.div key={v.k}
                initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay: i * 0.12, ease: "easeOut" }} whileHover={{ y: -8 }}
                className="group relative overflow-hidden rounded-[1.75rem] bg-card p-8 shadow-soft ring-1 ring-border lg:p-9">
                <div className={`pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-gradient-to-br ${v.tint} opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-45`} />
                <div className={`relative inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br ${v.tint} text-white shadow-soft transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110`}>
                  <v.Icon className="size-7" strokeWidth={2.25} />
                </div>
                <div className="relative mt-6 flex items-baseline gap-2.5">
                  <span className="font-mono text-sm text-accent">0{i + 1}</span>
                  <h3 className="text-xl font-semibold lg:text-2xl">{v.k}</h3>
                </div>
                <p className="relative mt-3 text-[15px] leading-relaxed text-muted-foreground">{v.d}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* 3 — Architecture: a request, assembled down the stack on scroll */}
        <section>
          <SectionHead eyebrow="Architecture" title="Follow one request down the stack."
            intro="Four layers, each doing real work. Scroll to assemble them — then x-ray any page in the demo to watch a request actually cross them." />
          <div className="mt-12 lg:mx-auto lg:max-w-5xl">
            {ARCH.map((a, i) => (
              <motion.div key={a.layer}
                initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: i * 0.1, ease: "easeOut" }}>
                <div className="group flex flex-col gap-4 rounded-[1.5rem] bg-card p-6 shadow-soft ring-1 ring-border transition-colors hover:bg-secondary lg:flex-row lg:items-center lg:gap-8 lg:p-7">
                  <div className="flex items-center gap-4 lg:w-64 lg:shrink-0">
                    <span className="font-mono text-sm text-accent transition-transform group-hover:scale-125">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-lg font-semibold lg:text-xl">{a.layer}</span>
                  </div>
                  <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{a.detail}</p>
                  <span className="shrink-0 self-start rounded-full bg-secondary px-3 py-1.5 font-mono text-xs text-foreground/70 ring-1 ring-border transition-colors group-hover:bg-card lg:self-auto">{a.tag}</span>
                </div>
                {i < ARCH.length - 1 && (
                  <div className="ml-9 flex h-9 items-center lg:ml-[2.1rem]">
                    <span className="h-full w-px bg-border" />
                    <span className="-ml-[3px] size-1.5 self-end rounded-full bg-accent/60" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-2 lg:mx-auto lg:max-w-5xl">
            {STACK.map((s) => (
              <span key={s} className="rounded-full bg-secondary px-3 py-1.5 font-mono text-xs text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-accent-foreground hover:ring-accent">{s}</span>
            ))}
          </div>
        </section>

        {/* 4 — X-ray panel teaser (dark console band) */}
        <section>
          <SectionHead eyebrow="X-ray panel" title="The backend runs in the open."
            intro="Every page in the demo carries a live console — the same seam, three lenses on what just ran." />
          <Reveal className="mt-12">
            <motion.div whileHover={{ y: -4 }}
              className="overflow-hidden rounded-[1.75rem] bg-[#1e1e1e] shadow-soft ring-1 ring-white/10">
              <div className="flex items-center gap-2 border-b border-white/10 px-6 py-4 font-mono text-xs text-white/55">
                <span className="size-2 animate-pulse rounded-full bg-accent" /> X-ray panel · live on every page in the demo
              </div>
              <div className="grid gap-px bg-white/10 md:grid-cols-3">
                {TABS.map((t) => (
                  <div key={t.k} className="bg-[#1e1e1e] p-7 transition-colors hover:bg-white/[0.04]">
                    <div className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">{t.k}</div>
                    <p className="mt-3 text-sm leading-relaxed text-white/60">{t.d}</p>
                    <div className="mt-5 truncate rounded-xl bg-white/[0.05] px-3 py-2.5 font-mono text-[11px] text-white/45">{t.line}</div>
                  </div>
                ))}
              </div>
              <div className="px-6 py-6">
                <button onClick={exploreDemo} disabled={exploring}
                  className="rounded-full bg-accent px-7 py-3.5 text-sm font-semibold text-accent-foreground transition hover:scale-[1.03] disabled:opacity-60">
                  {exploring ? "Entering…" : "See it live →"}
                </button>
              </div>
            </motion.div>
          </Reveal>
        </section>

        {/* 5 — Closing CTA + optional email */}
        <section className="grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-20">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Open it. It's a read-only sandbox.</h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              Sign in as the demo user and click around — nothing you do is saved. Every page shows its own machinery as you go.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button onClick={exploreDemo} disabled={exploring} className="rounded-full bg-accent px-8 py-4 text-base font-semibold text-accent-foreground shadow-soft transition hover:scale-[1.03] disabled:opacity-60">
                {exploring ? "Entering…" : "Explore the demo"}
              </button>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="rounded-full bg-card px-8 py-4 text-center text-base font-semibold text-foreground shadow-soft ring-1 ring-border transition hover:ring-accent/40">
                Read the source ↗
              </a>
            </div>
          </Reveal>

          <Reveal>
            <div className="rounded-[1.75rem] bg-card p-8 shadow-soft ring-1 ring-border">
              <h3 className="text-xl font-semibold">Keep me posted <span className="text-muted-foreground">(optional)</span></h3>
              {sent ? (
                <p className="mt-3 font-medium text-signal">Thanks — noted.</p>
              ) : (
                <form onSubmit={submitEmail} className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                    className="flex-1 rounded-full bg-background px-5 py-3 text-sm ring-1 ring-border outline-none transition focus:ring-2 focus:ring-accent/50" />
                  <button type="submit" className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition hover:scale-[1.03]">Notify me</button>
                </form>
              )}
              <p className="mt-3 text-xs text-muted-foreground">No account, no spam — just an email if you want updates.</p>
            </div>
          </Reveal>
        </section>

        {/* 6 — Footer */}
        <Reveal className="flex flex-wrap items-center gap-6 border-t border-border pt-10 text-sm">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="font-medium text-muted-foreground hover:text-accent">GitHub ↗</a>
          <a href={CV_URL} target="_blank" rel="noreferrer" className="font-medium text-muted-foreground hover:text-accent">CV / Portfolio ↗</a>
          <span className="ml-auto font-mono text-xs text-muted-foreground">Fake data only</span>
        </Reveal>
      </div>
      </XrayScan>
    </div>
  )
}

function Reveal({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <motion.section className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.5, ease: "easeOut" }}>
      {children}
    </motion.section>
  )
}

function SectionHead({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return (
    <Reveal>
      <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">{eyebrow}</span>
      <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl lg:text-[2.75rem] lg:leading-[1.05]">{title}</h2>
      {intro && <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{intro}</p>}
    </Reveal>
  )
}
