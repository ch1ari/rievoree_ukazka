import { supabase } from "@/lib/supabase"

/**
 * Thin wrappers around Supabase auth + MFA (TOTP). Every call goes through the
 * one instrumented `supabase` factory, so the X-ray panel sees the auth traffic.
 */

function msg(e: unknown): string | null {
  if (!e) return null
  if (e instanceof Error) return e.message
  return String((e as { message?: string })?.message ?? e)
}

/** Create an account; full_name rides in user metadata. The DB trigger creates the
 *  profile (viewer). The caller then runs provisionAccount() to pick a role + a
 *  personal sandbox. needsConfirmation=true when email confirmations are on (no
 *  session yet → can't enrol 2FA / provision until confirmed/signed in). */
export async function signUpWithProfile(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  })
  return { needsConfirmation: !error && !data.session, error: msg(error) }
}

export type ProvisionMode = "demo" | "own"
// Self-registered users may be viewer/manager/admin. Crucially, admin is SCOPED:
// private.is_admin() is global only for platform accounts that own no sandbox, so
// a registered admin sees/approves ONLY their own entities (RLS, migration 27) —
// the showcase tenants are never visible to them.
export type SwitchableRole = "viewer" | "manager" | "admin"

/** Post-signup setup: set the chosen role and build a personal sandbox — a clone
 *  of the demo data ('demo') or an empty workspace ('own'). Server-side RPC. */
export async function provisionAccount(mode: ProvisionMode, role: SwitchableRole) {
  const { error } = await supabase.rpc("provision_account", { p_mode: mode, p_role: role })
  return { error: msg(error) }
}

/** Flip the current user's role live (only inside their own sandbox). */
export async function setMyRole(role: SwitchableRole) {
  const { error } = await supabase.rpc("set_my_role", { p_role: role })
  return { error: msg(error) }
}

/** Create an additional personal entity (clone of the demo data or empty). */
export async function createMyEntity(name: string, mode: ProvisionMode) {
  const { error } = await supabase.rpc("create_my_entity", { p_name: name, p_mode: mode })
  return { error: msg(error) }
}

export async function renameMyEntity(entityId: string, name: string) {
  const { error } = await supabase.rpc("rename_my_entity", { p_entity_id: entityId, p_name: name })
  return { error: msg(error) }
}

export async function deleteMyEntity(entityId: string) {
  const { error } = await supabase.rpc("delete_my_entity", { p_entity_id: entityId })
  return { error: msg(error) }
}

/** Begin TOTP enrolment; returns the QR (SVG markup, not an external image) + secret. */
export async function enrollTotp() {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" })
  if (error || !data) return { factorId: "", qrSvg: "", secret: "", error: msg(error) ?? "enroll failed" }
  return { factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret, error: null }
}

/** Verify a 6-digit code against a factor (challenge + verify in one). */
export async function verifyTotp(factorId: string, code: string) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
  return { error: msg(error) }
}

export async function unenrollTotp(factorId: string) {
  try { await supabase.auth.mfa.unenroll({ factorId }) } catch { /* best-effort */ }
}

export async function listTotpFactors() {
  const { data } = await supabase.auth.mfa.listFactors()
  return (data?.totp ?? []).map((f) => ({ id: f.id, status: f.status as "verified" | "unverified" }))
}

/** True iff the user has a verified factor and the session is only at aal1. */
export async function needsMfaChallenge() {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  return data?.currentLevel === "aal1" && data?.nextLevel === "aal2"
}

export async function getVerifiedFactorId() {
  const factors = await listTotpFactors()
  return factors.find((f) => f.status === "verified")?.id ?? null
}
