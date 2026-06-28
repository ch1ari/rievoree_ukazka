import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"

export interface Batch {
  id: string
  entity_id: string
  file_name: string
  period: string
  status: string
  stats: Record<string, unknown>
  error_summary: string | null
  created_at: string
}

const BUCKET = "ingest"

/**
 * The caller's ingest batches (RLS: manager+ of the entity). Polls while open so
 * a batch can be watched moving queued → processing → awaiting_review → loaded
 * as the worker and approve flow act on it.
 */
export function useBatches() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["ingest_batches", user?.id ?? "anon"],
    enabled: Boolean(user),
    refetchInterval: 2000,
    queryFn: async (): Promise<Batch[]> => {
      const { data, error } = await supabase
        .from("ingest_batches")
        .select("id,entity_id,file_name,period,status,stats,error_summary,created_at")
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as Batch[]
    },
  })
}

/**
 * The hybrid upload flow, all through the one supabase factory (→ seam):
 *   1) ingest-submit `create`  → signed upload URL (server owns the path)
 *   2) Storage uploadToSignedUrl → the file bytes go straight to Storage
 *   3) ingest-submit `finalize` → server hashes + calls submit_batch (the gate)
 *   4) process_uploaded_rows     → stage the client-parsed rows + run the real
 *      transform/z-score so the batch reaches awaiting_review with no worker.
 *      (Pass `rows` for CSV; omit for XLSX, which still needs the worker.)
 */
export function useUploadBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      entityId: string
      period: string
      file: File
      rows?: unknown[] | null
    }) => {
      const fileName = args.file.name

      const created = await supabase.functions.invoke("ingest-submit", {
        body: { action: "create", entity_id: args.entityId, file_name: fileName },
      })
      if (created.error) throw new Error(await humanize(created.error))
      const { object_key, storage_path, token } = created.data as {
        object_key: string
        storage_path: string
        token: string
      }

      const up = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(object_key, token, args.file)
      if (up.error) throw new Error(up.error.message)

      const finalized = await supabase.functions.invoke("ingest-submit", {
        body: {
          action: "finalize",
          entity_id: args.entityId,
          storage_path,
          file_name: fileName,
          period: args.period,
        },
      })
      if (finalized.error) {
        // A 409 "duplicate" is a non-2xx, so it lands here — but it's not a crash.
        // Read the body and surface it as a normal duplicate result.
        const body = await readBody(finalized.error)
        if (body?.status === "duplicate") {
          return { status: "duplicate", batch_id: body.batch_id as string | undefined }
        }
        throw new Error(body?.error ? String(body.error) : await humanize(finalized.error))
      }
      const result = finalized.data as { status?: string; batch_id?: string }

      // Stage + validate + z-score the parsed rows right away (no worker needed).
      if (result?.batch_id && result.status !== "duplicate" && args.rows && args.rows.length) {
        const { error } = await supabase.rpc("process_uploaded_rows", {
          p_batch_id: result.batch_id,
          p_rows: args.rows,
        })
        if (error) throw new Error(error.message)
      }
      return result
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ingest_batches"] })
    },
  })
}

/**
 * approve_batch RPC — manager/admin only. The SECURITY DEFINER coalesce gate is
 * the authoritative barrier; the UI also hides the button from viewers. On
 * success the report MV will refresh (pg_cron), so we invalidate report queries.
 */
export function useApproveBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (batchId: string) => {
      const { data, error } = await supabase.rpc("approve_batch", {
        p_batch_id: batchId,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ingest_batches"] })
      void qc.invalidateQueries({ queryKey: ["report_account_monthly"] })
    },
  })
}

/** Read the JSON body of a FunctionsHttpError's Response (the edge fn's payload),
 *  e.g. { status: "duplicate", batch_id } or { error: "..." }. */
async function readBody(error: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === "function") {
    try { return await ctx.json() } catch { /* not JSON */ }
  }
  return null
}

/** Human message from a FunctionsHttpError, preferring the server's JSON `error`. */
async function humanize(error: unknown): Promise<string> {
  const body = await readBody(error)
  if (body?.error) return String(body.error)
  return error instanceof Error ? error.message : "upload failed"
}

// ---- Batch detail: the staging rows behind a batch (why it did/didn't pass) ---
export interface StagingRowView {
  id: number
  row_num: number
  account_code: string | null
  txn_date: string | null
  description: string | null
  debit: number | null
  credit: number | null
  currency: string | null
  validation_errors: { field: string; error: string }[] | null
  is_anomaly: boolean
  anomaly_reason: string | null
  z_score: number | null
}

/** Rows of one batch (RLS: manager/admin of the entity can read journal_staging). */
export function useBatchRows(batchId: string | null) {
  return useQuery({
    queryKey: ["batch_rows", batchId ?? "none"],
    enabled: Boolean(batchId),
    queryFn: async (): Promise<StagingRowView[]> => {
      const { data, error } = await supabase
        .from("journal_staging")
        .select("id,row_num,account_code,txn_date,description,debit,credit,currency,validation_errors,is_anomaly,anomaly_reason,z_score")
        .eq("batch_id", batchId)
        .order("row_num")
      if (error) throw error
      return (data ?? []) as StagingRowView[]
    },
  })
}
