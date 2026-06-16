import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"

// TODO(mariia): replace with your real links before deploy.
const GITHUB_URL = "https://github.com/your-handle/xray-reporting-engine"
const CV_URL = "https://your-portfolio.example/cv"

const VALUE = [
  {
    k: "Real ETL",
    d: "CSV/XLSX → validate → z-score anomaly check → delete-and-reload. A Deno worker and Postgres do the work; nothing is faked.",
  },
  {
    k: "RLS multi-tenant",
    d: "The same query returns different rows per role. Tenant isolation lives in the database, not the client.",
  },
  {
    k: "X-ray visibility",
    d: "A live panel on every page shows the calls, the pipeline events, the RLS policies and where each layer runs.",
  },
]

const STACK = [
  "React 19", "TypeScript", "Vite", "Tailwind v4", "TanStack Router/Query",
  "recharts", "Supabase", "Postgres", "Edge Functions (Deno)", "Docker worker",
  "pg_cron", "pg_net", "RLS",
]

const ARCH = [
  { layer: "Browser", detail: "React + instrumented fetch (the X-ray seam)" },
  { layer: "Edge / Deno", detail: "ingest-submit · notify-review" },
  { layer: "Postgres", detail: "RLS · trigger chains · pg_cron · pg_net" },
  { layer: "Docker worker", detail: "consumes the ingest queue" },
]

export function Landing() {
  const navigate = useNavigate()
  const [exploring, setExploring] = useState(false)
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)

  async function exploreDemo() {
    setExploring(true)
    // Anonymous sandbox = sign in as the read-only demo identity (viewer role →
    // write is rejected at the database, not just hidden). Through the one seam.
    const { error } = await supabase.auth.signInWithPassword({
      email: "demo@demo.local",
      password: "demo123456",
    })
    if (error) {
      setExploring(false)
      return
    }
    navigate({ to: "/dashboard" })
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    // Soft + non-blocking: fire-and-forget, never gate the demo on it.
    await supabase.from("leads").insert({ email, source: "landing" })
    setSent(true)
    setEmail("")
  }

  return (
    <div className="space-y-28 pb-16">
      {/* 1 — Hero */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <p className="font-mono text-sm uppercase tracking-[0.3em] text-accent">
          Full-stack portfolio · financial reporting engine
        </p>
        <h1 className="mt-6 text-7xl font-bold leading-[0.95] tracking-tighter md:text-8xl">
          See the
          <br />
          machinery.
        </h1>
        <p className="mt-8 max-w-2xl text-xl text-muted-foreground">
          A multi-tenant ETL pipeline — CSV in, anomaly-checked reports out — with
          an X-ray panel on every page that shows the backend doing the work:
          API calls, RLS policies, trigger chains and async jobs, live.
        </p>
        <div className="mt-12 flex flex-wrap items-center gap-4">
          <Button size="lg" className="text-base" disabled={exploring} onClick={exploreDemo}>
            {exploring ? "Entering…" : "Explore the demo"}
          </Button>
          <Button asChild size="lg" variant="outline" className="text-base">
            <Link to="/login">Sign up</Link>
          </Button>
        </div>
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Demo is an anonymous, read-only sandbox — nothing you do is saved. Sign
          up for your own tenant to upload real data.
        </p>
      </motion.section>

      {/* 2 — Value prop */}
      <section className="grid gap-px border border-border bg-border md:grid-cols-3">
        {VALUE.map((v) => (
          <div key={v.k} className="bg-background p-6">
            <h2 className="font-mono text-sm uppercase tracking-widest text-accent">{v.k}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{v.d}</p>
          </div>
        ))}
      </section>

      {/* 3 — Architecture / stack */}
      <section>
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Architecture
        </h2>
        <div className="mt-4 space-y-px border border-border bg-border">
          {ARCH.map((a, i) => (
            <div key={a.layer} className="flex items-baseline gap-4 bg-background px-5 py-4">
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="w-40 shrink-0 font-mono text-sm font-bold">{a.layer}</span>
              <span className="font-mono text-xs text-muted-foreground">{a.detail}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {STACK.map((s) => (
            <span key={s} className="border border-border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* 4 — Demo preview */}
      <section className="border border-border">
        <div className="border-b border-border px-5 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          🔬 X-ray panel · live on every page
        </div>
        <div className="grid gap-px bg-border md:grid-cols-3">
          {["CALLS — timed at the fetch seam", "PIPELINE — Realtime event timeline", "RLS — same query, three identities"].map((t) => (
            <div key={t} className="bg-background p-5 font-mono text-xs text-muted-foreground">
              {t}
            </div>
          ))}
        </div>
        <div className="border-t border-border p-5">
          <Button variant="outline" disabled={exploring} onClick={exploreDemo} className="font-mono text-sm">
            {exploring ? "Entering…" : "See it live →"}
          </Button>
        </div>
      </section>

      {/* 5 — Soft email capture (optional, never blocks) */}
      <section className="max-w-xl">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Keep me posted <span className="normal-case">(optional)</span>
        </h2>
        {sent ? (
          <p className="mt-3 font-mono text-sm text-accent">Thanks — noted.</p>
        ) : (
          <form onSubmit={submitEmail} className="mt-3 flex gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="font-mono"
            />
            <Button type="submit" variant="outline" className="font-mono">
              Notify me
            </Button>
          </form>
        )}
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          No account, no spam — just an email if you want updates. Totally optional.
        </p>
      </section>

      {/* 6 — Footer links */}
      <footer className="flex flex-wrap gap-6 border-t border-border pt-8 font-mono text-xs uppercase tracking-widest">
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
          GitHub ↗
        </a>
        <a href={CV_URL} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
          CV / Portfolio ↗
        </a>
        <span className="ml-auto text-muted-foreground">Fake data only</span>
      </footer>
    </div>
  )
}
