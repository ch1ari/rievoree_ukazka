import { useState } from "react"
import { Link, Navigate, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { Menu, ScanLine } from "lucide-react"
import { XRayPanel } from "@/components/xray/XRayPanel"
import { OrbsBackground } from "@/components/OrbsBackground"
import { PaperBackground } from "@/components/PaperBackground"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useAuth } from "@/lib/auth/useAuth"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const navLinkBase = "rounded-full px-3 py-2 font-mono text-xs uppercase tracking-widest transition-colors"
// Compact variant for the 11-item signed-in product nav, so the whole row fits
// the bar without forcing a horizontal page scroll.
const navLinkCompact = "rounded-full px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors"
const navLinkActive = "bg-accent/12 text-accent"
const navLinkIdle = "text-muted-foreground hover:bg-secondary hover:text-foreground"

const DEMO_EMAIL = "demo@demo.local"

// Full product nav — only for a real signed-in account (not the demo tour).
// `roles` (when present) restricts a link to those roles; absent = everyone.
const MANAGER_ROLES = ["manager", "admin", "super_admin"]
const ADMIN_ROLES = ["admin", "super_admin"]
const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/pl", label: "P&L" },
  { to: "/balance", label: "Balance" },
  { to: "/pivot", label: "Pivot" },
  { to: "/variance", label: "Variance" },
  { to: "/aging", label: "Aging" },
  { to: "/reports", label: "Reports" },
  { to: "/ingest", label: "Ingest" },
  { to: "/connectors", label: "Connectors", roles: MANAGER_ROLES },
  { to: "/users", label: "Users", roles: ADMIN_ROLES },
  { to: "/account", label: "Account" },
] as const

// The nav a given role may see (Connectors → managers+, Users → admins).
function navFor(role: string | null) {
  return NAV.filter((item) => !("roles" in item) || (item.roles as readonly string[]).includes(role ?? ""))
}

// Demo "tour" nav — read-only analytics only. NO Ingest / Users / Account.
const SHOWCASE = [
  { to: "/dashboard", label: "Overview" },
  { to: "/pl", label: "P&L" },
  { to: "/balance", label: "Balance" },
  { to: "/pivot", label: "Pivot" },
  { to: "/variance", label: "Variance" },
  { to: "/aging", label: "Aging" },
  { to: "/reports", label: "Reports" },
] as const

// Routes the demo tour must not reach (write / account features → sign in first).
const DEMO_BLOCKED = new Set(["/ingest", "/users", "/connectors", "/account"])

const PUBLIC = new Set(["/", "/login", "/register", "/about"])
const PAPER_ROUTES = new Set(["/", "/login", "/register", "/about"])

export function AppShell() {
  const { session, role, loading } = useAuth()
  const navigate = useNavigate()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const onPaper = PAPER_ROUTES.has(path)
  // The demo is a READ-ONLY TOUR, not a real login. We still ride the seeded
  // viewer session under the hood (so the data + X-ray are real + RLS-filtered),
  // but the UI never frames it as "logged in" and hides every write feature.
  const isDemo = !!session && session.user.email === DEMO_EMAIL

  async function exploreDemo() {
    const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: "demo123456" })
    if (!error) navigate({ to: "/dashboard" })
  }
  async function exitDemo() {
    await supabase.auth.signOut()
    navigate({ to: "/" })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="inline-flex items-center gap-2.5 rounded-full bg-card px-5 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground shadow-soft ring-1 ring-border">
          <span className="size-1.5 animate-pulse rounded-full bg-accent" /> loading…
        </span>
      </div>
    )
  }

  // Guard: anon on a protected route → login.
  if (!session && !PUBLIC.has(path)) {
    return <Navigate to="/login" search={{ redirect: path }} />
  }
  // Guard: the demo tour cannot reach write/account routes — sign in first.
  if (isDemo && DEMO_BLOCKED.has(path)) {
    return <Navigate to="/dashboard" />
  }

  // The signed-in flag for chrome purposes EXCLUDES the demo tour.
  const realUser = !!session && !isDemo

  // The signed-in product nav has 11 items, so its bar needs more room and a
  // higher "collapse to menu" breakpoint than the lean demo/anon navs — otherwise
  // the row overflows and the whole page scrolls sideways.
  const headerMax = realUser ? "max-w-7xl" : "max-w-6xl"

  return (
    // overflow-x-clip: a hard guarantee the page never scrolls sideways (clip
    // doesn't create a scroll container, so the sticky header still works).
    <div className={cn("flex min-h-screen flex-col overflow-x-clip", onPaper && "paper")}>
      {onPaper ? <PaperBackground /> : <OrbsBackground subtle />}

      <header className={onPaper
        ? "sticky top-0 z-40"
        : "sticky top-0 z-40 border-b border-border bg-background/75 shadow-soft backdrop-blur-lg"}>
        <div className={cn("mx-auto flex h-16 items-center justify-between gap-4 px-6", headerMax)}>
          <Link to="/" className="text-xl font-semibold tracking-tight">
            X-RAY<span className={onPaper ? "text-accent" : "bg-gradient-to-r from-accent to-signal bg-clip-text text-transparent"}>/</span>
          </Link>

          {realUser ? (
            <nav className="hidden items-center gap-0.5 xl:flex">
              {navFor(role).map((item) => (
                <Link key={item.to} to={item.to} className={navLinkCompact}
                  activeProps={{ className: navLinkActive }} inactiveProps={{ className: navLinkIdle }}>
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : isDemo ? (
            <nav className="hidden items-center gap-1 lg:flex">
              {SHOWCASE.map((item) => (
                <Link key={item.to} to={item.to} className={navLinkBase}
                  activeProps={{ className: navLinkActive }} inactiveProps={{ className: navLinkIdle }}>
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : (
            <nav className="hidden items-center gap-1 md:flex">
              <button onClick={exploreDemo} className={`${navLinkBase} ${navLinkIdle}`}>Demo</button>
              <Link to="/about" className={navLinkBase}
                activeProps={{ className: navLinkActive }} inactiveProps={{ className: navLinkIdle }}>O nás</Link>
              <Link to="/login" className={`${navLinkBase} ${navLinkIdle}`}>Prihlásiť</Link>
            </nav>
          )}

          <div className="flex items-center gap-2.5">
            <XRayPanel />
            {realUser && <div className="hidden xl:block"><ActingAs label={role ?? session.user.email ?? "signed in"} /></div>}
            {isDemo && (
              <div className="hidden items-center gap-2 lg:flex">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground ring-1 ring-border">
                  <ScanLine className="size-3" strokeWidth={2.25} /> Demo · read-only
                </span>
                <Link to="/register" className="rounded-full bg-accent px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110">
                  Create account
                </Link>
                <button onClick={exitDemo} className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Exit</button>
              </div>
            )}
            <div className={realUser ? "xl:hidden" : isDemo ? "lg:hidden" : "md:hidden"}>
              <MobileNav mode={realUser ? "user" : isDemo ? "demo" : "anon"} navItems={navFor(role)}
                identity={role ?? session?.user.email ?? "signed in"} onDemo={exploreDemo} onExitDemo={exitDemo} />
            </div>
          </div>
        </div>
      </header>

      {/* Demo banner — makes the read-only-tour state unmistakable + nudges sign-up. */}
      {isDemo && !onPaper && (
        <div className="border-b border-accent/20 bg-accent/[0.07]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-6 py-2.5 text-sm">
            <span className="font-medium text-foreground">You're exploring the demo — read-only.</span>
            <span className="text-muted-foreground">Sign in to upload your own data and use the interactive tools.</span>
            <span className="ml-auto flex items-center gap-2">
              <Link to="/register" className="rounded-full bg-accent px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-accent-foreground transition hover:brightness-110">Create account</Link>
              <Link to="/login" className="rounded-full border border-border px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-foreground transition hover:border-accent">Sign in</Link>
            </span>
          </div>
        </div>
      )}

      <main className={onPaper ? "relative w-full flex-1" : "relative mx-auto w-full max-w-6xl flex-1 px-6 py-16"}>
        <Outlet />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-6 py-8">
          <span className={`size-1.5 rounded-full ${onPaper ? "bg-foreground" : "bg-signal"}`} />
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Portfolio demo — fake data only</p>
        </div>
      </footer>
    </div>
  )
}

function MobileNav({ mode, navItems, identity, onDemo, onExitDemo }: { mode: "user" | "demo" | "anon"; navItems: readonly { to: string; label: string }[]; identity: string; onDemo: () => void; onExitDemo: () => void }) {
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
          {mode === "user" && navItems.map((item) => (
            <Link key={item.to} to={item.to} onClick={() => setOpen(false)}
              className="rounded-xl px-4 py-3 font-mono text-sm uppercase tracking-widest transition-colors"
              activeProps={{ className: navLinkActive }} inactiveProps={{ className: navLinkIdle }}>
              {item.label}
            </Link>
          ))}
          {mode === "demo" && (
            <>
              {SHOWCASE.map((item) => (
                <Link key={item.to} to={item.to} onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-3 font-mono text-sm uppercase tracking-widest transition-colors"
                  activeProps={{ className: navLinkActive }} inactiveProps={{ className: navLinkIdle }}>
                  {item.label}
                </Link>
              ))}
              <Link to="/register" onClick={() => setOpen(false)} className={`rounded-xl px-4 py-3 font-mono text-sm uppercase tracking-widest ${navLinkIdle}`}>Create account</Link>
              <Link to="/login" onClick={() => setOpen(false)} className={`rounded-xl px-4 py-3 font-mono text-sm uppercase tracking-widest ${navLinkIdle}`}>Sign in</Link>
            </>
          )}
          {mode === "anon" && (
            <>
              <button onClick={() => { setOpen(false); onDemo() }} className={`rounded-xl px-4 py-3 text-left font-mono text-sm uppercase tracking-widest ${navLinkIdle}`}>Demo</button>
              <Link to="/about" onClick={() => setOpen(false)} className={`rounded-xl px-4 py-3 font-mono text-sm uppercase tracking-widest ${navLinkIdle}`}>O nás</Link>
              <Link to="/login" onClick={() => setOpen(false)} className={`rounded-xl px-4 py-3 font-mono text-sm uppercase tracking-widest ${navLinkIdle}`}>Prihlásiť</Link>
            </>
          )}
        </nav>
        {mode === "user" && (
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-4 py-4">
            <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              <span className="size-1.5 rounded-full bg-signal" /> {identity}
            </span>
            <Button variant="ghost" size="xs" className="font-mono text-[10px] uppercase tracking-wider"
              onClick={() => { setOpen(false); void supabase.auth.signOut() }}>Sign out</Button>
          </div>
        )}
        {mode === "demo" && (
          <div className="mt-auto border-t border-border px-4 py-4">
            <Button variant="ghost" size="xs" className="font-mono text-[10px] uppercase tracking-wider"
              onClick={() => { setOpen(false); onExitDemo() }}>Exit demo</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function ActingAs({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-card py-1 pr-1 pl-3 ring-1 ring-border">
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="size-1.5 rounded-full bg-signal" />
        {label}
      </span>
      <Button variant="ghost" size="xs" className="rounded-full font-mono text-[10px] uppercase tracking-wider"
        onClick={() => void supabase.auth.signOut()}>Sign out</Button>
    </div>
  )
}
