import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"

/** Seeded demo AR/AP invoice (public.invoices), RLS-filtered. Empty until
 *  migration 22 is applied (then the aging report populates). */
export interface Invoice {
  id: string
  entity_id: string
  kind: "ar" | "ap"
  counterparty: string
  issued_date: string
  due_date: string
  amount: number
  status: string
}

export function useInvoices() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["invoices", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, entity_id, kind, counterparty, issued_date, due_date, amount, status")
        .eq("status", "open")
      if (error) {
        if (error.code === "42P01" || /invoices/i.test(error.message)) return []
        throw error
      }
      return (data ?? []) as Invoice[]
    },
  })
}
