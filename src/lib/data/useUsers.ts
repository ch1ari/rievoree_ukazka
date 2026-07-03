import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"

export type AppRole = "super_admin" | "admin" | "manager" | "viewer"

export interface OrgMember {
  id: string
  email: string
  full_name: string | null
  role: AppRole
  is_active: boolean
  is_self: boolean
  mfa_verified: boolean
  entities: { id: string; name: string }[]
  created_at: string
}

/** The admin user table: platform admin → everyone; scoped admin → members of
 *  owned entities. The RPC enforces "admin only" and the scoping server-side. */
export function useOrgMembers() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["org_members", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: async (): Promise<OrgMember[]> => {
      const { data, error } = await supabase.rpc("list_org_members")
      if (error) throw new Error(error.message)
      return (data ?? []) as OrgMember[]
    },
  })
}

/** Whether the signed-in caller is a GLOBAL platform admin (unlocks credential ops). */
export function useIsPlatformAdmin() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["is_platform_admin", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("is_platform_admin")
      if (error) throw new Error(error.message)
      return data === true
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ["org_members"] })
}

export function useAddMember() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { entityId: string; email: string }) => {
      const { error } = await supabase.rpc("add_org_member", { p_entity_id: v.entityId, p_email: v.email })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

export function useRemoveMember() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { entityId: string; userId: string }) => {
      const { error } = await supabase.rpc("remove_org_member", { p_entity_id: v.entityId, p_user_id: v.userId })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

export function useSetMemberRole() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc("admin_set_member_role", { p_user_id: v.userId, p_role: v.role })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

export function useSetUserActive() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { userId: string; active: boolean }) => {
      const { error } = await supabase.rpc("admin_set_user_active", { p_user_id: v.userId, p_active: v.active })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

export interface CreateUserResult { status: string; user_id: string; email: string; temp_password?: string }

export function useCreateUser() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { email: string; fullName?: string; role?: AppRole; entityId?: string; password?: string }): Promise<CreateUserResult> => {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "create_user", email: v.email, full_name: v.fullName, role: v.role, entity_id: v.entityId, password: v.password },
      })
      if (error) throw new Error(await fnError(error))
      return data as CreateUserResult
    },
    onSuccess: invalidate,
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (userId: string): Promise<string | undefined> => {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "reset_password", user_id: userId },
      })
      if (error) throw new Error(await fnError(error))
      return (data as { recovery_link?: string }).recovery_link
    },
  })
}

export function useResetMfa() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (userId: string): Promise<number> => {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "reset_mfa", user_id: userId },
      })
      if (error) throw new Error(await fnError(error))
      return (data as { factors_removed: number }).factors_removed
    },
    onSuccess: invalidate,
  })
}

async function fnError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.json()
      if (body?.error) return String(body.error)
    } catch { /* not JSON */ }
  }
  return error instanceof Error ? error.message : "request failed"
}
