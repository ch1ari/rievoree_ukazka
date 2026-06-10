import { z } from "zod"

/**
 * Shape of `validation_rulesets.rules`. The DB only guarantees it is a JSON
 * object (a cheap CHECK); this Zod schema is the real contract — "rules as
 * data, interpreter in code". The worker reads required_columns / header_aliases
 * / date_formats / allowed_currencies / amount_mode; the zscore block is consumed
 * by the DB functions but is parsed here too so a malformed ruleset fails fast.
 */
export const RulesetSchema = z.object({
  required_columns: z.array(z.string()).default(["account_code", "txn_date"]),
  // canonical field -> accepted header spellings (the polymorphic reader)
  header_aliases: z.record(z.array(z.string())).default({}),
  date_formats: z.array(z.string()).default(["YYYY-MM-DD"]),
  allowed_currencies: z.array(z.string()).default(["EUR"]),
  amount_mode: z.enum(["split", "signed"]).default("split"),
  zscore: z
    .object({
      threshold: z.number(),
      min_history_periods: z.number().int(),
      trailing_months: z.number().int(),
    })
    .partial()
    .default({}),
})

export type Ruleset = z.infer<typeof RulesetSchema>

export function parseRuleset(raw: unknown): Ruleset {
  return RulesetSchema.parse(raw)
}
