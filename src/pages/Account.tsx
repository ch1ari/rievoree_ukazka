import { useState } from "react"
import { motion } from "motion/react"
import { Check, ShieldCheck, KeyRound } from "lucide-react"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"
import { setMyRole, type SwitchableRole } from "@/lib/auth/mfa"
import { EntityManager } from "@/components/EntityManager"

const ROLES: { value: SwitchableRole; label: string; blurb: string }[] = [
  { value: "viewer", label: "Viewer", blurb: "Read-only. Sees finished reports, but no ingest machinery or approvals." },
  { value: "manager", label: "Manager", blurb: "Uploads batches and approves them — the full ingest → review → load flow." },
  { value: "admin", label: "Admin", blurb: "Manager rights plus managing the chart of accounts — scoped to your own entities." },
]

export function Account() {
  const { role, refreshRole } = useAuth()
  const [busy, setBusy] = useState<SwitchableRole | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function pick(next: SwitchableRole) {
    if (next === role || busy) return
    setBusy(next); setError(null); setSaved(false)
    const { error } = await setMyRole(next)
    await refreshRole()
    setBusy(null)
    if (error) { setError(error); return }
    setSaved(true)
  }

  return (
    <div className="relative">
      <motion.header
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }}
        className="pb-10">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">Account</span>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">Settings</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Switch your role to watch how the app behaves — viewers only read reports,
          managers run the ingest &amp; approval pipeline. Changes apply instantly across the app.
        </p>
      </motion.header>

      <section className="max-w-2xl rounded-[1.5rem] bg-card p-6 shadow-soft ring-1 ring-border md:p-7">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-accent" />
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Your role</h2>
          <span className="ml-auto rounded-full bg-secondary px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-foreground ring-1 ring-border">
            {role ?? "—"}
          </span>
        </div>

        <div className="mt-5 grid gap-3">
          {ROLES.map((r) => {
            const active = r.value === role
            return (
              <button
                key={r.value}
                onClick={() => pick(r.value)}
                disabled={busy !== null}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 text-left transition disabled:opacity-60",
                  active
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-accent/60 hover:bg-foreground/[0.03]",
                )}
              >
                <span className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                  active ? "border-accent bg-accent text-accent-foreground" : "border-border text-transparent",
                )}>
                  <Check className="size-3" strokeWidth={3} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-mono text-sm font-semibold uppercase tracking-wider">
                    {r.label}
                    {busy === r.value && <span className="font-normal text-muted-foreground">· switching…</span>}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{r.blurb}</span>
                </span>
              </button>
            )
          })}
        </div>

        {error && <p role="alert" className="mt-4 font-mono text-xs text-destructive">{error}</p>}
        {saved && !error && (
          <p className="mt-4 font-mono text-xs text-accent">Role updated — try the Ingest and Reports pages.</p>
        )}
      </section>

      <ChangePassword />

      <EntityManager />
    </div>
  )
}

const pwInputClass =
  "rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50"

/** Self-service password change for the signed-in user (no email round-trip). */
function ChangePassword() {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setSaved(false)
    if (password.length < 6) { setError("Password must be at least 6 characters."); return }
    if (password !== confirm) { setError("Passwords don't match."); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) { setError(error.message); return }
    setPassword(""); setConfirm(""); setSaved(true)
  }

  return (
    <section className="mt-8 max-w-2xl rounded-[1.5rem] bg-card p-6 shadow-soft ring-1 ring-border md:p-7">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-accent" />
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Change password</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Set a new password for your account. You stay signed in.
      </p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">New password</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 characters" className={pwInputClass} />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Confirm</span>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="repeat" className={pwInputClass} />
        </label>
        <button type="submit" disabled={busy || !password}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110 disabled:opacity-50">
          {busy ? "Saving…" : "Update"}
        </button>
      </form>
      {error && <p role="alert" className="mt-3 font-mono text-xs text-destructive">{error}</p>}
      {saved && <p className="mt-3 font-mono text-xs text-accent">✓ Password updated.</p>}
    </section>
  )
}
