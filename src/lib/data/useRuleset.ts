import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"

/**
 * The declarative ETL rules the worker interprets (validate → map → z-score).
 * Mirrors the worker's Zod schema; stored as JSON in validation_rulesets.
 */
export interface RulesetRules {
  required_columns: string[]
  header_aliases: Record<string, string[]>
  date_formats: string[]
  allowed_currencies: string[]
  amount_mode: "split" | "signed"
  zscore: { threshold?: number; min_history_periods?: number; trailing_months?: number }
}

export interface EffectiveRuleset {
  rules: RulesetRules
  scope: "entity" | "global"
  version: number | null
}

/** A safe baseline if neither an entity nor a global ruleset is readable. */
export const DEFAULT_RULES: RulesetRules = {
  required_columns: ["account_code", "txn_date"],
  header_aliases: {
    account_code: ["account", "acct", "account code"],
    txn_date: ["date", "posting date"],
    debit: ["dr", "debit"],
    credit: ["cr", "credit"],
    amount: ["amount", "value"],
    description: ["memo", "narrative"],
    currency: ["ccy", "currency"],
  },
  date_formats: ["YYYY-MM-DD", "DD.MM.YYYY", "MM/DD/YYYY"],
  allowed_currencies: ["EUR", "USD", "GBP"],
  amount_mode: "split",
  zscore: { threshold: 3.0, min_history_periods: 3, trailing_months: 12 },
}

/**
 * The ruleset in effect for an entity: the entity's own active version if it has
 * one, otherwise the global default (entity_id is null). RLS lets a manager read
 * both. Returns the merged effective rules + which scope they came from.
 */
export function useEntityRuleset(entityId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["ruleset", entityId ?? "none", user?.id ?? "anon"],
    enabled: Boolean(entityId && user),
    queryFn: async (): Promise<EffectiveRuleset> => {
      const { data, error } = await supabase
        .from("validation_rulesets")
        .select("entity_id,version,rules,is_active")
        .or(`entity_id.eq.${entityId},entity_id.is.null`)
        .eq("is_active", true)
      if (error) throw error
      const rows = data ?? []
      const own = rows.find((r) => r.entity_id === entityId)
      const global = rows.find((r) => r.entity_id === null)
      const chosen = own ?? global
      return {
        rules: { ...DEFAULT_RULES, ...((chosen?.rules as RulesetRules) ?? {}) },
        scope: own ? "entity" : "global",
        version: (chosen?.version as number | undefined) ?? null,
      }
    },
  })
}

/** Publish a new active ruleset version for an entity (manager+ via RPC). */
export function useSaveRuleset(entityId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rules: RulesetRules) => {
      const { data, error } = await supabase.rpc("set_entity_ruleset", {
        p_entity_id: entityId,
        p_rules: rules,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ruleset", entityId ?? "none"] })
    },
  })
}
