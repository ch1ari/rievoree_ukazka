import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { useXRayEvents } from "@/lib/xray/useXRayEvents"
import { CallsTab } from "./tabs/CallsTab"
import { PipelineTab } from "./tabs/PipelineTab"
import { RlsTab } from "./tabs/RlsTab"
import { SqlTab } from "./tabs/SqlTab"
import { ArchTab } from "./tabs/ArchTab"

/**
 * X-ray panel — the exhibit that makes the backend visible. A dark console
 * drawer with three sections (Phase 4):
 *   CALLS    — live fetch-layer stream (seam)
 *   PIPELINE — live pipeline_events timeline (Realtime)
 *   RLS      — "same query, three identities" demonstration
 * SQL/EXPLAIN + ARCH diagram land later as nice-to-haves.
 */
const TABS = [
  { id: "calls", label: "Calls" },
  { id: "pipeline", label: "Pipeline" },
  { id: "rls", label: "RLS" },
  { id: "sql", label: "SQL" },
  { id: "arch", label: "Arch" },
] as const

type TabId = (typeof TABS)[number]["id"]

export function XRayPanel() {
  const events = useXRayEvents()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<TabId>("calls")

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 font-mono text-xs"
          aria-label="Open X-ray panel"
        >
          <span aria-hidden>🔬</span>
          X-RAY
          {events.length > 0 && (
            <Badge className="bg-accent px-1.5 text-accent-foreground">
              {events.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="dark flex w-full flex-col gap-0 border-l border-border bg-background p-0 text-foreground sm:max-w-xl">
        <SheetHeader className="gap-1 border-b border-border px-4 py-4">
          <SheetTitle className="font-mono text-sm font-bold uppercase tracking-widest">
            🔬 X-RAY<span className="text-accent">/</span>
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">
            The backend, made visible — calls, pipeline, and RLS, live.
          </SheetDescription>
        </SheetHeader>

        {/* Tab bar — mono uppercase, accent underline on active (matches nav). */}
        <div
          role="tablist"
          aria-label="X-ray sections"
          className="flex shrink-0 items-center gap-6 border-b border-border px-4"
        >
          {TABS.map((t) => {
            const active = t.id === tab
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "-mb-px border-b-2 py-2.5 font-mono text-xs uppercase tracking-widest transition-colors",
                  active
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === "calls" && <CallsTab />}
          {tab === "pipeline" && <PipelineTab />}
          {tab === "rls" && <RlsTab />}
          {tab === "sql" && <SqlTab />}
          {tab === "arch" && <ArchTab />}
        </div>
      </SheetContent>
    </Sheet>
  )
}
