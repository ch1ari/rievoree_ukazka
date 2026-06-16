import { useEffect, useRef, useState, type ReactNode } from "react"
import { animate } from "motion/react"
import { ScanLine } from "lucide-react"

/**
 * X-RAY SCAN — an in-place radiograph of THIS page (landing only). Tapping the
 * toggle sweeps a scan line down the page; everywhere it passes, the colourful
 * surface is clipped away to reveal the dark "skeleton" beneath — the real code
 * that powers the app. Toggle again and the scan retracts to normal. It's a
 * transformation of the same surface, not navigation to another screen.
 *
 * Mechanics / performance:
 *   - one CSS var `--scan` (0→1) animated via motion's animate() straight on the
 *     DOM node — no React re-render per frame.
 *   - surface uses clip-path inset(top) driven by --scan (GPU-composited).
 *   - the machinery layer sits BEHIND the surface, in place, so revealing reads
 *     as "x-rayed this page", not an overlay document.
 *   - prefers-reduced-motion → instant cross-fade, no sweeping motion.
 *
 * Honesty: machinery snippets are REAL code from this repo (paths noted), not a
 * mock. Scope: this heavy effect is the landing showcase only.
 */
interface Snippet { label: string; lang: "ts" | "sql"; code: string }

const SNIPPETS: Snippet[] = [
  { label: "src/pages/Landing.tsx — this page", lang: "ts",
    code: `async function exploreDemo() {
  const { error } = await supabase.auth.signInWithPassword({
    email: "demo@demo.local", password: "demo123456",
  })
  if (!error) navigate({ to: "/dashboard" })
}` },
  { label: "migration 11 — report_account_monthly (report view)", lang: "sql",
    code: `create view public.report_account_monthly as
select m.entity_id, m.period, m.account_code,
       m.account_name, m.debit, m.credit, m.net
from private.mv_account_monthly m
where (select private.is_admin())
   or m.entity_id in (select private.my_entity_ids());` },
  { label: "migration 1 — entities row-level security", lang: "sql",
    code: `create policy entities_select on public.entities
  for select to authenticated
  using (
    (select private.is_admin())
    or id in (select private.my_entity_ids())
  );` },
  { label: "migration 14 — approve_batch (SECURITY DEFINER gate)", lang: "sql",
    code: `if not coalesce(
  (select private.is_admin())
  or ((select private.user_role()) = 'manager'
      and v_batch.entity_id in (select private.my_entity_ids())),
  false
) then
  raise exception 'not authorized …' using errcode = '42501';
end if;` },
  { label: "worker/src/db.ts — atomic job claim", lang: "ts",
    code: `update public.ingest_queue q set status = 'processing'
 where q.id = (
   select id from public.ingest_queue
   where status = 'pending' and run_after <= now()
   order by run_after
   for update skip locked
   limit 1
 )
returning q.id, q.batch_id, q.job_type` },
  { label: "migrations 16 + 17 — pg_cron refresh · pg_net → edge fn", lang: "sql",
    code: `select cron.schedule('refresh-report-mv', '* * * * *',
  $$ select private.refresh_report_mv(); $$);

perform net.http_post(url := v_url, body := payload,
  headers := jsonb_build_object('Authorization', 'Bearer …'));` },
]

export function XrayScan({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const controls = animate(
      el,
      { "--scan": on ? 1 : 0 },
      reduce ? { duration: 0 } : { duration: 0.95, ease: [0.45, 0, 0.2, 1] },
    )
    el.dataset.on = on ? "true" : "false"
    return () => controls.stop()
  }, [on])

  return (
    <div ref={root} className="xray-scan relative" style={{ ["--scan" as string]: 0 }}>
      {/* Machinery skeleton — behind the surface, revealed top-down by the scan */}
      <div aria-hidden className="xray-machinery-clip absolute inset-0 -z-10 bg-[oklch(0.17_0.02_265)]">
        <div className="bg-blueprint absolute inset-0 opacity-25" />
        <div className="dark relative mx-auto max-w-5xl px-6 py-24 md:px-16">
          <p className="font-mono text-sm font-bold uppercase tracking-widest text-accent">
            X-ray · real code behind this page
          </p>
          <p className="mt-2 max-w-xl font-mono text-xs text-emerald-300/70">
            Actual snippets from this repository — not a mock. The machinery the
            landing talks about. No black boxes.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {SNIPPETS.map((s) => (
              <div key={s.label} className="overflow-hidden rounded-2xl bg-[oklch(0.22_0.02_265)] ring-1 ring-white/10">
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 font-mono text-[11px] text-white/50">
                  <span className={s.lang === "sql" ? "text-signal" : "text-accent"}>{s.lang.toUpperCase()}</span>
                  <span className="truncate">{s.label}</span>
                </div>
                <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-emerald-100/85">
                  <code>{s.code}</code>
                </pre>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Surface — clipped away top-down as the scan passes */}
      <div className="xray-surface-clip relative z-0">{children}</div>

      {/* Scan line on the reveal edge */}
      <div aria-hidden className="xray-scanline" />

      {/* Toggle — tap/click, mobile + desktop */}
      <button
        onClick={() => setOn((v) => !v)}
        aria-pressed={on}
        className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-foreground px-5 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-background shadow-soft transition hover:scale-[1.04] md:bottom-7 md:right-7"
      >
        <ScanLine className="size-4" strokeWidth={2.25} />
        {on ? "Exit x-ray" : "X-ray this page"}
      </button>
    </div>
  )
}
