import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { motion } from "motion/react"
import { supabase } from "@/lib/supabase"
import { XrayScan } from "@/components/XrayScan"
import { PageTear } from "@/components/PageTear"
import { useXray } from "@/components/XrayContext"
import { CountUp } from "@/components/CountUp"
import { Showcase } from "@/components/Showcase"
import { TearFrame, TearDefs } from "@/components/TearFrame"

// TODO(mariia): replace with your real links before deploy.
const GITHUB_URL = "https://github.com/your-handle/xray-reporting-engine"
const CV_URL = "https://your-portfolio.example/cv"

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

const SUBLINE =
  "A financial reporting engine: messy spreadsheets in, validated and anomaly-screened reports out. Built backend-first — row-level security, a real ETL pipeline and scheduled jobs — and you can watch every layer work."

// Big hero numbers — REAL figures from the demo dataset (seeded sandbox). No
// invented statistics: if it isn't a real figure, it isn't here.
const STATS: { value: number; label: string; format?: (n: number) => string; accent?: boolean }[] = [
  { value: 3_058_957, format: (n) => `€${(n / 1e6).toFixed(2)}M`, label: "processed · total debit", accent: true },
  { value: 936, label: "account-months" },
  { value: 4, label: "entities · RLS-scoped" },
  { value: 18, label: "monthly periods" },
]

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
    <div>
      {/* Shared torn-edge filter for every TearFrame on the page (rendered once). */}
      <TearDefs />
      <XrayScan>
      {/* 1 — Hero: bold dark editorial. Oversized square headline + pitch + CTAs
          anchored LEFT; RIGHT holds a fixed, quietly pulsing rip in the freed
          space, exposing the real machinery. Big REAL numbers sit below. */}
      <section className="overflow-x-clip px-6 pb-20 pt-14 md:px-12 md:pt-20 lg:px-16">
        <div className="mx-auto max-w-[2400px]">
          {/* Split hero — headline + pitch + CTA LEFT; a torn hole in the paper
              RIGHT, filling the freed space and exposing the dark machinery. */}
          <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
            {/* No max-width cap here — the oversized "MACHINERY" headline must use
                the full left column so it never wraps mid-word. The pitch, CTAs and
                note below carry their own narrower caps for readability. */}
            <div className="min-w-0">
              {/* #region xray */}
              <h1 className="display uppercase text-foreground">
                <span className="block overflow-hidden pb-[0.06em]">
                  <motion.span className="block text-[clamp(1.25rem,3.2vw,2.75rem)]" initial={{ y: "120%" }} animate={{ y: 0 }}
                    transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 0.7, 0.2, 1] }}>
                    See the
                  </motion.span>
                </span>
                <span className="block overflow-hidden pb-[0.04em]">
                  {/* Per-letter reveal — each glyph slides up on load (masked by the
                      overflow-hidden line). reducedMotion="user" disables it. */}
                  <span className="stencil ignite block text-[clamp(2.25rem,7.5vw,9rem)] leading-[0.85] text-accent" aria-label="Machinery">
                    {"Machinery".split("").map((ch, i) => (
                      <motion.span key={i} className="inline-block" aria-hidden initial={{ y: "120%" }} animate={{ y: 0 }}
                        transition={{ duration: 0.7, delay: 0.18 + i * 0.045, ease: [0.22, 0.7, 0.2, 1] }}>
                        {ch}
                      </motion.span>
                    ))}
                  </span>
                </span>
                <span className="block overflow-hidden pb-[0.08em]">
                  <motion.span className="block text-[clamp(1.4rem,4.5vw,4rem)]" initial={{ y: "120%" }} animate={{ y: 0 }}
                    transition={{ duration: 0.6, delay: 0.34, ease: [0.22, 0.7, 0.2, 1] }}>
                    of your finance
                  </motion.span>
                </span>
              </h1>
              {/* #endregion */}

              <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.5 }}
                className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
                {SUBLINE}
              </motion.p>

              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.5 }}
                className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button onClick={exploreDemo} disabled={exploring}
                  className="rounded-md bg-accent px-8 py-4 font-mono text-sm font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110 disabled:opacity-60">
                  {exploring ? "Entering…" : "Explore the demo"}
                </button>
                <Link to="/register"
                  className="rounded-md border border-border px-8 py-4 text-center font-mono text-sm font-bold uppercase tracking-widest text-foreground transition hover:border-accent hover:text-accent">
                  Sign up
                </Link>
              </motion.div>

              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
                className="mt-5 max-w-md font-mono text-xs leading-relaxed text-muted-foreground">
                <span className="text-signal">Read-only sandbox</span> — nothing you do is saved. The torn hole beside this breathes live source — an RLS policy, the report view, the worker beneath. <span className="text-foreground">Click it to x-ray the page.</span>
              </motion.p>
            </div>

            {/* RIGHT — the paper torn open at the page's right edge; the dark
                machinery glows through. Negative right margin cancels the section
                padding so the tear bleeds to the viewport edge (anchored, not a
                floating square). The whole hole is CLICKABLE → full-page X-ray. */}
            <motion.div className="min-w-0 -mr-6 md:-mr-12 lg:-mr-16" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}>
              <PageTear />
            </motion.div>
          </div>

          {/* Big real numbers — the demo dataset, count-up on load. */}
          <div className="mt-16 grid grid-cols-2 border-t border-border md:mt-24 md:grid-cols-4">
            {STATS.map((s, i) => (
              <motion.div key={s.label}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.5 + i * 0.1 }}
                className="border-b border-border py-7 pr-4 md:border-b-0 md:border-l md:px-8 md:first:border-l-0 md:first:pl-0">
                <div className={`display text-5xl md:text-6xl lg:text-7xl ${s.accent ? "text-accent glow-accent" : "text-foreground"}`}>
                  <CountUp value={s.value} format={s.format} delay={0.5 + i * 0.1} />
                </div>
                <div className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[2400px] space-y-28 px-6 py-24 md:space-y-36 md:px-12 md:py-28 lg:px-16">
        {/* 2 — What it does: product-screenshot timeline (Showcase) */}
        <Showcase />

        {/* 3 — Architecture: a request, assembled down the stack on scroll */}
        <section>
          <SectionHead eyebrow="Architecture" title="Follow one request down the stack."
            intro="Four layers, each doing real work. Scroll to assemble them — then x-ray any page in the demo to watch a request actually cross them." />
          <div className="mt-12">
            {ARCH.map((a, i) => (
              <motion.div key={a.layer}
                initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: i * 0.1, ease: "easeOut" }}>
                <div className="group flex flex-col gap-4 rounded-[1.5rem] border border-border p-6 transition-colors hover:border-foreground/45 hover:bg-foreground/[0.04] lg:flex-row lg:items-center lg:gap-8 lg:p-7">
                  <div className="flex items-center gap-4 lg:w-64 lg:shrink-0">
                    <span className="font-mono text-sm text-foreground/55 transition-transform group-hover:scale-125">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-lg font-semibold lg:text-xl">{a.layer}</span>
                  </div>
                  <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{a.detail}</p>
                  <span className="shrink-0 self-start rounded-full border border-border px-3 py-1.5 font-mono text-xs text-foreground/70 transition-colors group-hover:border-foreground/45 lg:self-auto">{a.tag}</span>
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
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {STACK.map((s) => (
              <span key={s} className="rounded-full border border-border px-3 py-1.5 font-mono text-xs text-foreground/75 transition-colors hover:border-foreground hover:bg-foreground hover:text-background">{s}</span>
            ))}
          </div>
        </section>

        {/* 4 — X-ray panel teaser (dark console band) */}
        <section>
          <SectionHead eyebrow="X-ray panel" title="The backend runs in the open."
            intro="Every page in the demo carries a live console — the same seam, three lenses on what just ran." />
          {/* The console itself shows THROUGH a rip in the lime paper — the dark
              machinery beneath the surface, not a flat green card. */}
          <Reveal className="mt-12">
            <TearFrame panel>
              <div className="px-8 py-8 md:px-14 md:py-11">
                <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  <span className="size-2 animate-pulse rounded-full bg-accent" /> X-ray panel · live on every page in the demo
                </div>
                <div className="mt-7 grid gap-px overflow-hidden rounded-xl bg-border/40 md:grid-cols-3">
                  {TABS.map((t) => (
                    <div key={t.k} className="bg-background p-6 transition-colors hover:bg-foreground/[0.04]">
                      <div className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">{t.k}</div>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.d}</p>
                      <div className="mt-5 truncate rounded-lg border border-border px-3 py-2.5 font-mono text-[11px] text-foreground/70">{t.line}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-7">
                  <PanelXrayButton />
                </div>
              </div>
            </TearFrame>
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
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="rounded-full border border-border px-8 py-4 text-center text-base font-semibold text-foreground transition hover:border-foreground/55 hover:bg-foreground/[0.04]">
                Read the source ↗
              </a>
            </div>
          </Reveal>

          <Reveal>
            <div className="rounded-[1.75rem] border border-border p-8">
              <h3 className="text-xl font-semibold">Keep me posted <span className="text-muted-foreground">(optional)</span></h3>
              {sent ? (
                <p className="mt-3 font-medium text-foreground">Thanks — noted.</p>
              ) : (
                <form onSubmit={submitEmail} className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                    className="flex-1 rounded-full border border-border bg-foreground/[0.04] px-5 py-3 text-sm text-foreground placeholder:text-foreground/40 outline-none transition focus:border-foreground/60" />
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

/** Fires the full-page X-ray editor (the in-place VS Code reveal of this page's
 *  own source). Lives here, inside <XrayScan>, so it reads the shared toggle —
 *  it's the entry point the deleted hero "X-ray this page" button used to be. */
function PanelXrayButton() {
  const { toggle } = useXray()
  return (
    <button onClick={toggle}
      className="rounded-full bg-accent px-7 py-3.5 text-sm font-semibold text-accent-foreground transition hover:scale-[1.03]">
      X-ray this page →
    </button>
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
