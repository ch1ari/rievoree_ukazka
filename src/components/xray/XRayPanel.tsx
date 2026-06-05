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
import { useXRayEvents } from "@/lib/xray/useXRayEvents"
import { xrayCollector } from "@/lib/xray/collector"

/**
 * X-ray panel shell (Phase 1c): dark console listing live instrumented
 * calls with timings. Phase 4 turns this into the full exhibit — RLS
 * explanations, SQL/EXPLAIN, security layers, architecture diagram.
 */
export function XRayPanel() {
  const events = useXRayEvents()
  const [open, setOpen] = useState(false)

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
      <SheetContent className="dark w-full border-l border-border bg-background text-foreground sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm uppercase tracking-widest">
            🔬 X-ray — live backend calls
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">
            Every Supabase request on this page, timed at the fetch layer.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-1 overflow-y-auto px-4 pb-4 font-mono text-xs">
          {events.length === 0 ? (
            <p className="text-muted-foreground">
              No backend calls yet. Navigate or load data and watch this
              stream. (Pages start calling the API in Phase 2.)
            </p>
          ) : (
            events
              .slice()
              .reverse()
              .map((e) => (
                <div
                  key={e.id}
                  className="flex items-baseline justify-between gap-3 border-b border-border py-1.5"
                >
                  <span className="truncate">
                    <span className="text-accent">{e.kind}</span>{" "}
                    <span className="text-muted-foreground">{e.method}</span>{" "}
                    {e.target}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <span
                      className={
                        e.status >= 200 && e.status < 300
                          ? "text-muted-foreground"
                          : "text-destructive"
                      }
                    >
                      {e.status === -1 ? "ERR" : e.status}
                    </span>{" "}
                    {e.durationMs}ms
                  </span>
                </div>
              ))
          )}
        </div>

        {events.length > 0 && (
          <div className="border-t border-border p-4">
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              onClick={() => xrayCollector.clear()}
            >
              Clear
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
