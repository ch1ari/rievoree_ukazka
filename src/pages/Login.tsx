import { useState } from "react"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { supabase } from "@/lib/supabase"
import { AuthShell } from "@/components/auth/AuthShell"
import { TwoFactorChallenge } from "@/components/auth/TwoFactorChallenge"
import { needsMfaChallenge } from "@/lib/auth/mfa"

/**
 * Sign in — email/password over the SAME instrumented factory the X-ray RLS demo
 * uses. Three clear paths: explore the demo (no account), sign in, create account.
 * If the account has a verified TOTP factor, we step the session up to aal2.
 */
const DEMO_PASSWORD = "demo123456"
const DEMO_USERS = [
  { label: "Viewer", email: "viewer@demo.local" },
  { label: "Manager", email: "manager@demo.local" },
  { label: "Admin", email: "admin@demo.local" },
] as const

const fieldClass =
  "rounded-full border border-border bg-foreground/[0.04] px-5 py-3 text-foreground placeholder:text-foreground/40 outline-none transition focus:border-foreground/60"

export function Login() {
  const navigate = useNavigate()
  const { redirect } = useSearch({ from: "/login" })
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<"creds" | "mfa">("creds")

  const dest = redirect ?? "/dashboard"
  const done = () => navigate({ to: dest })

  async function afterPassword() {
    if (await needsMfaChallenge()) { setStage("mfa"); return }
    done()
  }

  async function signIn(withEmail: string, withPassword: string) {
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: withEmail, password: withPassword })
    setBusy(false)
    if (error) { setError(error.message); return }
    await afterPassword()
  }

  if (stage === "mfa") return (
    <AuthShell title="Two-factor">
      <TwoFactorChallenge onVerified={done} />
    </AuthShell>
  )

  return (
    <AuthShell title="Sign in">
      <form onSubmit={(e) => { e.preventDefault(); void signIn(email, password) }} className="flex flex-col gap-3">
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className={fieldClass} />
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required className={fieldClass} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={busy}
          className="mt-2 rounded-full bg-accent px-6 py-3.5 text-sm font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110 disabled:opacity-60">
          {busy ? "Entering…" : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        No account? <Link to="/register" className="font-semibold text-foreground underline-offset-4 hover:underline">Create one</Link>
      </p>

      {/* Demo convenience — one-click sign-in as a seeded role (read-only). */}
      <div className="mt-6 border-t border-border pt-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Explore as a role (demo)</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO_USERS.map((u) => (
            <button key={u.email} onClick={() => void signIn(u.email, DEMO_PASSWORD)} disabled={busy}
              className="rounded-full border border-border px-4 py-2 text-sm text-foreground transition hover:bg-foreground hover:text-background disabled:opacity-50">
              {u.label}
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  )
}
