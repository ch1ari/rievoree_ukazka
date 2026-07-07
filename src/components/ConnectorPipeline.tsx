import { useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { RefreshCw, ScanLine, HardDrive, Cable, ShieldCheck, Scale, Check, ArrowRight, ArrowLeft, Sparkles, PartyPopper } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ConnectorContactForm } from "@/components/ConnectorContactForm"

/**
 * A GUIDED, click-through walkthrough of the connector's ETL chain. The user
 * advances step by step (no auto-play); at each stage the app "explains" what it
 * would do. The last step invites them to run a live demo or request real access.
 */
const STAGES = [
  { label: "Poll", Icon: RefreshCw },
  { label: "Discover", Icon: ScanLine },
  { label: "Download", Icon: HardDrive },
  { label: "Queue", Icon: Cable },
  { label: "Validate", Icon: ShieldCheck },
  { label: "Z-score", Icon: Scale },
  { label: "Review", Icon: Check },
] as const

const SCRIPT: { title: string; body: string }[] = [
  { title: "Poll Google Drive",
    body: "First I ask Drive's Changes API what changed since my last sync — using a saved page token, so I never re-scan your whole Drive. It survives restarts." },
  { title: "Discover a file",
    body: "A new CSV or Google Sheet appears in the folder I watch. I claim it exactly once, so re-running a sync never double-imports the same file." },
  { title: "Download it",
    body: "I stream the file down with your authorized token and read it server-side — the browser never touches your Drive credentials." },
  { title: "Queue the job",
    body: "I drop a job into the ingest queue. It's decoupled on purpose: a big backlog drains steadily and never blocks the app." },
  { title: "Validate every row",
    body: "Each row is checked against your rules and matched to your chart of accounts. Anything off is flagged with a reason — never silently dropped." },
  { title: "Scan for anomalies",
    body: "I compare each account's month to its own history (a z-score) and flag statistical outliers before anything reaches your books." },
  { title: "Wait for review",
    body: "The batch lands in ‘awaiting review’. A manager approves it, then only the clean rows load. Nothing ever auto-posts." },
]

export function ConnectorPipeline({
  onRunDemo, running, ranFile,
}: {
  onRunDemo?: () => void
  running?: boolean
  ranFile?: string | null
}) {
  // -1 = intro, 0..6 = stages, 7 = outro
  const [step, setStep] = useState(-1)
  const total = SCRIPT.length
  const atIntro = step === -1
  const atOutro = step >= total
  const nodeActive = atOutro ? total : step

  return (
    <div className="mt-4 rounded-xl border border-border bg-background/50 p-4">
      <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <Sparkles className="size-3.5 text-accent" />
        Guided walkthrough
        {!atIntro && <span className="ml-auto text-foreground/50">{atOutro ? "done" : `step ${step + 1} / ${total}`}</span>}
      </div>

      {/* Mini pipeline diagram — highlights the current stage */}
      <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
        {STAGES.map((s, i) => {
          const state = i === nodeActive && !atOutro ? "active" : i < nodeActive || atOutro ? "past" : "idle"
          return (
            <div key={s.label} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setStep(i)}
                className={cn(
                  "flex min-w-[76px] flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center transition",
                  state === "active" && "border-accent bg-accent/10 shadow-[0_0_0_3px] shadow-accent/15",
                  state === "past" && "border-accent/40 bg-accent/[0.05]",
                  state === "idle" && "border-border opacity-50 hover:opacity-80",
                )}
              >
                <span className={cn("grid size-6 place-items-center rounded-md",
                  state === "idle" ? "bg-secondary text-muted-foreground" : "bg-accent/15 text-accent")}>
                  <s.Icon className="size-3.5" />
                </span>
                <span className="font-mono text-[9px] font-semibold uppercase tracking-wider leading-none">{s.label}</span>
              </button>
              {i < STAGES.length - 1 && (
                <div className="relative h-0.5 w-3 shrink-0 overflow-hidden rounded-full bg-border">
                  <motion.div className="absolute inset-0 bg-accent" initial={false}
                    animate={{ scaleX: i < nodeActive || atOutro ? 1 : 0, originX: 0 }} transition={{ duration: 0.3 }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* The app "talking" — changes per step */}
      <div className="mt-3 min-h-[104px] rounded-lg border border-border bg-card p-4">
        <AnimatePresence mode="wait">
          {atIntro ? (
            <motion.div key="intro" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <p className="text-sm leading-relaxed text-foreground">
                👋 Want to see how the Google Drive connector works? I'll walk you through it step by step —
                click <span className="font-semibold text-accent">Start</span> and go at your own pace.
              </p>
            </motion.div>
          ) : atOutro ? (
            <motion.div key="outro" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <PartyPopper className="size-4 text-accent" /> That's the whole flow.
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Everything you just saw is real code. You can run it right now on fake data, or — if you'd like to
                connect your <span className="text-foreground">own</span> Google Drive — leave your email and I'll set you up.
              </p>
            </motion.div>
          ) : (
            <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-accent">{SCRIPT[step].title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{SCRIPT[step].body}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!atIntro && (
          <Button size="xs" variant="ghost" className="font-mono text-[10px]"
            onClick={() => setStep((s) => Math.max(-1, s - 1))}>
            <ArrowLeft className="size-3.5" /> Back
          </Button>
        )}
        {atIntro && (
          <Button size="xs" className="font-mono text-[10px]" onClick={() => setStep(0)}>
            Start <ArrowRight className="size-3.5" />
          </Button>
        )}
        {!atIntro && !atOutro && (
          <Button size="xs" className="font-mono text-[10px]" onClick={() => setStep((s) => s + 1)}>
            {step === total - 1 ? "Finish" : "Next"} <ArrowRight className="size-3.5" />
          </Button>
        )}
        {!atIntro && (
          <Button size="xs" variant="ghost" className="ml-auto font-mono text-[10px]" onClick={() => setStep(-1)}>
            Restart
          </Button>
        )}
      </div>

      {/* Outro: run live demo + request real access */}
      {atOutro && (
        <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Run it live (fake data)</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Push a synthetic file through the real pipeline and watch the batch appear on Ingest.
            </p>
            {onRunDemo && (
              <Button size="xs" className="mt-2.5 font-mono text-[10px]" disabled={running} onClick={onRunDemo}>
                <Sparkles className="size-3.5" /> {running ? "Running…" : "Run demo now"}
              </Button>
            )}
            {ranFile && <p className="mt-2 font-mono text-[11px] text-accent">✓ {ranFile} pushed through — see Ingest.</p>}
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Try it with your own Drive</p>
            <p className="mt-1.5 mb-2.5 text-xs leading-relaxed text-muted-foreground">
              Leave your email and I'll grant you real access to test it.
            </p>
            <ConnectorContactForm source="gdrive-real-access" />
          </div>
        </div>
      )}
    </div>
  )
}
