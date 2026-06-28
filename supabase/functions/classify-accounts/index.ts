// ============================================================================
// Edge function: classify-accounts
//
// Auto-maps account codes to their financial-statement type by the Slovak
// "rámcová účtová osnova" (class/group). The frontend's "Auto-map" button can
// call this so users don't classify accounts by hand.
//
//   POST { "codes": ["311000","602000","343000", ...] }
//   200  { "mapping": { "311000":"asset", "602000":"revenue", "343000":"liability" } }
//
// Deterministic and self-contained (no DB, no secrets). verify_jwt stays on
// (config default), so only signed-in callers reach it.
// ============================================================================

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

/** Slovak rámcová účtová osnova → statement type, by class (1st digit) + group. */
function skAccountType(code: string): AccountType {
  const c = (code ?? "").trim()
  if (!c) return "expense"
  const cls = c[0]
  const grp = c.slice(0, 2)
  const syn = c.slice(0, 3)

  switch (cls) {
    case "0":
    case "1":
      return "asset" // dlhodobý majetok, zásoby
    case "2":
      return grp === "23" || grp === "24" ? "liability" : "asset" // 23/24 úvery/výpomoci
    case "3":
      if (grp === "31" || grp === "35" || grp === "39") return "asset" // pohľadávky / vnútorné
      if (grp === "38") return syn === "381" || syn === "385" || syn === "388" ? "asset" : "liability"
      if (syn === "335" || syn === "378") return "asset"
      return "liability" // 32 záväzky, 33/34 zamestnanci/dane, 36/37 záväzky
    case "4":
      return grp === "41" || grp === "42" || grp === "43" || grp === "49" ? "equity" : "liability"
    case "5":
      return "expense"
    case "6":
      return "revenue"
    case "7":
      return "equity" // uzávierkové účty
    default:
      return "expense"
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json(405, { error: "method not allowed" })

  const body = await req.json().catch(() => null)
  const codes = (body as { codes?: unknown })?.codes
  if (!Array.isArray(codes)) {
    return json(400, { error: "body must be { codes: string[] }" })
  }

  const mapping: Record<string, AccountType> = {}
  for (const code of codes) {
    if (typeof code === "string" && code.trim()) mapping[code] = skAccountType(code)
  }
  return json(200, { mapping })
})
