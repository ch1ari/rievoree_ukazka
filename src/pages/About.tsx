import { motion } from "motion/react"
import { Link } from "@tanstack/react-router"

const STACK = ["React 19", "TypeScript", "Vite", "Tailwind v4", "TanStack", "recharts", "Supabase", "Postgres", "Edge / Deno", "Docker", "pg_cron", "pg_net", "RLS"]

// Real, vetted demo figures (same provenance as the landing — no invented numbers).
const FIGURES: [string, string][] = [
  ["€3.06M", "processed · total debit"],
  ["936", "account-months"],
  ["4", "entities · RLS-scoped"],
  ["18", "monthly periods"],
]

const LAYERS = [
  ["Browser", "React 19 reaches Postgres through one instrumented fetch — the seam the X-ray panel taps."],
  ["Edge / Deno", "Validated ingest and review notifications run as Deno edge functions."],
  ["Postgres", "Row-level security, trigger chains, scheduled refresh and HTTP callbacks live in the database."],
  ["Docker worker", "A containerised Deno service drains the ingest queue with atomic, skip-locked claims."],
]

export function About() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20 md:py-28">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">About</span>
        <h1 className="poster mt-3 text-[clamp(2rem,7.5vw,4.6rem)] leading-[0.88] text-foreground">
          A real backend, made visible.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          X-Ray is a financial reporting engine built backend-first: messy spreadsheets in,
          validated and anomaly-screened reports out — with row-level security, a real ETL
          pipeline, scheduled jobs, and a live X-ray of every layer. This site is the demo:
          explore it read-only, or create an account and land in a sample workspace.
        </p>
      </motion.div>

      <div className="mt-10 flex flex-wrap gap-2">
        {STACK.map((s, i) => (
          <motion.span key={s}
            initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.03 }}
            className="rounded-full border border-border px-3 py-1.5 font-mono text-xs text-foreground/75">
            {s}
          </motion.span>
        ))}
      </div>

      <div className="mt-12 grid grid-cols-2 gap-px border-t border-border pt-10 md:grid-cols-4">
        {FIGURES.map(([n, l]) => (
          <div key={l} className="py-2 pr-4">
            <div className="display text-4xl text-foreground md:text-5xl">{n}</div>
            <div className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>

      <div className="mt-14">
        <h2 className="poster text-[clamp(1.4rem,4vw,2.2rem)] text-foreground">Four layers, each doing real work.</h2>
        <div className="mt-6 space-y-3">
          {LAYERS.map(([layer, detail], i) => (
            <motion.div key={layer}
              initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="flex flex-col gap-2 rounded-2xl border border-border p-5 md:flex-row md:items-center md:gap-6">
              <span className="flex items-center gap-3 md:w-52 md:shrink-0">
                <span className="font-mono text-sm text-foreground/55">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-lg font-semibold">{layer}</span>
              </span>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{detail}</p>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="mt-14 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link to="/register" className="rounded-full bg-accent px-7 py-3.5 text-center text-sm font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110">
          Create account
        </Link>
        <Link to="/login" className="rounded-full border border-border px-7 py-3.5 text-center text-sm font-bold uppercase tracking-widest text-foreground transition hover:border-foreground/55">
          Sign in
        </Link>
      </div>

      <p className="mt-10 text-sm text-muted-foreground">
        Built by Capila. Source &amp; CV links are placeholders in this demo.
      </p>
    </section>
  )
}
