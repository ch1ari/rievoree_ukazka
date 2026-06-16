import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ScanLine, X } from "lucide-react"

/**
 * X-RAY MODE — a deliberate toggle (works on tap + click, not hover). On, the
 * page surface dims and a dark panel reveals the REAL code behind the app.
 *
 * Honesty: every snippet below is actual code from this repo (paths noted),
 * lightly trimmed for length — never invented. That's the whole "no black
 * boxes" point. Update these if the source changes.
 */
interface Snippet { label: string; lang: "ts" | "sql"; code: string }

const SNIPPETS: Snippet[] = [
  {
    label: "src/pages/Landing.tsx — this page",
    lang: "ts",
    code: `async function exploreDemo() {
  const { error } = await supabase.auth.signInWithPassword({
    email: "demo@demo.local", password: "demo123456",
  })
  if (!error) navigate({ to: "/dashboard" })
}`,
  },
  {
    label: "migration 11 — report_account_monthly (the report view)",
    lang: "sql",
    code: `create view public.report_account_monthly as
select m.entity_id, m.period, m.account_code,
       m.account_name, m.debit, m.credit, m.net
from private.mv_account_monthly m
where (select private.is_admin())
   or m.entity_id in (select private.my_entity_ids());`,
  },
  {
    label: "migration 1 — entities row-level security",
    lang: "sql",
    code: `create policy entities_select on public.entities
  for select to authenticated
  using (
    (select private.is_admin())
    or id in (select private.my_entity_ids())
  );`,
  },
  {
    label: "migration 14 — approve_batch (SECURITY DEFINER gate)",
    lang: "sql",
    code: `if not coalesce(
  (select private.is_admin())
  or ((select private.user_role()) = 'manager'
      and v_batch.entity_id in (select private.my_entity_ids())),
  false
) then
  raise exception 'not authorized …' using errcode = '42501';
end if;`,
  },
  {
    label: "worker/src/db.ts — atomic job claim",
    lang: "ts",
    code: `update public.ingest_queue q set status = 'processing'
 where q.id = (
   select id from public.ingest_queue
   where status = 'pending' and run_after <= now()
   order by run_after
   for update skip locked
   limit 1
 )
returning q.id, q.batch_id, q.job_type`,
  },
  {
    label: "migrations 16 + 17 — pg_cron refresh · pg_net → edge fn",
    lang: "sql",
    code: `select cron.schedule('refresh-report-mv', '* * * * *',
  $$ select private.refresh_report_mv(); $$);

perform net.http_post(url := v_url, body := payload,
  headers := jsonb_build_object('Authorization', 'Bearer …'));`,
  },
]

export function XrayMode() {
  const [on, setOn] = useState(false)

  return (
    <>
      {/* Toggle — floating, tap/click (not hover), reachable on mobile + desktop */}
      <button
        onClick={() => setOn((v) => !v)}
        aria-pressed={on}
        className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-foreground px-5 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-background shadow-soft transition hover:scale-[1.04] md:bottom-7 md:right-7"
      >
        <ScanLine className="size-4" strokeWidth={2.25} />
        {on ? "Exit x-ray" : "X-ray this page"}
      </button>

      <AnimatePresence>
        {on && (
          <motion.div
            className="dark fixed inset-0 z-50 overflow-y-auto bg-background/95 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="mx-auto max-w-5xl px-6 py-16 md:px-10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-accent">
                    X-ray · real code behind this page
                  </h2>
                  <p className="mt-2 max-w-xl font-mono text-xs text-muted-foreground">
                    Actual snippets from this repository — not a mock. This is the
                    machinery the landing talks about. No black boxes.
                  </p>
                </div>
                <button onClick={() => setOn(false)} aria-label="Exit x-ray"
                  className="rounded-full p-2 text-muted-foreground ring-1 ring-border transition hover:text-foreground">
                  <X className="size-5" />
                </button>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2">
                {SNIPPETS.map((s, i) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.05 + i * 0.06 }}
                    className="overflow-hidden rounded-2xl bg-card ring-1 ring-border"
                  >
                    <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                      <span className={s.lang === "sql" ? "text-signal" : "text-accent"}>
                        {s.lang.toUpperCase()}
                      </span>
                      <span className="truncate">{s.label}</span>
                    </div>
                    <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-foreground/90">
                      <code>{s.code}</code>
                    </pre>
                  </motion.div>
                ))}
              </div>

              <p className="mt-8 text-center font-mono text-[11px] text-muted-foreground">
                Want the live version? Open the 🔬 X-ray panel inside the app —
                it streams these calls, policies and events for real.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
