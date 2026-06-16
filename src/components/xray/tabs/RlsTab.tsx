import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"

/**
 * RLS — "same query, three identities". The core demo moment: run the IDENTICAL
 * SELECT as Viewer / Manager / Admin and watch Postgres RLS return different
 * rows. The numbers are REAL — each "Run as…" signs in as a seeded demo user
 * (local stack) and runs the same query through the same seam; nothing here is
 * hardcoded. Sign-in changes the whole app's session (by design — the PIPELINE
 * tab then reflects that role too); Reset signs out back to anon.
 */

// LOCAL demo režim only. These are the seeded *@demo.local users (see seed.sql);
// the shared password is the public local demo password, never a real secret.
const DEMO_PASSWORD = "demo123456"

type Role = "viewer" | "manager" | "admin"

const IDENTITIES: {
  role: Role
  email: string
  label: string
  reason: string
}[] = [
  {
    role: "viewer",
    email: "viewer@demo.local",
    label: "Viewer",
    reason: "my_entity_ids() — assigned entities only",
  },
  {
    role: "manager",
    email: "manager@demo.local",
    label: "Manager",
    reason: "my_entity_ids() — assigned entities only",
  },
  {
    role: "admin",
    email: "admin@demo.local",
    label: "Admin",
    reason: "is_admin() — bypasses the entity filter",
  },
]

// The one query every identity runs — verbatim. Only the JWT differs.
const QUERY_SQL = "select id, name from entities order by name"

interface RunResult {
  count: number
  names: string[]
  error?: string
}

export function RlsTab() {
  // Single source of truth: the active identity comes from AuthProvider, so this
  // banner stays consistent whether you signed in via /login or "Run as…" here.
  const { role } = useAuth()
  const active: Role | null =
    role === "viewer" || role === "manager" || role === "admin" ? role : null

  const [results, setResults] = useState<Partial<Record<Role, RunResult>>>({})
  const [busy, setBusy] = useState<Role | "reset" | null>(null)

  async function runAs(role: Role, email: string) {
    setBusy(role)
    try {
      const auth = await supabase.auth.signInWithPassword({
        email,
        password: DEMO_PASSWORD,
      })
      if (auth.error) {
        setResults((r) => ({ ...r, [role]: { count: 0, names: [], error: auth.error!.message } }))
        return
      }
      // The identical query, now under this identity's JWT → RLS decides rows.
      const { data, error } = await supabase
        .from("entities")
        .select("id,name")
        .order("name")
      setResults((r) => ({
        ...r,
        [role]: error
          ? { count: 0, names: [], error: error.message }
          : { count: data.length, names: data.map((e) => e.name as string) },
      }))
      // active identity now flows from AuthProvider (onAuthStateChange).
    } finally {
      setBusy(null)
    }
  }

  async function reset() {
    setBusy("reset")
    try {
      await supabase.auth.signOut()
      setResults({})
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* The identical query — only the JWT changes between runs. */}
      <div className="border-b border-border px-4 py-3">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          identical query · GET /rest/v1/entities
        </p>
        <code className="block bg-secondary/50 px-3 py-2 font-mono text-xs text-foreground">
          {QUERY_SQL}
        </code>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          Same SQL, three identities. The server returns different rows by{" "}
          <span className="text-accent">auth.uid()</span> — RLS is the only
          barrier, not the frontend.
        </p>
      </div>

      {/* Acting-as banner. */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          acting as:{" "}
          <span className={role ? "text-accent" : "text-foreground"}>
            {role ?? "anonymous"}
          </span>
        </span>
        <Button
          variant="outline"
          size="xs"
          className="font-mono text-[10px]"
          disabled={busy !== null}
          onClick={reset}
        >
          {busy === "reset" ? "…" : "Reset → anon"}
        </Button>
      </div>

      {/* Three identity cards, side by side — the comparison. */}
      <div className="grid grid-cols-3 gap-px bg-border">
        {IDENTITIES.map((id) => (
          <IdentityCard
            key={id.role}
            label={id.label}
            reason={id.reason}
            result={results[id.role]}
            active={active === id.role}
            busy={busy === id.role}
            onRun={() => runAs(id.role, id.email)}
          />
        ))}
      </div>
    </div>
  )
}

function IdentityCard({
  label,
  reason,
  result,
  active,
  busy,
  onRun,
}: {
  label: string
  reason: string
  result?: RunResult
  active: boolean
  busy: boolean
  onRun: () => void
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 bg-background p-3",
        active && "ring-1 ring-inset ring-accent",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-wider">{label}</span>
        {active && (
          <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
        )}
      </div>

      {/* The big number — entity rows this identity can see. */}
      <div className="font-mono tabular-nums">
        <span className="text-3xl font-bold">
          {result ? (result.error ? "—" : result.count) : "·"}
        </span>
        <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {result?.error ? "err" : "entities"}
        </span>
      </div>

      {/* Which rows, concretely. */}
      <div className="min-h-8 font-mono text-[10px] leading-snug text-muted-foreground">
        {result?.error ? (
          <span className="text-destructive break-words">{result.error}</span>
        ) : result ? (
          result.names.map((n) => <div key={n} className="truncate">{n}</div>)
        ) : (
          <span className="opacity-50">not run</span>
        )}
      </div>

      <p className="font-mono text-[9px] leading-tight text-muted-foreground">
        {reason}
      </p>

      <Button
        variant={active ? "default" : "outline"}
        size="xs"
        className="mt-auto font-mono text-[10px]"
        disabled={busy}
        onClick={onRun}
      >
        {busy ? "running…" : `Run as ${label}`}
      </Button>
    </div>
  )
}
