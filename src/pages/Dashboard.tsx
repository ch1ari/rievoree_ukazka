import { useMemo } from "react"
import { Card } from "@/components/ui/card"
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

  return (
    <div>
      <header className="border-b border-border pb-8">
        <h1 className="text-6xl font-bold tracking-tighter md:text-7xl">Dashboard</h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Live figures for the entities your role can see — RLS-filtered at the
          database. Inspect the query and policy in the X-ray panel.
        </p>
      </header>

      <div className="mt-10">
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
          <div className="space-y-10">
            <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-3">
              <Kpi label="Entities (RLS scope)" value={String(kpi.entities)} accent />
              <Kpi label="Periods" value={String(kpi.periods)} />
              <Kpi label="Account-months" value={kpi.accountMonths.toLocaleString("en")} />
              <Kpi label="Net" value={eur.format(kpi.net)} />
              <Kpi label="Total debit" value={eur.format(kpi.debit)} />
              <Kpi label="Total credit" value={eur.format(kpi.credit)} />
            </div>

            <section>
              <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Net by account type
              </h2>
              <div className="divide-y divide-border border border-border">
                {byType.map(([type, net]) => (
                  <div key={type} className="flex items-baseline justify-between px-4 py-2.5">
                    <span className="font-mono text-sm capitalize">{type}</span>
                    <span className="font-mono text-sm tabular-nums">{eur.format(net)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="rounded-none border-0 bg-background p-5 shadow-none">
      <div
        className={cn(
          "font-mono text-[10px] uppercase tracking-widest",
          accent ? "text-accent" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      <div className="mt-2 text-4xl font-bold tabular-nums">{value}</div>
    </Card>
  )
}
