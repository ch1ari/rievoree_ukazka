import { useMemo } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { useReport } from "@/lib/data/useReport"
import { LoadingNote, ErrorNote, EmptyNote } from "@/components/StateNote"

const eur = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
})

export function Dashboard() {
  const { data: rows, isLoading, error } = useReport()

  const kpi = useMemo(() => {
    const r = rows ?? []
    return {
      entities: new Set(r.map((x) => x.entity_id)).size,
      periods: new Set(r.map((x) => x.period)).size,
      accountMonths: r.length,
      debit: r.reduce((s, x) => s + Number(x.debit), 0),
      credit: r.reduce((s, x) => s + Number(x.credit), 0),
      net: r.reduce((s, x) => s + Number(x.net), 0),
    }
  }, [rows])

  const byType = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of rows ?? []) {
      m.set(x.account_type, (m.get(x.account_type) ?? 0) + Number(x.net))
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  const kpis = [
    { label: "Entities (RLS scope)", value: String(kpi.entities), accent: true },
    { label: "Periods", value: String(kpi.periods) },
    { label: "Account-months", value: kpi.accountMonths.toLocaleString("en") },
    { label: "Net", value: eur.format(kpi.net) },
    { label: "Total debit", value: eur.format(kpi.debit) },
    { label: "Total credit", value: eur.format(kpi.credit) },
  ]

  return (
    <div className="relative">
      <motion.header
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }}
        className="pb-10"
      >
        <h1 className="text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">Dashboard</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Live figures for the entities your role can see — RLS-filtered at the
          database. Inspect the query and policy in the X-ray panel.
        </p>
      </motion.header>

      <div>
        {isLoading ? (
          <LoadingNote label="loading report…" />
        ) : error ? (
          <ErrorNote message={error.message} />
        ) : (rows?.length ?? 0) === 0 ? (
          <EmptyNote
            title="No report data for your entities"
            hint="Once a batch is approved and loaded, figures appear here. Try the Ingest page."
          />
        ) : (
          <div className="space-y-12">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:gap-5">
              {kpis.map((k, i) => (
                <motion.div key={k.label}
                  initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: i * 0.06, ease: "easeOut" }}>
                  <Kpi label={k.label} value={k.value} accent={k.accent} />
                </motion.div>
              ))}
            </div>

            <motion.section
              initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, ease: "easeOut" }}>
              <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Net by account type
              </h2>
              <div className="divide-y divide-border overflow-hidden rounded-[1.5rem] bg-card shadow-soft ring-1 ring-border">
                {byType.map(([type, net]) => (
                  <div key={type} className="flex items-baseline justify-between px-6 py-4 transition-colors hover:bg-secondary">
                    <span className="flex items-center gap-2.5 text-sm capitalize">
                      <span className={cn("size-1.5 rounded-full", net < 0 ? "bg-signal" : "bg-accent")} />
                      {type}
                    </span>
                    <span className="font-mono text-sm tabular-nums">{eur.format(net)}</span>
                  </div>
                ))}
              </div>
            </motion.section>
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={cn(
        "h-full rounded-2xl bg-card p-6 shadow-soft ring-1 ring-border transition-transform hover:-translate-y-1",
        accent && "ring-accent/30",
      )}
    >
      <div
        className={cn(
          "font-mono text-[10px] uppercase tracking-widest",
          accent ? "text-accent" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums sm:text-3xl lg:text-4xl">{value}</div>
    </div>
  )
}
