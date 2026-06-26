import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"
import { createMyEntity, renameMyEntity, deleteMyEntity, type ProvisionMode } from "@/lib/auth/mfa"

export interface MyEntity {
  id: string
  name: string
}

/** Entities the signed-in user OWNS (their personal sandboxes). */
export function useMyEntities() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["my-entities", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: async (): Promise<MyEntity[]> => {
      const { data, error } = await supabase
        .from("entities")
        .select("id,name,owner_id")
        .eq("owner_id", user!.id)
        .order("created_at")
      if (error) throw error
      return (data ?? []).map((e) => ({ id: e.id as string, name: e.name as string }))
    },
  })
}

/** Invalidate everything that depends on which entities exist / hold data. */
function useEntityInvalidation() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ["my-entities"] })
    qc.invalidateQueries({ queryKey: ["entities"] })
    qc.invalidateQueries({ queryKey: ["report_account_monthly"] })
  }
}

export function useCreateEntity() {
  const invalidate = useEntityInvalidation()
  return useMutation({
    mutationFn: async (v: { name: string; mode: ProvisionMode }) => {
      const { error } = await createMyEntity(v.name, v.mode)
      if (error) throw new Error(error)
    },
    onSuccess: invalidate,
  })
}

export function useRenameEntity() {
  const invalidate = useEntityInvalidation()
  return useMutation({
    mutationFn: async (v: { id: string; name: string }) => {
      const { error } = await renameMyEntity(v.id, v.name)
      if (error) throw new Error(error)
    },
    onSuccess: invalidate,
  })
}

export function useDeleteEntity() {
  const invalidate = useEntityInvalidation()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteMyEntity(id)
      if (error) throw new Error(error)
    },
    onSuccess: invalidate,
  })
}
