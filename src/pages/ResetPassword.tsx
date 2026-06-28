import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { supabase } from "@/lib/supabase"
import { AuthShell } from "@/components/auth/AuthShell"

/**
 * Lands here from an invite OR a password-recovery email. supabase-js parses the
 * token from the URL (detectSessionInUrl) and creates a short-lived session, so
 * the user can set a NEW password via updateUser — no temp password ever shared.
 * Same page serves both flows (invite = first password; recovery = reset).
 */
const fieldClass =
  "rounded-full border border-border bg-foreground/[0.04] px-5 py-3 text-foreground placeholder:text-foreground/40 outline-none transition focus:border-foreground/60"

export function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState<boolean | null>(null) // null = checking
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true
    // The recovery/invite token may still be processing from the URL hash; the
    // auth event tells us when a session exists. Also check immediately.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (active && s) setReady(true)
    })
    supabase.auth.getSession().then(({ data }) => {
      if (active) setReady(Boolean(data.session))
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError("Password must be at least 6 characters."); return }
    if (password !== confirm) { setError("Passwords don't match."); return }
    setBusy(true); setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(() => navigate({ to: "/dashboard" }), 1200)
  }

  if (done) return (
    <AuthShell title="Password set">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Your password is set — taking you to the app…
      </p>
    </AuthShell>
  )

  if (ready === false) return (
    <AuthShell title="Link expired">
      <p className="text-sm leading-relaxed text-muted-foreground">
        This invitation or reset link is invalid or has expired. Ask an admin to resend it,
        or use “Forgot password” on the sign-in screen.
      </p>
      <button onClick={() => navigate({ to: "/login" })}
        className="mt-5 inline-block rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition hover:brightness-110">
        Go to sign in
      </button>
    </AuthShell>
  )

  return (
    <AuthShell title="Set your password" subtitle="Choose a password to finish.">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (min 6 characters)" required minLength={6} className={fieldClass} />
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm password" required className={fieldClass} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={busy || ready === null}
          className="mt-2 rounded-full bg-accent px-6 py-3.5 text-sm font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110 disabled:opacity-60">
          {busy ? "Saving…" : ready === null ? "Loading…" : "Set password"}
        </button>
      </form>
    </AuthShell>
  )
}
