import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"

/** A seeded demo budget row (public.budgets), RLS-filtered to the caller's
 *  entities. Until migration 21 is applied the table doesn't exist — we treat
 *  that as "no budget yet" so the P&L still renders Actual. */
export interface BudgetRow {
  entity_id: string
  period: string
  account_code: string
  amount: number
}

export function useBudget() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["budgets", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: async (): Promise<BudgetRow[]> => {
      const { data, error } = await supabase
        .from("budgets")
        .select("entity_id, period, account_code, amount")
      if (error) {
        // 42P01 = undefined_table (migration not applied yet) → no budgets.
        if (error.code === "42P01" || /budgets/i.test(error.message)) return []
        throw error
      }
      return (data ?? []) as BudgetRow[]
    },
  })
}
