import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"

/** RLS-scoped entities the signed-in identity can see (id + name). */
export function useEntities() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["entities", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const { data, error } = await supabase
        .from("entities")
        .select("id,name")
        .order("name")
      if (error) throw error
      return (data ?? []) as { id: string; name: string }[]
    },
  })
}
