import { useState } from "react"
import { ScanLine } from "lucide-react"
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
          className="gap-2 rounded-full font-mono text-xs"
          aria-label="Open X-ray panel"
        >
          <ScanLine className="size-3.5" strokeWidth={2.25} />
          X-RAY
          {events.length > 0 && (
            <Badge className="rounded-full bg-accent px-2 text-accent-foreground">
              {events.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="dark flex w-full flex-col gap-0 overflow-hidden rounded-l-[1.5rem] bg-background p-0 text-foreground shadow-soft ring-1 ring-white/10 sm:max-w-xl">
        <SheetHeader className="gap-1 border-b border-border px-5 py-5">
          <SheetTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <ScanLine className="size-4 text-accent" strokeWidth={2.25} />
            X-RAY<span className="bg-gradient-to-r from-accent to-signal bg-clip-text text-transparent">/</span>
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">
            The backend, made visible — calls, pipeline, and RLS, live.
          </SheetDescription>
        </SheetHeader>

        {/* Tab bar — rounded pills, accent tint on active; scrolls on narrow widths. */}
        <div
          role="tablist"
          aria-label="X-ray sections"
          className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-4 py-2.5"
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
                  "rounded-full px-3 py-1.5 font-mono text-xs uppercase tracking-widest whitespace-nowrap transition-colors",
                  active
                    ? "bg-accent/20 text-foreground"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
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
