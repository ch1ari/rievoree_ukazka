// ============================================================================
// Edge function: connector-sync   (verify_jwt = true)
//
// Pulls new files from a Google Drive connector and feeds them into the ETL.
// Two modes:
//
//   user mode  — POST { connector_id }  with the caller's JWT. The caller must
//                be able to SEE the connector (RLS), which is also "may manage".
//   cron mode  — POST { mode: "cron", connector_id }  with the SERVICE-ROLE
//                bearer (the pg_cron + pg_net job, migration 31). Authenticated
//                by a constant-time compare of the bearer to the service key.
//
// Either way we: refresh the access token, walk the Drive Changes feed from the
// stored page token (connectors.cursor — resumable), download each new CSV /
// Google Sheet, and call ingest_connector_rows (idempotent via connector_files).
// Then we persist the new page token so the next sync only sees newer changes.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2"
import { CORS, json, log, UUID_RE, timingSafeEqual, sha256Hex } from "../_shared/connectors.ts"
import {
  refreshAccessToken, getStartPageToken, listChanges, downloadAsCsv,
  isIngestableFile, isConfigured,
} from "../_shared/google.ts"
import { parseCsv, dominantPeriod } from "../_shared/connectors.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const COMPONENT = "connector-sync"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json(405, { error: "method not allowed" })
  if (!isConfigured()) return json(503, { error: "google_not_configured" })

  const authHeader = req.headers.get("Authorization") ?? ""
  const bearer = authHeader.replace(/^Bearer\s+/i, "")

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const connectorId = body?.connector_id
  if (typeof connectorId !== "string" || !UUID_RE.test(connectorId)) {
    return json(400, { error: "connector_id must be a uuid" })
  }
  const cronMode = body?.mode === "cron"

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ---- Authorize -----------------------------------------------------------
  if (cronMode) {
    // The cron job presents the service-role key; constant-time compare.
    if (!timingSafeEqual(bearer, SERVICE_ROLE_KEY)) {
      return json(401, { error: "unauthorized" })
    }
  } else {
    // User mode: RLS visibility IS the authorization (managers/admins of entity).
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user } } = await userClient.auth.getUser(bearer)
    if (!user) return json(401, { error: "unauthorized" })
    const { data: visible } = await userClient
      .from("connectors").select("id").eq("id", connectorId).maybeSingle()
    if (!visible) return json(403, { error: "not authorized for this connector" })
  }

  // ---- Load credentials (service role reads the secret columns) -------------
  const { data: conn, error: connErr } = await admin
    .from("connectors")
    .select("id, kind, status, cursor, config, oauth_refresh_token, entity_id, owner_id")
    .eq("id", connectorId)
    .maybeSingle()
  if (connErr || !conn) return json(404, { error: "connector not found" })
  if (conn.kind !== "gdrive") return json(400, { error: "only gdrive connectors sync" })
  if (conn.status === "paused") return json(409, { error: "connector is paused" })
  if (!conn.oauth_refresh_token) {
    return json(409, { error: "connector not authorized — connect Google Drive first" })
  }

  const folderId = (conn.config as Record<string, unknown> | null)?.folder_id as string | undefined

  try {
    const tokens = await refreshAccessToken(conn.oauth_refresh_token as string)
    const accessToken = tokens.access_token
    await admin.from("connectors").update({
      oauth_access_token: accessToken,
      oauth_expiry: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    }).eq("id", connectorId)

    let pageToken = (conn.cursor as string | null) ?? await getStartPageToken(accessToken)

    const ingested: { file: string; batch_id?: string; status?: string }[] = []
    let skipped = 0
    let newCursor = pageToken

    // Walk the Changes feed. Bounded: at most 10 pages per invocation so a huge
    // backlog drains across calls instead of timing out the edge function.
    for (let page = 0; page < 10; page++) {
      const res = await listChanges(accessToken, pageToken)

      for (const change of res.changes) {
        const f = change.file
        if (change.removed || !f || f.trashed) continue
        if (!isIngestableFile(f.mimeType, f.name)) { skipped++; continue }
        if (folderId && !(f.parents ?? []).includes(folderId)) { skipped++; continue }

        try {
          const csv = await downloadAsCsv(accessToken, f.id, f.mimeType)
          const rows = parseCsv(csv)
          if (!rows.length) { skipped++; continue }
          const period = dominantPeriod(rows) ?? new Date().toISOString().slice(0, 10)
          const { data, error } = await admin.rpc("ingest_connector_rows", {
            p_connector_id: connectorId,
            p_external_id: f.id,
            p_file_name: f.name,
            p_file_hash: await sha256Hex(csv),
            p_period: period,
            p_rows: rows,
          })
          if (error) { log(COMPONENT, "error", "ingest failed", { fileId: f.id, error: error.message }); skipped++; continue }
          const r = data as { status?: string; batch_id?: string }
          ingested.push({ file: f.name, batch_id: r?.batch_id, status: r?.status })
        } catch (e) {
          log(COMPONENT, "warn", "file skipped", { fileId: f.id, error: e instanceof Error ? e.message : String(e) })
          skipped++
        }
      }

      if (res.nextPageToken) { pageToken = res.nextPageToken; continue }
      newCursor = res.newStartPageToken ?? pageToken
      break
    }

    // Persist the resumable cursor + sync time.
    await admin.from("connectors").update({
      cursor: newCursor, last_sync_at: new Date().toISOString(), last_error: null,
    }).eq("id", connectorId)

    log(COMPONENT, "info", "sync complete", { connectorId, ingested: ingested.length, skipped, cronMode })
    return json(200, { status: "ok", ingested, skipped, cursor_advanced: newCursor !== conn.cursor })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(COMPONENT, "error", "sync failed", { connectorId, error: msg })
    await admin.rpc("mark_connector_error", { p_connector_id: connectorId, p_error: msg })
    return json(502, { error: "sync failed", detail: msg })
  }
})
