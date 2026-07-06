import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { RefreshCw, ScanLine, HardDrive, Cable, ShieldCheck, Scale, Check } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The behind-the-scenes ETL chain a connector runs, as a live animated strip.
 * Purely visual — the REAL work is the SQL/edge pipeline; this makes it visible.
 * Bump `playKey` (e.g. on "Simulate sync") to replay the light-up sweep.
 */
const STAGES = [
  { key: "poll", label: "Poll source", sub: "Drive Changes API", Icon: RefreshCw },
  { key: "discover", label: "Discover file", sub: "new / changed", Icon: ScanLine },
  { key: "download", label: "Download", sub: "stream bytes", Icon: HardDrive },
  { key: "queue", label: "Queue", sub: "ingest_queue", Icon: Cable },
  { key: "validate", label: "Validate", sub: "rules + accounts", Icon: ShieldCheck },
  { key: "zscore", label: "Z-score", sub: "anomaly scan", Icon: Scale },
  { key: "review", label: "Review", sub: "awaiting_review", Icon: Check },
] as const

const STEP_MS = 420

export function ConnectorPipeline({ playKey, running }: { playKey: number; running?: boolean }) {
  const [active, setActive] = useState(-1)

  useEffect(() => {
    if (playKey <= 0) return
    setActive(0)
    const timers = STAGES.map((_, i) => setTimeout(() => setActive(i), i * STEP_MS))
    const done = setTimeout(() => setActive(STAGES.length + 1), STAGES.length * STEP_MS + 600)
    return () => { timers.forEach(clearTimeout); clearTimeout(done) }
  }, [playKey])

  const finished = active >= STAGES.length

  return (
    <div className="mt-4 rounded-xl border border-border bg-background/50 p-4">
      <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", running || (active >= 0 && !finished) ? "animate-pulse bg-accent" : "bg-muted-foreground/40")} />
        Behind the scenes {finished && <span className="text-accent">· done</span>}
      </div>

      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {STAGES.map((s, i) => {
          const state = active === i && !finished ? "active" : active > i || finished ? "past" : "idle"
          return (
            <div key={s.key} className="flex items-center gap-1">
              <motion.div
                animate={{
                  scale: state === "active" ? 1.06 : 1,
                  opacity: state === "idle" ? 0.45 : 1,
                }}
                transition={{ duration: 0.25 }}
                className={cn(
                  "flex min-w-[92px] flex-col items-center gap-1.5 rounded-lg border px-2.5 py-3 text-center",
                  state === "active" && "border-accent bg-accent/10 shadow-[0_0_0_3px] shadow-accent/15",
                  state === "past" && "border-accent/40 bg-accent/[0.05]",
                  state === "idle" && "border-border",
                )}
              >
                <span className={cn(
                  "grid size-7 place-items-center rounded-md",
                  state === "idle" ? "bg-secondary text-muted-foreground" : "bg-accent/15 text-accent",
                )}>
                  <s.Icon className={cn("size-3.5", state === "active" && "animate-pulse")} />
                </span>
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider leading-none">{s.label}</span>
                <span className="font-mono text-[9px] leading-none text-muted-foreground">{s.sub}</span>
              </motion.div>
              {i < STAGES.length - 1 && (
                <div className="relative h-0.5 w-4 shrink-0 overflow-hidden rounded-full bg-border">
                  <motion.div
                    className="absolute inset-0 bg-accent"
                    initial={{ scaleX: 0, originX: 0 }}
                    animate={{ scaleX: active > i || finished ? 1 : 0 }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
