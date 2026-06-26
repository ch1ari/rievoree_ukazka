import { useState } from "react"
import { getVerifiedFactorId, verifyTotp } from "@/lib/auth/mfa"

/** Login step-up: prompt for the 6-digit code to raise the session to aal2. */
export function TwoFactorChallenge({ onVerified }: { onVerified: () => void }) {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const factorId = await getVerifiedFactorId()
    if (!factorId) { setError("No 2FA factor found on this account."); setBusy(false); return }
    const { error } = await verifyTotp(factorId, code.trim())
    setBusy(false)
    if (error) { setError(error); return }
    onVerified()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
      <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)}
        placeholder="123456" maxLength={6}
        className="rounded-full border border-border bg-foreground/[0.04] px-5 py-3 font-mono tracking-widest text-foreground outline-none focus:border-foreground/60" />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={busy || code.trim().length < 6}
        className="rounded-full bg-accent px-6 py-3.5 text-sm font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110 disabled:opacity-60">
        {busy ? "Verifying…" : "Verify"}
      </button>
    </form>
  )
}
