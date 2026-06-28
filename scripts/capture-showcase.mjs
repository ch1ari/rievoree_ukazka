/**
 * Regenerate the three landing-page "Showcase" screenshots so they always match
 * the CURRENT app UI (headings, status labels, layout). Captured at 1280×800 to
 * match the existing assets.
 *
 *   npm i -D playwright-core      # one-time (uses your installed Chromium)
 *   node scripts/capture-showcase.mjs
 *
 * It runs the app from the dev server (default http://localhost:5173 — override
 * with APP_URL) and signs in as a manager. Two modes:
 *
 *  • LIVE backend (recommended, fully faithful): start your stack first
 *      supabase start && npm run dev
 *    then run with  SHOWCASE_LIVE=1 SHOWCASE_EMAIL=… SHOWCASE_PASSWORD=…  so it
 *    logs into the real seeded data and screenshots it.
 *
 *  • MOCKED (default, no backend needed): intercepts the Supabase REST layer and
 *    feeds representative data, so the screenshots reflect the real components
 *    and copy even without a running database. Numbers are illustrative.
 *
 * Chromium: set CHROME_PATH, else common Playwright/system paths are tried.
 */
import { chromium } from "playwright-core"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { existsSync } from "node:fs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, "../src/assets/showcase")
const APP_URL = process.env.APP_URL || "http://localhost:5173"
const LIVE = process.env.SHOWCASE_LIVE === "1"
const VIEWPORT = { width: 1280, height: 800 }

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean)
  for (const c of candidates) if (existsSync(c)) return c
  return undefined // let playwright resolve its bundled browser
}

// ---- Synthetic data (MOCKED mode) -----------------------------------------
const ENTITIES = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Northwind Trading" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Acme Industries" },
]
const ACCOUNTS = [
  { code: "4000", name: "Predaj tovaru", type: "revenue", base: 142000, kind: "credit" },
  { code: "4100", name: "Tržby za služby", type: "revenue", base: 58000, kind: "credit" },
  { code: "5010", name: "Spotreba materiálu", type: "expense", base: 61000, kind: "debit" },
  { code: "6000", name: "Mzdové náklady", type: "expense", base: 47000, kind: "debit" },
  { code: "6200", name: "Energie", type: "expense", base: 9400, kind: "debit" },
  { code: "6300", name: "Nájomné", type: "expense", base: 12500, kind: "debit" },
  { code: "1000", name: "Banka", type: "asset", base: 23000, kind: "debit" },
  { code: "1100", name: "Pohľadávky", type: "asset", base: 31000, kind: "debit" },
]

function months(n) {
  // n trailing months ending 2026-06, as YYYY-MM-01.
  const out = []
  let y = 2026, m = 6
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}-01`)
    m--; if (m === 0) { m = 12; y-- }
  }
  return out
}

function reportRows() {
  const rows = []
  const periods = months(18)
  ENTITIES.forEach((e, ei) => {
    periods.forEach((period, pi) => {
      ACCOUNTS.forEach((a, ai) => {
        // Deterministic, gently growing + seasonal wobble (no RNG → stable diffs).
        const growth = 1 + pi * 0.015 + ei * 0.08
        const wobble = 1 + 0.12 * Math.sin((pi + ai) * 0.9)
        const amount = Math.round(a.base * growth * wobble)
        const debit = a.kind === "debit" ? amount : 0
        const credit = a.kind === "credit" ? amount : 0
        rows.push({
          entity_id: e.id, period, account_id: `${e.id}-${a.code}`,
          account_code: a.code, account_name: a.name, account_type: a.type,
          debit, credit, net: debit - credit, entry_count: 6 + ((pi + ai) % 9),
        })
      })
    })
  })
  return rows
}

function batches() {
  const mk = (id, entity, file, period, status, stats) => ({
    id, entity_id: entity, file_name: file, period, status, stats,
    error_summary: null, created_at: `2026-06-${id}T09:${id}:00Z`,
  })
  return [
    mk("18", ENTITIES[0].id, "june-2026.csv", "2026-06-01", "awaiting_review", { rows_total: 312, flagged_accounts: 2, rows_loaded: 0 }),
    mk("15", ENTITIES[1].id, "may-2026.csv", "2026-05-01", "loaded", { rows_total: 298, flagged_accounts: 0, rows_loaded: 298 }),
    mk("12", ENTITIES[0].id, "apr-2026.csv", "2026-04-01", "loaded", { rows_total: 305, flagged_accounts: 0, rows_loaded: 305 }),
    mk("09", ENTITIES[1].id, "mar-2026.csv", "2026-03-01", "loaded", { rows_total: 287, flagged_accounts: 0, rows_loaded: 287 }),
    mk("06", ENTITIES[0].id, "feb-2026.csv", "2026-02-01", "loaded", { rows_total: 301, flagged_accounts: 0, rows_loaded: 301 }),
  ]
}

const SESSION = {
  access_token: "mock.access.token",
  refresh_token: "mock-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
  user: {
    id: "99999999-9999-4999-8999-999999999999",
    aud: "authenticated", role: "authenticated",
    email: "manager@x-ray.local",
    app_metadata: { provider: "email" }, user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  },
}

function mockBody(url, isObject) {
  const u = new URL(url)
  const p = u.pathname
  if (p.includes("/rest/v1/profiles")) return isObject ? { role: "manager" } : [{ role: "manager" }]
  if (p.includes("/rest/v1/entities")) return ENTITIES
  if (p.includes("/rest/v1/ingest_batches")) return batches()
  if (p.includes("/rest/v1/report_account_monthly")) return reportRows()
  if (p.includes("/rest/v1/accounts")) return []
  if (p.includes("/auth/v1/user")) return SESSION.user
  if (p.includes("/auth/v1/token")) return SESSION
  if (p.startsWith("/rest/v1/rpc/")) return isObject ? {} : []
  if (p.includes("/rest/v1/")) return [] // any other table
  if (p.includes("/functions/v1/")) return {}
  return null
}

async function installMocks(page) {
  await page.addInitScript((session) => {
    try { localStorage.setItem("sb-127-auth-token", JSON.stringify(session)) } catch {}
  }, SESSION)

  await page.route("**/*", async (route) => {
    const req = route.request()
    const url = req.url()
    if (!url.includes("127.0.0.1:54321")) return route.continue() // app assets etc.
    if (url.includes("/realtime/")) return route.abort()           // let WS fail quietly
    const accept = req.headers()["accept"] || ""
    const isObject = accept.includes("pgrst.object")
    const body = mockBody(url, isObject)
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "content-range": "0-200/*" },
      body: JSON.stringify(body ?? []),
    })
  })
}

async function shoot(page, path, file, after) {
  await page.goto(`${APP_URL}${path}`, { waitUntil: "networkidle" }).catch(() => {})
  await page.waitForTimeout(1600)
  if (after) await after(page)
  await page.screenshot({ path: `${OUT}/${file}` })
  console.log(`✓ ${file}  (${path})`)
}

const browser = await chromium.launch({ executablePath: findChrome() })
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
const page = await ctx.newPage()

if (LIVE) {
  // Real backend: sign in through the actual login screen, then screenshot.
  const email = process.env.SHOWCASE_EMAIL, password = process.env.SHOWCASE_PASSWORD
  if (!email || !password) { console.error("LIVE mode needs SHOWCASE_EMAIL + SHOWCASE_PASSWORD"); process.exit(1) }
  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2500)
} else {
  await installMocks(page)
}

// 01 — Ingest (upload + batches). 02 — Reports (RLS-scoped roll-up).
await shoot(page, "/ingest", "01-ingest.png")
await shoot(page, "/reports", "02-isolated.png")
// 03 — the X-ray console, opened over the Reports page (full of live calls).
await shoot(page, "/reports", "03-observable.png", async (pg) => {
  await pg.click('button[aria-label="Open X-ray panel"]').catch(() => {})
  await pg.waitForTimeout(1200)
})

await browser.close()
console.log("done →", OUT)
