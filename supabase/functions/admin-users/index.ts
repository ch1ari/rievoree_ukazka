// ============================================================================
// Edge function: admin-users   (verify_jwt = true)
//
// Privileged user management — the parts that need the Auth Admin API. Email
// based (no temp passwords): invite, password reset and MFA reset all go through
// Supabase Auth emails (configure SMTP for real delivery).
//
// Authorization runs under the CALLER's JWT (real role + RLS), then acts with the
// service role:
//   * invite_user    — super_admin → anyone/any role; admin → into an entity they
//                      OWN, role viewer|manager only.
//   * reset_password — sends a recovery email. Gate: can_manage_user(target).
//   * reset_mfa      — unenrols the user's factors. Gate: can_manage_user(target).
//
//   POST { action: "invite_user", email, full_name?, role?, entity_id? }
//   POST { action: "reset_password", user_id }
//   POST { action: "reset_mfa", user_id }
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2"
import { CORS, json, log, UUID_RE } from "../_shared/connectors.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
// Where invite / recovery links land in the app (must be in Auth → Redirect URLs).
const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") ?? "http://localhost:5173").replace(/\/$/, "")
const RESET_REDIRECT = `${APP_BASE_URL}/reset-password`
const COMPONENT = "admin-users"

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json(405, { error: "method not allowed" })

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return json(401, { error: "missing authorization header" })
  const token = authHeader.replace(/^Bearer\s+/i, "")

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body.action !== "string") return json(400, { error: "missing action" })

  // Caller-scoped client → all authz runs under the real role + RLS.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user } } = await userClient.auth.getUser(token)
  if (!user) return json(401, { error: "unauthorized" })

  // service role → Auth Admin API + privileged RPCs.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    switch (body.action) {
      case "invite_user":    return await inviteUser(body, userClient, admin, user.id)
      case "reset_password": return await resetPassword(body, userClient, admin)
      case "reset_mfa":      return await resetMfa(body, userClient, admin)
      default:               return json(400, { error: "unknown action" })
    }
  } catch (e) {
    log(COMPONENT, "error", "unhandled", { action: body.action, error: e instanceof Error ? e.message : String(e) })
    return json(500, { error: "internal error" })
  }
})

type UClient = ReturnType<typeof createClient>

async function rpcBool(client: UClient, fn: string, args?: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data === true
}

async function inviteUser(
  body: Record<string, unknown>, userClient: UClient, admin: UClient, actorId: string,
): Promise<Response> {
  const email = String(body.email ?? "").trim().toLowerCase()
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : null
  const role = typeof body.role === "string" ? body.role : "viewer"
  const entityId = typeof body.entity_id === "string" ? body.entity_id : null

  if (!EMAIL_RE.test(email)) return json(400, { error: "valid email required" })
  if (!["super_admin", "admin", "manager", "viewer"].includes(role)) return json(400, { error: "invalid role" })
  if (entityId && !UUID_RE.test(entityId)) return json(400, { error: "entity_id must be a uuid" })

  // ---- Authorize the invite under the caller's role ------------------------
  const isSuper = await rpcBool(userClient, "am_i_super_admin")
  if (!isSuper) {
    // Scoped admin: must target their OWN entity, role limited to viewer/manager.
    if (!entityId) return json(403, { error: "choose one of your entities to invite into" })
    if (!["viewer", "manager"].includes(role)) return json(403, { error: "an admin may only invite viewer or manager" })
    const owns = await rpcBool(userClient, "do_i_own_entity", { p_entity_id: entityId })
    if (!owns) return json(403, { error: "you can only invite into a company you own" })
  }

  // ---- Send the invite email (creates the user with NO password) -----------
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: RESET_REDIRECT,
  })
  if (error || !invited?.user) {
    return json(400, { error: error?.message ?? "could not invite user" })
  }
  const newId = invited.user.id

  if (role !== "viewer") {
    const { error: roleErr } = await admin.rpc("service_set_user_role", { p_user_id: newId, p_role: role })
    if (roleErr) log(COMPONENT, "warn", "role stamp failed", { newId, error: roleErr.message })
  }
  if (entityId) {
    const { error: memErr } = await admin.from("entity_members")
      .insert({ entity_id: entityId, user_id: newId, granted_by: actorId })
    if (memErr) log(COMPONENT, "warn", "membership add failed", { newId, entityId, error: memErr.message })
  }

  log(COMPONENT, "info", "user invited", { newId, role, entityId })
  return json(201, { status: "invited", user_id: newId, email })
}

async function resetPassword(body: Record<string, unknown>, userClient: UClient, admin: UClient): Promise<Response> {
  const userId = String(body.user_id ?? "")
  if (!UUID_RE.test(userId)) return json(400, { error: "user_id must be a uuid" })
  if (!(await rpcBool(userClient, "can_manage_user", { p_user_id: userId }))) {
    return json(403, { error: "not authorized to manage this user" })
  }

  const { data: target, error: getErr } = await admin.auth.admin.getUserById(userId)
  if (getErr || !target?.user?.email) return json(404, { error: "user not found" })

  // Send a recovery email (the user sets their own new password from the link).
  // Uses the public method via an anon client so Auth actually dispatches the mail.
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await anon.auth.resetPasswordForEmail(target.user.email, { redirectTo: RESET_REDIRECT })
  if (error) return json(400, { error: error.message })

  log(COMPONENT, "info", "password recovery email sent", { userId })
  return json(200, { status: "email_sent", user_id: userId })
}

async function resetMfa(body: Record<string, unknown>, userClient: UClient, admin: UClient): Promise<Response> {
  const userId = String(body.user_id ?? "")
  if (!UUID_RE.test(userId)) return json(400, { error: "user_id must be a uuid" })
  if (!(await rpcBool(userClient, "can_manage_user", { p_user_id: userId }))) {
    return json(403, { error: "not authorized to manage this user" })
  }

  const { data: factors, error: listErr } = await admin.auth.admin.mfa.listFactors({ userId })
  if (listErr) return json(400, { error: listErr.message })

  let removed = 0
  for (const f of factors?.factors ?? []) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ userId, id: f.id })
    if (error) log(COMPONENT, "warn", "factor delete failed", { userId, factorId: f.id, error: error.message })
    else removed++
  }

  log(COMPONENT, "info", "mfa reset", { userId, removed })
  return json(200, { status: "reset", user_id: userId, factors_removed: removed })
}
