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
 *  profile (viewer) + sample-entity membership. needsConfirmation=true when email
 *  confirmations are on (no session yet → can't enrol 2FA until confirmed/signed in). */
export async function signUpWithProfile(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  })
  return { needsConfirmation: !error && !data.session, error: msg(error) }
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
