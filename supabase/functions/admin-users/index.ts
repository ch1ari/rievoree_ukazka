// ============================================================================
// Edge function: admin-users   (verify_jwt = true)
//
// The privileged half of User Management (PLAN.md §6) — the operations that need
// the Auth Admin API (service role): create a user, reset a password, reset MFA.
// Role / active-state changes are plain SQL RPCs the frontend calls directly
// (admin_set_member_role / admin_set_user_active), so they are NOT here.
//
// Authorization: every action requires the CALLER to be a platform admin. We
// verify that with the caller's own JWT via the public is_platform_admin() RPC
// (so the check runs under RLS / the real role), THEN act with the service role.
// Credential operations are intentionally platform-admin-only; scoped sandbox
// admins manage membership (add/remove members) through SQL RPCs instead.
//
//   POST { action: "create_user", email, full_name?, role?, entity_id?, password? }
//   POST { action: "reset_password", user_id }
//   POST { action: "reset_mfa", user_id }
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2"
import { CORS, json, log, UUID_RE } from "../_shared/connectors.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const COMPONENT = "admin-users"

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const VALID_ROLES = ["super_admin", "admin", "manager", "viewer"]

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return "Aa1!" + btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 18)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json(405, { error: "method not allowed" })

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return json(401, { error: "missing authorization header" })
  const token = authHeader.replace(/^Bearer\s+/i, "")

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body.action !== "string") return json(400, { error: "missing action" })

  // Caller-scoped client → enforce platform-admin via the real role + RLS.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user } } = await userClient.auth.getUser(token)
  if (!user) return json(401, { error: "unauthorized" })

  const { data: isAdmin, error: adminErr } = await userClient.rpc("is_platform_admin")
  if (adminErr) {
    log(COMPONENT, "error", "admin check failed", { error: adminErr.message })
    return json(500, { error: "internal error" })
  }
  if (isAdmin !== true) return json(403, { error: "platform admin only" })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    switch (body.action) {
      case "create_user":   return await createUser(body, admin, user.id)
      case "reset_password":return await resetPassword(body, admin)
      case "reset_mfa":     return await resetMfa(body, admin)
      default:              return json(400, { error: "unknown action" })
    }
  } catch (e) {
    log(COMPONENT, "error", "unhandled", { action: body.action, error: e instanceof Error ? e.message : String(e) })
    return json(500, { error: "internal error" })
  }
})

async function createUser(
  body: Record<string, unknown>,
  admin: ReturnType<typeof createClient>,
  actorId: string,
): Promise<Response> {
  const email = String(body.email ?? "").trim().toLowerCase()
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : null
  const role = typeof body.role === "string" ? body.role : "viewer"
  const entityId = typeof body.entity_id === "string" ? body.entity_id : null
  const givenPassword = typeof body.password === "string" && body.password.length >= 6 ? body.password : null

  if (!EMAIL_RE.test(email)) return json(400, { error: "valid email required" })
  if (!VALID_ROLES.includes(role)) return json(400, { error: "invalid role" })
  if (entityId && !UUID_RE.test(entityId)) return json(400, { error: "entity_id must be a uuid" })

  const password = givenPassword ?? randomPassword()
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  })
  if (error || !created?.user) {
    return json(400, { error: error?.message ?? "could not create user" })
  }
  const newId = created.user.id

  // The on_auth_user_created trigger already inserted the profile (viewer). Stamp
  // the chosen role through the service-role RPC (frozen-column opt-in lives
  // inside it). The human caller was already verified as a platform admin above.
  if (role !== "viewer") {
    const { error: roleErr } = await admin.rpc("service_set_user_role", { p_user_id: newId, p_role: role })
    if (roleErr) log(COMPONENT, "warn", "role stamp failed", { newId, error: roleErr.message })
  }
  // Optional: drop them straight into an entity (service role bypasses RLS).
  if (entityId) {
    const { error: memErr } = await admin.from("entity_members")
      .insert({ entity_id: entityId, user_id: newId, granted_by: actorId })
    if (memErr) log(COMPONENT, "warn", "membership add failed", { newId, entityId, error: memErr.message })
  }

  log(COMPONENT, "info", "user created", { newId, role, entityId })
  return json(201, {
    status: "created",
    user_id: newId,
    email,
    // Local has no SMTP — return the temp password so the admin can hand it over.
    // Omitted when the admin supplied one.
    temp_password: givenPassword ? undefined : password,
  })
}

async function resetPassword(
  body: Record<string, unknown>,
  admin: ReturnType<typeof createClient>,
): Promise<Response> {
  const userId = String(body.user_id ?? "")
  if (!UUID_RE.test(userId)) return json(400, { error: "user_id must be a uuid" })

  const { data: target, error: getErr } = await admin.auth.admin.getUserById(userId)
  if (getErr || !target?.user?.email) return json(404, { error: "user not found" })

  // A recovery link the admin can deliver (no SMTP locally). The link sets a new
  // password; we never see or set the user's secret ourselves.
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "recovery", email: target.user.email,
  })
  if (error) return json(400, { error: error.message })

  log(COMPONENT, "info", "password reset link issued", { userId })
  return json(200, {
    status: "reset",
    user_id: userId,
    recovery_link: link?.properties?.action_link,
  })
}

async function resetMfa(
  body: Record<string, unknown>,
  admin: ReturnType<typeof createClient>,
): Promise<Response> {
  const userId = String(body.user_id ?? "")
  if (!UUID_RE.test(userId)) return json(400, { error: "user_id must be a uuid" })

  // List + delete every enrolled factor — the user re-enrols fresh afterwards.
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
