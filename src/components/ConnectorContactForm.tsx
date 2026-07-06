import { useState } from "react"
import { Mail, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"

/**
 * Lightweight "request real access" capture. Writes to public.leads (anon INSERT
 * is allowed; nobody can read it back via the API — the owner reads via the
 * dashboard). No new table needed. An optional short note rides in `source`.
 */
export function ConnectorContactForm({ source = "connector-access" }: { source?: string }) {
  const [email, setEmail] = useState("")
  const [note, setNote] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle")
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setState("sending"); setErr(null)
    const tag = note.trim() ? `${source} :: ${note.trim().slice(0, 200)}` : source
    const { error } = await supabase.from("leads").insert({ email: email.trim(), source: tag })
    if (error) { setState("error"); setErr(error.message); return }
    setState("done"); setEmail(""); setNote("")
  }

  if (state === "done") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/[0.06] px-4 py-3 font-mono text-xs text-accent">
        <Check className="size-4" /> Thanks — I'll be in touch about setting you up with real Drive access.
      </div>
    )
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50"

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com" className={inputClass} />
      <input value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="optional — what you'd like to test" className={inputClass} />
      <button type="submit" disabled={state === "sending" || !email.trim()}
        className="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110 disabled:opacity-50">
        <Mail className="size-4" /> {state === "sending" ? "Sending…" : "Request real access"}
      </button>
      {err && <p role="alert" className={cn("font-mono text-[11px] text-destructive")}>{err}</p>}
    </form>
  )
}
