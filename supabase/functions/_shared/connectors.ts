// ============================================================================
// Shared helpers for the connector edge functions.
//
//   * CSV → typed staging rows (the same shape ingest_connector_rows expects),
//     with header-alias mapping + formula-injection sanitization (PLAN §9).
//   * HMAC-SHA256 + constant-time compare (webhook signature + OAuth state).
//
// Kept dependency-free (Web Crypto only) so it runs in the Deno edge runtime.
// ============================================================================

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signature, x-delivery-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

export function json(status: number, body: unknown, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...(extraHeaders ?? {}) },
  })
}

export function log(component: string, level: "info" | "warn" | "error", msg: string, extra?: unknown) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(), level, component, msg,
    ...(extra ? { extra } : {}),
  }))
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---- Crypto ----------------------------------------------------------------

const enc = new TextEncoder()

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  )
}

/** Lowercase hex HMAC-SHA256 of `message` under `secret`. */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** Constant-time string compare (avoids leaking length/content via timing). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  // Always compare a fixed number of bytes; fold the length difference in.
  let diff = ab.length ^ bb.length
  const n = Math.max(ab.length, bb.length)
  for (let i = 0; i < n; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  }
  return diff === 0
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

// ---- Signed OAuth state (HMAC, no DB round-trip) ---------------------------

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4))
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad)
}

export async function signState(secret: string, payload: Record<string, unknown>): Promise<string> {
  const body = b64url(JSON.stringify(payload))
  const sig = await hmacHex(secret, body)
  return `${body}.${sig}`
}

export async function verifyState(secret: string, state: string): Promise<Record<string, unknown> | null> {
  const dot = state.lastIndexOf(".")
  if (dot < 0) return null
  const body = state.slice(0, dot)
  const sig = state.slice(dot + 1)
  const expected = await hmacHex(secret, body)
  if (!timingSafeEqual(sig, expected)) return null
  try { return JSON.parse(b64urlDecode(body)) } catch { return null }
}

// ---- CSV → typed rows ------------------------------------------------------

export interface StagingRow {
  account_code: string | null
  txn_date: string | null      // ISO yyyy-mm-dd or null
  description: string | null
  debit: string | null
  credit: string | null
  currency: string | null
  raw: Record<string, string>
}

const ALIASES: Record<string, string[]> = {
  account_code: ["account_code", "account", "code", "accountcode", "acct", "account no", "account number"],
  txn_date: ["txn_date", "date", "transaction_date", "posting_date", "day", "datum"],
  debit: ["debit", "dr", "debet", "md"],
  credit: ["credit", "cr", "kredit", "dal"],
  currency: ["currency", "ccy", "mena"],
  description: ["description", "desc", "memo", "narrative", "note", "popis"],
}

function norm(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, " ")
}

/** Strip a leading formula trigger so a cell can never execute in a spreadsheet. */
function sanitizeCell(v: string): string {
  const t = v.trim()
  if (/^[=+\-@\t\r]/.test(t)) return "'" + t
  return t
}

/** Split one CSV line honoring double-quoted fields ("" = literal quote). */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else { inQ = false }
      } else cur += c
    } else if (c === '"') inQ = true
    else if (c === ",") { out.push(cur); cur = "" }
    else cur += c
  }
  out.push(cur)
  return out
}

function toIsoDate(v: string): string | null {
  const t = v.trim()
  if (!t) return null
  // yyyy-mm-dd already
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
  // dd.mm.yyyy or dd/mm/yyyy
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  // yyyy/mm/dd
  m = t.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
  return null
}

function toNumber(v: string): string | null {
  const t = v.trim().replace(/\s/g, "").replace(/,(?=\d{3}\b)/g, "")
  if (!t) return null
  // allow comma decimal separator
  const cleaned = t.includes(",") && !t.includes(".") ? t.replace(",", ".") : t
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? cleaned : null
}

/** Parse CSV text into typed staging rows. Unmapped/unparseable fields become
 *  null and are caught downstream as validation_errors (same as the manual path). */
export function parseCsv(text: string): StagingRow[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() !== "")
  if (lines.length < 2) return []

  const headers = splitCsvLine(lines[0]).map(norm)
  const colOf: Record<string, number> = {}
  for (const [field, names] of Object.entries(ALIASES)) {
    // Normalize the alias list the SAME way as the headers, so "account_code"
    // (alias) and "account code" (normalized header) match — they otherwise
    // wouldn't, because norm() turns underscores into spaces.
    const normed = names.map(norm)
    const idx = headers.findIndex((h) => normed.includes(h))
    if (idx >= 0) colOf[field] = idx
  }

  const rows: StagingRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]).map(sanitizeCell)
    const get = (f: string): string => (colOf[f] != null ? (cells[colOf[f]] ?? "") : "")
    const raw: Record<string, string> = {}
    headers.forEach((h, idx) => { raw[h || `col${idx}`] = cells[idx] ?? "" })

    rows.push({
      account_code: get("account_code").replace(/^'/, "").trim() || null,
      txn_date: toIsoDate(get("txn_date").replace(/^'/, "")),
      description: get("description").replace(/^'/, "") || null,
      debit: toNumber(get("debit").replace(/^'/, "")),
      credit: toNumber(get("credit").replace(/^'/, "")),
      currency: (get("currency").replace(/^'/, "").trim().toUpperCase() || null),
      raw,
    })
  }
  return rows
}

/** The most common YYYY-MM across rows' dates → the batch period (first of month). */
export function dominantPeriod(rows: StagingRow[]): string | null {
  const counts = new Map<string, number>()
  for (const r of rows) if (r.txn_date) {
    const m = r.txn_date.slice(0, 7)
    counts.set(m, (counts.get(m) ?? 0) + 1)
  }
  let best: string | null = null, bestN = 0
  for (const [m, n] of counts) if (n > bestN) { best = m; bestN = n }
  return best ? `${best}-01` : null
}
