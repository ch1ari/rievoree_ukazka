import { useEffect, useRef, useState } from "react"
import { enrollTotp, verifyTotp, unenrollTotp } from "@/lib/auth/mfa"

/**
 * TOTP enrolment: shows the Supabase-generated QR (inline SVG — no external image)
 * + the secret, then verifies a 6-digit code. On unmount before verifying, the
 * unverified factor is dropped so retries stay clean.
 */
export function TwoFactorEnroll({ onVerified, onSkip }: { onVerified: () => void; onSkip?: () => void }) {
  const [qrSvg, setQrSvg] = useState("")
  const [secret, setSecret] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const factorId = useRef("")

  useEffect(() => {
    let active = true
    enrollTotp().then((r) => {
      if (!active) return
      if (r.error) { setError(r.error); return }
      factorId.current = r.factorId
      setQrSvg(r.qrSvg)
      setSecret(r.secret)
    })
    return () => {
      active = false
      if (factorId.current) unenrollTotp(factorId.current)
    }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await verifyTotp(factorId.current, code.trim())
    setBusy(false)
    if (error) { setError(error); return }
    factorId.current = "" // verified — keep it on unmount
    onVerified()
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">Scan this with an authenticator app (Google Authenticator, 1Password…), then enter the 6-digit code.</p>
      {qrSvg
        ? <img src={qrSvg} alt="Two-factor QR code" width={176} height={176} className="mt-4 rounded-xl bg-foreground/[0.05] p-3" />
        : <div className="mt-4 h-44 w-44 animate-pulse rounded-xl bg-foreground/[0.07]" />}
      {secret && <p className="mt-3 break-all font-mono text-xs text-muted-foreground">Secret: <span className="text-foreground">{secret}</span></p>}
      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)}
          placeholder="123456" maxLength={6}
          className="flex-1 rounded-full border border-border bg-foreground/[0.04] px-5 py-3 font-mono tracking-widest text-foreground outline-none focus:border-foreground/60" />
        <button type="submit" disabled={busy || code.trim().length < 6}
          className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition hover:brightness-110 disabled:opacity-50">
          {busy ? "Verifying…" : "Verify"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {onSkip && <button onClick={onSkip} className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:underline">Skip for now</button>}
    </div>
  )
}
