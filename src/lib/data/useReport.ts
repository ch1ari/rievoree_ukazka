import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"

/**
 * A row of public.report_account_monthly — the tenant-filtered view over the
 * private MV (migrations 11/12). RLS returns only the caller's entities, so the
 * SAME query yields different rows per role (viewer 1 entity, manager 2,
 * admin 4) — the panel's RLS demo, now on real pages.
 */
export interface ReportRow {
  entity_id: string
  period: string
  account_id: string
  account_code: string
  account_name: string
  account_type: string
  debit: number
  credit: number
  net: number
  entry_count: number
}

/**
 * Fetch the report rows the signed-in identity may see. The query key includes
 * the user id so switching identity (login or RLS demo) re-fetches instead of
 * serving another role's cached rows. Goes through the one supabase factory.
 */
export function useReport() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["report_account_monthly", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: async (): Promise<ReportRow[]> => {
      const { data, error } = await supabase
        .from("report_account_monthly")
        .select("*")
        .order("period", { ascending: false })
        .order("account_code", { ascending: true })
      if (error) throw error
      return (data ?? []) as ReportRow[]
    },
  })
}
