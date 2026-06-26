import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"
import { AppShell } from "./AppShell"
import { Account } from "@/pages/Account"
import { Connectors } from "@/pages/Connectors"
import { Dashboard } from "@/pages/Dashboard"
import { Ingest } from "@/pages/Ingest"
import { Landing } from "@/pages/Landing"
import { Login } from "@/pages/Login"
import { Register } from "@/pages/Register"
import { About } from "@/pages/About"
import { Reports } from "@/pages/Reports"
import { Pl } from "@/pages/Pl"
import { Balance } from "@/pages/Balance"
import { Pivot } from "@/pages/Pivot"
import { Variance } from "@/pages/Variance"
import { Aging } from "@/pages/Aging"
import { Users } from "@/pages/Users"

/**
 * Code-based route tree (no codegen): 7 pages from PLAN.md §4 under one
 * shell. Role guards arrive with auth (Phase 5) as `beforeLoad` checks on
 * the protected routes — the structure below already gives them a place.
 */
const rootRoute = createRootRoute({ component: AppShell })

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: Landing }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: Login,
    validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
      redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    }),
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/register", component: Register }),
  createRoute({ getParentRoute: () => rootRoute, path: "/about", component: About }),
  createRoute({ getParentRoute: () => rootRoute, path: "/dashboard", component: Dashboard }),
  createRoute({ getParentRoute: () => rootRoute, path: "/ingest", component: Ingest }),
  createRoute({ getParentRoute: () => rootRoute, path: "/reports", component: Reports }),
  createRoute({ getParentRoute: () => rootRoute, path: "/pl", component: Pl }),
  createRoute({ getParentRoute: () => rootRoute, path: "/balance", component: Balance }),
  createRoute({ getParentRoute: () => rootRoute, path: "/pivot", component: Pivot }),
  createRoute({ getParentRoute: () => rootRoute, path: "/variance", component: Variance }),
  createRoute({ getParentRoute: () => rootRoute, path: "/aging", component: Aging }),
  createRoute({ getParentRoute: () => rootRoute, path: "/connectors", component: Connectors }),
  createRoute({ getParentRoute: () => rootRoute, path: "/users", component: Users }),
  createRoute({ getParentRoute: () => rootRoute, path: "/account", component: Account }),
]

export const router = createRouter({
  routeTree: rootRoute.addChildren(routes),
  defaultPreload: "intent",
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
