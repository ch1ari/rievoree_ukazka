import { createContext, useCallback, useEffect, useState, type ReactNode } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"

/**
 * The single source of truth for auth state, over the ONE supabase factory.
 *
 * Both entry points — the /login screen and the X-ray RLS demo tab — call
 * supabase.auth directly; this provider only LISTENS (getSession +
 * onAuthStateChange), so every sign-in/out from anywhere lands here and the
 * whole app (nav, guard, RLS banner) stays consistent. There is never a second
 * auth state to drift out of sync.
 *
 * `loading` starts true and only flips once the persisted session has been read
 * from localStorage. The route guard waits on this, so a page refresh can't
 * redirect to /login before the session has rehydrated.
 */
interface AuthState {
  session: Session | null
  user: User | null
  role: string | null
  loading: boolean
  /** Re-read the caller's role from profiles — call after a live role switch. */
  refreshRole: () => Promise<void>
}

export const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  role: null,
  loading: true,
  refreshRole: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    // Rehydrate the persisted session BEFORE the guard runs (refresh-survival).
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    // Single source of truth: login screen, RLS demo tab, token refresh, signOut
    // — every change flows through here.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return
      setSession(s)
      setLoading(false)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Resolve the caller's role from profiles (RLS: a user can read their own row).
  const uid = session?.user?.id
  const loadRole = useCallback(async () => {
    if (!uid) {
      setRole(null)
      return
    }
    const { data } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle()
    setRole((data?.role as string | undefined) ?? null)
  }, [uid])

  // Drives the "acting as <role>" label; re-runs whenever the identity changes.
  useEffect(() => {
    void loadRole()
  }, [loadRole])

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, role, loading, refreshRole: loadRole }}
    >
      {children}
    </AuthContext.Provider>
  )
}
