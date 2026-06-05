import { Link, Outlet } from "@tanstack/react-router"
import { XRayPanel } from "@/components/xray/XRayPanel"

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/ingest", label: "Ingest" },
  { to: "/reports", label: "Reports" },
  { to: "/connectors", label: "Connectors" },
  { to: "/users", label: "Users" },
  { to: "/account", label: "Account" },
] as const

/**
 * App frame: hard top hairline nav, oversized wordmark, whitespace below.
 * The X-ray trigger gets mounted in the right slot (Phase 1c seam).
 */
export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="text-xl font-bold tracking-tighter">
            X-RAY<span className="text-accent">/</span>
          </Link>
          <nav className="flex items-center gap-6">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "text-foreground underline decoration-accent decoration-2 underline-offset-8" }}
              >
                {item.label}
              </Link>
            ))}
            <XRayPanel />
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
