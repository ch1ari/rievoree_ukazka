import { useState } from "react"
import { Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router"
import { Menu } from "lucide-react"
import { XRayPanel } from "@/components/xray/XRayPanel"
import { OrbsBackground } from "@/components/OrbsBackground"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useAuth } from "@/lib/auth/useAuth"
import { supabase } from "@/lib/supabase"

const navLinkBase = "rounded-full px-3.5 py-2 font-mono text-xs uppercase tracking-widest transition-colors"
const navLinkActive = "bg-accent/12 text-accent"
const navLinkIdle = "text-muted-foreground hover:bg-secondary hover:text-foreground"

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
      <div className="flex min-h-screen items-center justify-center">
        <span className="inline-flex items-center gap-2.5 rounded-full bg-card px-5 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground shadow-soft ring-1 ring-border">
          <span className="size-1.5 animate-pulse rounded-full bg-accent" /> loading…
        </span>
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
      {/* Subtle cold-orb atmosphere behind in-app pages (landing brings its own). */}
      {path !== "/" && <OrbsBackground subtle />}

      <header className="sticky top-0 z-40 border-b border-border bg-background/75 shadow-soft backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <Link to="/" className="text-xl font-semibold tracking-tight">
            X-RAY<span className="bg-gradient-to-r from-accent to-signal bg-clip-text text-transparent">/</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {session ? (
              NAV.map((item) => (
                <Link key={item.to} to={item.to} className={navLinkBase}
                  activeProps={{ className: navLinkActive }} inactiveProps={{ className: navLinkIdle }}>
                  {item.label}
                </Link>
              ))
            ) : (
              <Link to="/login" className={`${navLinkBase} ${navLinkIdle}`}>Sign in</Link>
            )}
          </nav>

          {/* Right cluster — X-ray panel always reachable; nav collapses to a drawer on mobile */}
          <div className="flex items-center gap-2.5">
            <XRayPanel />
            {session && <div className="hidden md:block"><ActingAs label={role ?? session.user.email ?? "signed in"} /></div>}
            <div className="md:hidden">
              <MobileNav signedIn={!!session} identity={role ?? session?.user.email ?? "signed in"} />
            </div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-6xl flex-1 px-6 py-16">
        <Outlet />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-6 py-8">
          <span className="size-1.5 rounded-full bg-signal" />
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Portfolio demo — fake data only</p>
        </div>
      </footer>
    </div>
  )
}

/** Mobile nav drawer — collapses the link row + identity below md. Reuses the
 *  same NAV targets and signOut; closes on navigation. Presentational only. */
function MobileNav({ signedIn, identity }: { signedIn: boolean; identity: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu" className="rounded-full">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" aria-describedby={undefined} className="w-72 gap-0">
        <SheetHeader>
          <SheetTitle className="text-lg">
            X-RAY<span className="bg-gradient-to-r from-accent to-signal bg-clip-text text-transparent">/</span>
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {signedIn ? (
            NAV.map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 font-mono text-sm uppercase tracking-widest transition-colors"
                activeProps={{ className: navLinkActive }} inactiveProps={{ className: navLinkIdle }}>
                {item.label}
              </Link>
            ))
          ) : (
            <Link to="/login" onClick={() => setOpen(false)}
              className={`rounded-xl px-4 py-3 font-mono text-sm uppercase tracking-widest ${navLinkIdle}`}>
              Sign in
            </Link>
          )}
        </nav>
        {signedIn && (
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-4 py-4">
            <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              <span className="size-1.5 rounded-full bg-signal" /> {identity}
            </span>
            <Button variant="ghost" size="xs" className="font-mono text-[10px] uppercase tracking-wider"
              onClick={() => { setOpen(false); void supabase.auth.signOut() }}>
              Sign out
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** Current identity + sign-out. signOut flows through onAuthStateChange, so the
 *  guard re-evaluates and bounces to /login if on a protected page. */
function ActingAs({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-card py-1 pr-1 pl-3 ring-1 ring-border">
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="size-1.5 rounded-full bg-signal" />
        {label}
      </span>
      <Button
        variant="ghost"
        size="xs"
        className="rounded-full font-mono text-[10px] uppercase tracking-wider"
        onClick={() => void supabase.auth.signOut()}
      >
        Sign out
      </Button>
    </div>
  )
}
