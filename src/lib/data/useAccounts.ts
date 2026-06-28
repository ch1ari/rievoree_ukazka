import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"
import { skAccountType } from "./skChart"

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
 * Guess an account's type — delegates to the Slovak "rámcová účtová osnova"
 * mapping (by class/group). A convenience default the user can override.
 */
export function guessAccountType(code: string): AccountType {
  return skAccountType(code)
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
