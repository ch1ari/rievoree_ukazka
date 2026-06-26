import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense"

export interface Account {
  code: string
  name: string
  type: AccountType
}

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expense" },
]

/**
 * Guess an account's type from its code's leading digit — a convenience default
 * the user confirms/overrides. Tuned for SK/CZ charts (1–2 assets, 3 payables,
 * 4 capital, 5 expenses, 6 revenue); harmless elsewhere since it's editable.
 */
export function guessAccountType(code: string): AccountType {
  switch ((code.trim()[0] ?? "")) {
    case "1":
    case "2": return "asset"
    case "3": return "liability"
    case "4": return "equity"
    case "5": return "expense"
    case "6": return "revenue"
    default: return "expense"
  }
}

/** The chart of accounts for an entity (RLS: members can read). */
export function useEntityAccounts(entityId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["accounts", entityId ?? "none", user?.id ?? "anon"],
    enabled: Boolean(entityId && user),
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase
        .from("accounts")
        .select("code,name,type")
        .eq("entity_id", entityId)
        .order("code")
      if (error) throw error
      return (data ?? []) as Account[]
    },
  })
}

/** Add or update accounts on an entity's chart (manager/admin via RPC). */
export function useUpsertAccounts(entityId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (accounts: Account[]) => {
      const { error } = await supabase.rpc("upsert_accounts", {
        p_entity_id: entityId,
        p_accounts: accounts,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts", entityId ?? "none"] })
    },
  })
}
