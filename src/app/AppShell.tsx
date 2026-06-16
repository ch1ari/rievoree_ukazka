import { Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router"
import { XRayPanel } from "@/components/xray/XRayPanel"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth/useAuth"
import { supabase } from "@/lib/supabase"

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/ingest", label: "Ingest" },
  { to: "/reports", label: "Reports" },
  { to: "/connectors", label: "Connectors" },
  { to: "/users", label: "Users" },
  { to: "/account", label: "Account" },
] as const

// Routes reachable without a session. Everything else is guarded.
const PUBLIC = new Set(["/", "/login"])

/**
 * App frame + auth guard. The guard waits for `loading` (session rehydration
 * from localStorage) BEFORE deciding — so a page refresh while signed in never
 * flashes a redirect to /login. Anon on a protected route is bounced to /login
 * with a `redirect` back to where they were headed.
 */
export function AppShell() {
  const { session, role, loading } = useAuth()
  const path = useRouterState({ select: (s) => s.location.pathname })

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
        loading…
      </div>
    )
  }

  // Login screen renders bare — no app nav/chrome.
  if (path === "/login") return <Outlet />

  // Guard: anon hitting a protected route → login, remembering the destination.
  if (!session && !PUBLIC.has(path)) {
    return <Navigate to="/login" search={{ redirect: path }} />
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="text-xl font-bold tracking-tighter">
            X-RAY<span className="text-accent">/</span>
          </Link>
          <nav className="flex items-center gap-6">
            {session ? (
              NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: "text-foreground underline decoration-accent decoration-2 underline-offset-8" }}
                >
                  {item.label}
                </Link>
              ))
            ) : (
              <Link
                to="/login"
                className="font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
              >
                Sign in
              </Link>
            )}
            <XRayPanel />
            {session && <ActingAs label={role ?? session.user.email ?? "signed in"} />}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-16">
        <Outlet />
      </main>
      <footer className="border-t border-border">
        <p className="mx-auto max-w-6xl px-6 py-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Portfolio demo — fake data only
        </p>
      </footer>
    </div>
  )
}

/** Current identity + sign-out. signOut flows through onAuthStateChange, so the
 *  guard re-evaluates and bounces to /login if on a protected page. */
function ActingAs({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 border-l border-border pl-4">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Button
        variant="ghost"
        size="xs"
        className="font-mono text-[10px] uppercase tracking-wider"
        onClick={() => void supabase.auth.signOut()}
      >
        Sign out
      </Button>
    </div>
  )
}
