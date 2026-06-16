import { useState } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"

/**
 * Login — email/password over the SAME path the X-ray RLS demo uses:
 * supabase.auth.signInWithPassword on the one factory. No separate auth client.
 * On success the AuthProvider's onAuthStateChange fires; we redirect back to the
 * page the guard bounced from (or the dashboard).
 */
const DEMO_PASSWORD = "demo123456"
const DEMO_USERS = [
  { label: "Viewer", email: "viewer@demo.local" },
  { label: "Manager", email: "manager@demo.local" },
  { label: "Admin", email: "admin@demo.local" },
] as const

export function Login() {
  const navigate = useNavigate()
  const { redirect } = useSearch({ from: "/login" })
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn(withEmail: string, withPassword: string) {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: withEmail,
      password: withPassword,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate({ to: redirect ?? "/dashboard" })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <span className="text-3xl font-bold tracking-tighter">
            X-RAY<span className="text-accent">/</span>
          </span>
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Sign in to continue
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void signIn(email, password)
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="email" className="font-mono text-xs uppercase tracking-wider">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="font-mono text-xs uppercase tracking-wider">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="font-mono"
            />
          </div>

          {error && (
            <p role="alert" className="font-mono text-xs text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full font-mono" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {/* Demo convenience — one-click sign-in as a seeded role (local only). */}
        <div className="mt-8 border-t border-border pt-6">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Demo login
          </p>
          <div className="grid grid-cols-3 gap-2">
            {DEMO_USERS.map((u) => (
              <Button
                key={u.email}
                variant="outline"
                size="sm"
                disabled={busy}
                className="font-mono text-xs"
                onClick={() => void signIn(u.email, DEMO_PASSWORD)}
              >
                {u.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
