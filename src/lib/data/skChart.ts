import type { AccountType } from "./useAccounts"

/**
 * Auto-classify an account by the Slovak "rámcová účtová osnova" — maps a code to
 * its financial-statement type from its class (1st digit) and group (first 2–3
 * digits). Deterministic; the user can still override any row.
 *
 *   Trieda 0 — dlhodobý majetok            → asset
 *   Trieda 1 — zásoby                       → asset
 *   Trieda 2 — finančné účty                → asset (23/24 bankové úvery → liability)
 *   Trieda 3 — zúčtovacie vzťahy            → pohľadávky asset / záväzky liability
 *   Trieda 4 — kapitál a dlhodobé záväzky   → 41–43,49 equity; 45–48 liability
 *   Trieda 5 — náklady                      → expense
 *   Trieda 6 — výnosy                       → revenue
 *   Trieda 7 — uzávierkové účty             → equity
 */
export function skAccountType(code: string): AccountType {
  const c = code.trim()
  if (!c) return "expense"
  const cls = c[0]
  const grp = c.slice(0, 2)
  const syn = c.slice(0, 3)

  switch (cls) {
    case "0":
    case "1":
      return "asset"
    case "2":
      // 231/232 bankové úvery, 24x krátkodobé finančné výpomoci → záväzky
      return grp === "23" || grp === "24" ? "liability" : "asset"
    case "3":
      if (grp === "31" || grp === "35" || grp === "39") return "asset" // pohľadávky / vnútorné zúčtovanie
      if (grp === "38") {
        // časové rozlíšenie: náklady/príjmy budúcich období = aktíva; výnosy/výdavky = pasíva
        return syn === "381" || syn === "385" || syn === "388" ? "asset" : "liability"
      }
      if (syn === "335" || syn === "378") return "asset" // pohľadávky voči zamestnancom / iné pohľadávky
      return "liability" // 32 záväzky, 33 zamestnanci/inštitúcie, 34 dane, 36/37 záväzky
    case "4":
      return grp === "41" || grp === "42" || grp === "43" || grp === "49" ? "equity" : "liability"
    case "5":
      return "expense"
    case "6":
      return "revenue"
    case "7":
      return "equity"
    default:
      return "expense"
  }
}
