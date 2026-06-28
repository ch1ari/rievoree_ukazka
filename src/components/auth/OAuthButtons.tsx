import { useState } from "react"
import { supabase } from "@/lib/supabase"

/**
 * "Sign in with Google / GitHub" — the OAuth2 flow beside password auth
 * (PLAN.md §7). Goes through the ONE instrumented supabase factory, so the
 * X-ray panel sees the redirect handshake too. The buttons work the moment the
 * provider secrets are configured (config.toml [auth.external.*]); until then
 * Supabase replies "provider is not enabled" and we surface it inline.
 */
const PROVIDERS = [
  { id: "google" as const, label: "Google", glyph: "G" },
  { id: "github" as const, label: "GitHub", glyph: "" },
]

export function OAuthButtons({ next = "/dashboard" }: { next?: string }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function sign(provider: "google" | "github") {
    setBusy(provider); setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}${next}` },
    })
    // On success the browser redirects away; only errors return here.
    if (error) { setBusy(null); setError(error.message) }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">or continue with</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {PROVIDERS.map((p) => (
          <button key={p.id} type="button" onClick={() => sign(p.id)} disabled={busy !== null}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-foreground/[0.04] px-4 py-2.5 text-sm font-medium transition hover:border-foreground/60 disabled:opacity-50">
            <span className="font-mono font-bold">{p.glyph}</span>
            {busy === p.id ? "Redirecting…" : p.label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
