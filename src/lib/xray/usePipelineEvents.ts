import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

/**
 * public.pipeline_events row (migration 13). The visible backstage timeline:
 * the trigger chain / approve_batch / pg_cron / pg_net all emit here.
 */
export interface PipelineEvent {
  id: number
  entity_id: string
  batch_id: string | null
  stage: string
  detail: Record<string, unknown>
  duration_ms: number | null
  actor: string | null
  created_at: string
}

export type RealtimeStatus = "idle" | "subscribed" | "error"

/**
 * Live pipeline_events feed for the X-ray PIPELINE tab.
 *
 * Initial fetch (newest 50) + a Realtime postgres_changes subscription for
 * inserts, both over the ONE shared `supabase` client (never bypass the seam).
 * RLS applies to both: anon sees nothing, a manager sees only their entities,
 * admin sees all — so the feed mirrors whoever is signed in (the RLS tab).
 * Re-subscribes on auth changes so a demo "Run as…" sign-in re-authorizes the
 * channel with the new JWT.
 */
export function usePipelineEvents(): {
  events: PipelineEvent[]
  status: RealtimeStatus
  authed: boolean
  entityNames: Record<string, string>
} {
  const [events, setEvents] = useState<PipelineEvent[]>([])
  const [status, setStatus] = useState<RealtimeStatus>("idle")
  const [authed, setAuthed] = useState(false)
  const [entityNames, setEntityNames] = useState<Record<string, string>>({})
  // Bumped on every auth state change to force a fresh fetch + subscription.
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setEpoch((e) => e + 1)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (active) setAuthed(Boolean(data.session))
    })

    supabase
      .from("pipeline_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (active && data) setEvents(data as PipelineEvent[])
      })

    // Resolve entity_id → name (RLS-scoped: only the caller's entities), so the
    // timeline reads "Northwind Trading" instead of an opaque uuid prefix.
    supabase
      .from("entities")
      .select("id,name")
      .then(({ data }) => {
        if (!active || !data) return
        setEntityNames(
          Object.fromEntries(
            (data as { id: string; name: string }[]).map((e) => [e.id, e.name]),
          ),
        )
      })

    const channel = supabase
      .channel(`xray-pipeline-${epoch}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pipeline_events" },
        (payload) => {
          const row = payload.new as Partial<PipelineEvent> | undefined
          // Realtime payloads can arrive without the full row (RLS / replica
          // identity); only append a complete event, never crash the timeline.
          if (row && row.id != null && row.entity_id != null) {
            setEvents((cur) => [row as PipelineEvent, ...cur].slice(0, 100))
          } else {
            console.debug("[xray] incomplete realtime payload", payload)
          }
        },
      )
      .subscribe((s) => {
        if (!active) return
        if (s === "SUBSCRIBED") setStatus("subscribed")
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("error")
      })

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [epoch])

  return { events, status, authed, entityNames }
}
