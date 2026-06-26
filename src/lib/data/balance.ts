import type { ReportRow } from "./useReport"

/**
 * Balance sheet + indirect cash-flow model from report rows (cumulative balances).
 * Assets are debit-normal (balance = Σ net); liabilities/equity are credit-normal
 * (balance = −Σ net). Retained earnings is the residual equity item, so the sheet
 * ties by construction: Total assets == Total liabilities + Total equity.
 */
export interface BsLine { code: string; label: string; amount: number }
export interface BalanceSheet {
  assets: BsLine[]; liabilities: BsLine[]; equity: BsLine[]
  totalAssets: number; totalLiabilities: number; totalEquity: number; check: number
}

export function buildBalanceSheet(rows: ReportRow[]): BalanceSheet {
  const byCode = new Map<string, { type: string; name: string; net: number }>()
  for (const r of rows) {
    const c = byCode.get(r.account_code) ?? { type: r.account_type, name: r.account_name, net: 0 }
    c.net += Number(r.net)
    byCode.set(r.account_code, c)
  }
  const lines = (type: string, sign: 1 | -1): BsLine[] =>
    [...byCode.entries()]
      .filter(([, v]) => v.type === type)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, v]) => ({ code, label: v.name, amount: sign * v.net }))

  const assets = lines("asset", 1)
  const liabilities = lines("liability", -1)
  const ownerEquity = lines("equity", -1)
  const totalAssets = assets.reduce((s, l) => s + l.amount, 0)
  const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0)
  const ownerEq = ownerEquity.reduce((s, l) => s + l.amount, 0)
  const retained = totalAssets - totalLiabilities - ownerEq // residual → sheet ties
  const equity = [...ownerEquity, { code: "RE", label: "Retained earnings", amount: retained }]
  const totalEquity = ownerEq + retained
  return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, check: totalAssets - (totalLiabilities + totalEquity) }
}

// ---- Indirect cash-flow waterfall ----------------------------------------
export interface WfStep { name: string; value: number; isTotal?: boolean }

/**
 * Indirect cash-flow over the trailing 12 months: Opening cash (balance before
 * the window) → Operating (NI ± ΔWC) → Investing (ΔInventory) → Financing
 * (ΔEquity) → Closing cash. With balanced books these tie exactly, so there is
 * no "Other" plug and Closing equals Cash on the balance sheet.
 */
export function cashFlowSteps(rows: ReportRow[]): WfStep[] {
  const periods = [...new Set(rows.map((r) => r.period.slice(0, 7)))].sort()
  const windowStart = Math.max(0, periods.length - 12)
  const idx = (p: string) => periods.indexOf(p.slice(0, 7))

  let opening = 0, cashAll = 0
  let revenue = 0, expenses = 0, dAr = 0, dInv = 0, dAp = 0, dEquity = 0
  for (const r of rows) {
    const net = Number(r.net), code = r.account_code, inWin = idx(r.period) >= windowStart
    if (code === "1000") { cashAll += net; if (!inWin) opening += net }
    if (!inWin) continue
    if (r.account_type === "revenue") revenue += Number(r.credit)
    else if (r.account_type === "expense") expenses += Number(r.debit)
    if (code === "1100") dAr += net
    else if (code === "1200") dInv += net
    else if (code === "2000") dAp += -net
    else if (code === "3000") dEquity += -net
  }
  const operating = (revenue - expenses) - dAr + dAp   // net income + working-capital change
  const investing = -dInv                              // inventory build = cash out
  const financing = dEquity                            // equity raised / returned
  return [
    { name: "Opening cash", value: opening, isTotal: true },
    { name: "Operating", value: operating },
    { name: "Investing", value: investing },
    { name: "Financing", value: financing },
    { name: "Closing cash", value: cashAll, isTotal: true },
  ]
}
