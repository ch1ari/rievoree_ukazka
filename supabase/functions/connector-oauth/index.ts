// ============================================================================
// Edge function: connector-oauth   (verify_jwt = true)
//
// Starts the Google Drive OAuth flow for a gdrive connector. The caller must be
// able to SEE the connector (RLS: managers/admins of its entity) — we delegate
// that check to PostgREST by selecting the row with the caller's JWT.
//
//   POST { action: "start", connector_id }
//     → { url } : the Google consent URL. The browser navigates there; Google
//       redirects back to the connector-callback function with a signed `state`.
//
// The state is an HMAC (signState, keyed by the service-role secret) carrying the
// connector id + caller id, so the no-JWT callback can authenticate the return
// leg without a DB session.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2"
import { CORS, json, log, UUID_RE, signState } from "../_shared/connectors.ts"
import { consentUrl, isConfigured } from "../_shared/google.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const COMPONENT = "connector-oauth"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json(405, { error: "method not allowed" })

  if (!isConfigured()) {
    return json(503, { error: "google_not_configured", message: "Google OAuth env vars are not set on this deployment." })
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return json(401, { error: "missing authorization header" })
  const token = authHeader.replace(/^Bearer\s+/i, "")

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || body.action !== "start") return json(400, { error: "expected { action: 'start', connector_id }" })
  const connectorId = body.connector_id
  if (typeof connectorId !== "string" || !UUID_RE.test(connectorId)) {
    return json(400, { error: "connector_id must be a uuid" })
  }

  // Caller-scoped client → RLS decides whether the caller may manage this connector.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user } } = await userClient.auth.getUser(token)
  if (!user) return json(401, { error: "unauthorized" })

  const { data: conn, error } = await userClient
    .from("connectors").select("id, kind, status").eq("id", connectorId).maybeSingle()
  if (error) {
    log(COMPONENT, "error", "connector visibility check failed", { connectorId, error: error.message })
    return json(500, { error: "internal error" })
  }
  if (!conn) return json(403, { error: "not authorized for this connector" })
  if (conn.kind !== "gdrive") return json(400, { error: "only gdrive connectors use OAuth" })

  const state = await signState(SERVICE_ROLE_KEY, {
    connector_id: connectorId, uid: user.id, ts: Date.now(),
  })

  log(COMPONENT, "info", "oauth start", { connectorId, uid: user.id })
  return json(200, { url: consentUrl(state) })
})
