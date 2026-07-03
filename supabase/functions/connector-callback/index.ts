// ============================================================================
// Edge function: connector-callback   (verify_jwt = false)
//
// Google's OAuth redirect target. There is no user JWT on this leg (the browser
// arrives straight from Google), so we authenticate via the HMAC-signed `state`
// minted by connector-oauth. On success we exchange the code for offline tokens,
// fetch the initial Drive page token (the resumable cursor), persist everything
// with the service role (store_connector_oauth), and bounce the browser back to
// the app's /connectors page.
//
//   GET /functions/v1/connector-callback?code=...&state=...
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2"
import { CORS, json, log, verifyState } from "../_shared/connectors.ts"
import { exchangeCode, getStartPageToken, appRedirect, isConfigured } from "../_shared/google.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const COMPONENT = "connector-callback"

function back(params: Record<string, string>): Response {
  const u = new URL(appRedirect())
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return new Response(null, { status: 302, headers: { ...CORS, Location: u.toString() } })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (!isConfigured()) return json(503, { error: "google_not_configured" })

  const url = new URL(req.url)
  const err = url.searchParams.get("error")
  if (err) return back({ connect_error: err })

  const code = url.searchParams.get("code") ?? ""
  const state = url.searchParams.get("state") ?? ""
  if (!code || !state) return back({ connect_error: "missing_code_or_state" })

  const claims = await verifyState(SERVICE_ROLE_KEY, state)
  const connectorId = claims?.connector_id as string | undefined
  if (!connectorId) {
    log(COMPONENT, "warn", "bad oauth state")
    return back({ connect_error: "invalid_state" })
  }
  // Reject a stale state (>10 min) — limits replay of a leaked consent URL.
  if (typeof claims?.ts === "number" && Date.now() - claims.ts > 10 * 60 * 1000) {
    return back({ connect_error: "state_expired" })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const tokens = await exchangeCode(code)
    if (!tokens.refresh_token) {
      // No refresh token → the user previously granted; force re-consent next time.
      log(COMPONENT, "warn", "no refresh_token returned", { connectorId })
    }
    const startToken = await getStartPageToken(tokens.access_token)
    const expiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

    const { error } = await admin.rpc("store_connector_oauth", {
      p_connector_id: connectorId,
      p_refresh_token: tokens.refresh_token ?? null,
      p_access_token: tokens.access_token,
      p_expiry: expiry,
      p_cursor: startToken,
      p_config: null,
    })
    if (error) throw new Error(error.message)

    log(COMPONENT, "info", "connector authorized", { connectorId })
    return back({ connected: connectorId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(COMPONENT, "error", "oauth callback failed", { connectorId, error: msg })
    await admin.rpc("mark_connector_error", { p_connector_id: connectorId, p_error: msg })
    return back({ connect_error: "exchange_failed" })
  }
})
