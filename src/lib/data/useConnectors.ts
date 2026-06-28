import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"

export type ConnectorKind = "gdrive" | "webhook"
export type ConnectorStatus = "pending_auth" | "active" | "paused" | "error"

export interface Connector {
  id: string
  entity_id: string
  owner_id: string
  kind: ConnectorKind
  name: string
  status: ConnectorStatus
  config: Record<string, unknown>
  cursor: string | null
  last_sync_at: string | null
  last_error: string | null
  created_at: string
}

/** Connectors visible to the caller (RLS: managers/admins of the entity). */
export function useConnectors() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["connectors", user?.id ?? "anon"],
    enabled: Boolean(user),
    refetchInterval: 5000,
    queryFn: async (): Promise<Connector[]> => {
      const { data, error } = await supabase
        .from("connectors")
        .select("id,entity_id,owner_id,kind,name,status,config,cursor,last_sync_at,last_error,created_at")
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as Connector[]
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ["connectors"] })
    qc.invalidateQueries({ queryKey: ["ingest_batches"] })
  }
}

export interface CreateConnectorResult {
  id: string
  kind: ConnectorKind
  status: ConnectorStatus
  webhook_secret: string | null
}

export function useCreateConnector() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { entityId: string; kind: ConnectorKind; name: string; config?: Record<string, unknown> }) => {
      const { data, error } = await supabase.rpc("create_connector", {
        p_entity_id: v.entityId, p_kind: v.kind, p_name: v.name, p_config: v.config ?? {},
      })
      if (error) throw new Error(error.message)
      return data as CreateConnectorResult
    },
    onSuccess: invalidate,
  })
}

export function useRenameConnector() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { id: string; name: string }) => {
      const { error } = await supabase.rpc("rename_connector", { p_id: v.id, p_name: v.name })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

export function useSetConnectorStatus() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { id: string; status: "active" | "paused" }) => {
      const { error } = await supabase.rpc("set_connector_status", { p_id: v.id, p_status: v.status })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

export function useDeleteConnector() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_connector", { p_id: id })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

export function useRotateSecret() {
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const { data, error } = await supabase.rpc("rotate_webhook_secret", { p_id: id })
      if (error) throw new Error(error.message)
      return (data as { webhook_secret: string }).webhook_secret
    },
  })
}

/** Kick a one-off Drive sync ("Sync now"). */
export function useSyncConnector() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("connector-sync", {
        body: { connector_id: id },
      })
      if (error) throw new Error(await fnError(error))
      return data as { status: string; ingested: unknown[]; skipped: number }
    },
    onSuccess: invalidate,
  })
}

/** Begin the Google Drive OAuth flow → redirect the browser to Google's consent. */
export async function startDriveOAuth(connectorId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke("connector-oauth", {
    body: { action: "start", connector_id: connectorId },
  })
  if (error) return { error: await fnError(error) }
  const url = (data as { url?: string })?.url
  if (!url) return { error: "no consent url returned" }
  window.location.href = url
  return { error: null }
}

/** The public webhook endpoint for a connector (what the third party POSTs to). */
export function webhookUrl(connectorId: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "")
  return `${base}/functions/v1/connector-webhook?id=${connectorId}`
}

/** Read a Supabase FunctionsHttpError's JSON body for a human message. */
async function fnError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.json()
      if (body?.message) return String(body.message)
      if (body?.error) return String(body.error)
    } catch { /* not JSON */ }
  }
  return error instanceof Error ? error.message : "request failed"
}
