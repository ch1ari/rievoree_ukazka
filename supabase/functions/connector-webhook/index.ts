// ============================================================================
// Edge function: connector-webhook   (verify_jwt = false)
//
// The HMAC-signed inbound webhook from PLAN.md §7. A third party POSTs a CSV (or
// pre-typed rows) here; we verify an HMAC-SHA256 signature in CONSTANT TIME
// against the connector's stored secret, then run the file through the REAL ETL
// pipeline (ingest_connector_rows → transform + z-score → awaiting_review).
//
// No JWT: the platform cannot authenticate an arbitrary external caller, so the
// SIGNATURE is the authentication. verify_jwt is off (config.toml); the signature
// check below is the gate.
//
//   POST /functions/v1/connector-webhook?id=<connector_id>
//   Header:  x-signature: sha256=<hex hmac of the raw request body>
//   Header:  x-delivery-id: <optional unique id; else we hash the body>
//   Body:    text/csv  → the CSV itself
//            application/json → { period?: "YYYY-MM-DD", csv?: "...", rows?: [...] }
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  CORS, json, log, UUID_RE, hmacHex, timingSafeEqual, sha256Hex,
  parseCsv, dominantPeriod, type StagingRow,
} from "../_shared/connectors.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const COMPONENT = "connector-webhook"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json(405, { error: "method not allowed" })

  const url = new URL(req.url)
  const connectorId = url.searchParams.get("id") ?? ""
  if (!UUID_RE.test(connectorId)) return json(400, { error: "id query param must be a connector uuid" })

  const signature = (req.headers.get("x-signature") ?? "").replace(/^sha256=/i, "").trim()
  if (!signature) return json(401, { error: "missing x-signature header" })

  // Read the RAW body once — the signature is computed over these exact bytes.
  const rawBody = await req.text()

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // service_role bypasses RLS + the column grant → it can read the secret.
  const { data: conn, error: connErr } = await admin
    .from("connectors")
    .select("id, kind, status, webhook_secret, entity_id")
    .eq("id", connectorId)
    .maybeSingle()
  if (connErr) {
    log(COMPONENT, "error", "connector lookup failed", { connectorId, error: connErr.message })
    return json(500, { error: "internal error" })
  }
  // Same 401 for "no such connector" and "bad signature" — don't reveal which.
  if (!conn || conn.kind !== "webhook" || !conn.webhook_secret) {
    return json(401, { error: "invalid signature" })
  }

  const expected = await hmacHex(conn.webhook_secret as string, rawBody)
  if (!timingSafeEqual(signature.toLowerCase(), expected)) {
    log(COMPONENT, "warn", "signature mismatch", { connectorId })
    return json(401, { error: "invalid signature" })
  }
  if (conn.status === "paused") {
    return json(409, { error: "connector is paused" })
  }

  // ---- Parse the payload into typed rows -----------------------------------
  let rows: StagingRow[] = []
  let period: string | null = null
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase()

  try {
    if (contentType.includes("application/json")) {
      const body = JSON.parse(rawBody) as Record<string, unknown>
      if (typeof body.period === "string") period = body.period
      if (typeof body.csv === "string") rows = parseCsv(body.csv)
      else if (Array.isArray(body.rows)) rows = body.rows as StagingRow[]
      else return json(400, { error: "json body needs `csv` (string) or `rows` (array)" })
    } else {
      rows = parseCsv(rawBody) // treat as raw CSV
    }
  } catch {
    return json(400, { error: "could not parse body" })
  }

  if (!rows.length) return json(400, { error: "no data rows found" })

  period = period ?? dominantPeriod(rows) ?? new Date().toISOString().slice(0, 10)

  // Dedup key: caller-supplied delivery id, else a content hash (idempotent retry).
  const deliveryId = req.headers.get("x-delivery-id") ?? `sha256-${await sha256Hex(rawBody)}`
  const fileHash = await sha256Hex(rawBody)

  const { data, error } = await admin.rpc("ingest_connector_rows", {
    p_connector_id: connectorId,
    p_external_id: deliveryId,
    p_file_name: `webhook-${deliveryId.slice(0, 16)}.csv`,
    p_file_hash: fileHash,
    p_period: period,
    p_rows: rows,
  })
  if (error) {
    log(COMPONENT, "error", "ingest_connector_rows failed", { connectorId, error: error.message })
    await admin.rpc("mark_connector_error", { p_connector_id: connectorId, p_error: error.message })
    return json(500, { error: "ingestion failed" })
  }

  const result = data as { status?: string; batch_id?: string; rows_total?: number }
  log(COMPONENT, "info", "webhook ingested", { connectorId, deliveryId, status: result?.status, batchId: result?.batch_id })
  return json(result?.status === "duplicate" ? 200 : 201, {
    status: result?.status ?? "created",
    batch_id: result?.batch_id,
    rows: rows.length,
    period,
  })
})
