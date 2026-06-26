import { useState } from "react"
import { useNavigate, Link } from "@tanstack/react-router"
import { AuthShell } from "@/components/auth/AuthShell"
import { TwoFactorEnroll } from "@/components/auth/TwoFactorEnroll"
import { signUpWithProfile } from "@/lib/auth/mfa"

type Stage = "form" | "enroll" | "confirm"

const fieldClass =
  "rounded-full border border-border bg-foreground/[0.04] px-5 py-3 text-foreground placeholder:text-foreground/40 outline-none transition focus:border-foreground/60"

export function Register() {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>("form")
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [want2fa, setWant2fa] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { needsConfirmation, error } = await signUpWithProfile(email.trim(), password, fullName.trim())
    setBusy(false)
    if (error) { setError(error); return }
    if (needsConfirmation) { setStage("confirm"); return }
    if (want2fa) { setStage("enroll"); return }
    navigate({ to: "/dashboard" })
  }

  if (stage === "confirm") return (
    <AuthShell title="Check your email">
      <p className="text-sm leading-relaxed text-muted-foreground">
        We sent a confirmation link to <span className="text-foreground">{email}</span>. Confirm it, then sign in.
        You can enable 2FA from your account afterwards.
      </p>
      <Link to="/login" className="mt-5 inline-block rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition hover:brightness-110">
        Go to sign in
      </Link>
    </AuthShell>
  )

  if (stage === "enroll") return (
    <AuthShell title="Enable 2FA" subtitle="One more step — secure your account with an authenticator app.">
      <TwoFactorEnroll onVerified={() => navigate({ to: "/dashboard" })} onSkip={() => navigate({ to: "/dashboard" })} />
    </AuthShell>
  )

  return (
    <AuthShell title="Create your account" subtitle="A free account drops you into a read-only sample workspace — explore the real backend.">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" required className={fieldClass} />
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className={fieldClass} />
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 characters)" required minLength={6} className={fieldClass} />
        <label className="mt-1 flex items-center gap-3 text-sm text-foreground">
          <input type="checkbox" checked={want2fa} onChange={(e) => setWant2fa(e.target.checked)} className="size-4 accent-[#A3E635]" />
          Enable two-factor authentication (2FA)
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={busy}
          className="mt-2 rounded-full bg-accent px-6 py-3.5 text-sm font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110 disabled:opacity-60">
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account? <Link to="/login" className="font-semibold text-foreground underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  )
}
