# Phase 1 — Access & Marketing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public "front door" — hybrid lime/dark theming by route, a public nav (Demo · O nás · Sign in), an `/about` page, a redesigned auth surface with real registration + optional TOTP 2FA, and a sample-data sandbox for new users.

**Architecture:** Route-driven theming in `AppShell` (`PAPER_ROUTES` set decides `.paper` lime vs dark chrome; auth routes now render inside lime chrome instead of bare). New `/register` + `/about` routes. Thin MFA helper module wraps Supabase `auth.mfa.*`. A reusable `TwoFactorEnroll` (QR + verify) is used at registration and a `TwoFactorChallenge` steps up login to aal2. One SQL migration grants every new profile read-only membership to sample entities (RLS already enforces read-only tenant scoping).

**Tech Stack:** React 19, TanStack Router + Query, motion/react, Supabase JS 2.107 (auth + MFA/TOTP), Tailwind v4 (token-driven `.paper` scope), Vite.

## Global Constraints

- **No unit-test harness exists.** Per-task verification = `npx tsc -b` (must exit 0) + browser verification via Chrome DevTools MCP (navigate/evaluate/screenshot) against the running dev server at `http://localhost:5173/`. No pytest/vitest.
- **Migrations**: authored as SQL files in `supabase/migrations/`; **Mariia applies them** (read-only MCP). Do not apply via MCP. Next timestamp: `20260625000001`.
- **Do NOT push to GitHub.** Keep changes in the working tree. Do NOT commit to `main` unasked; if a commit is wanted, branch first. (The session has been working-tree-only — continue that.) Wherever a task says "Checkpoint", that means typecheck + browser-verify, not `git commit`.
- **Honesty invariant**: every figure/snippet shown is real (real queries or `?raw`); no invented numbers. About-page figures reuse the already-vetted real stats (€3.06M / 936 / 4 / 18).
- **Design**: lime `#A3E635` + black ink + Big Shoulders for paper routes; dark theme unchanged for product routes. 60 FPS (animate transform/opacity only); `prefers-reduced-motion` → no motion. No external images (grain = SVG/CSS).
- **Slovak chat / English code + comments.**
- Demo credentials (already seeded): `demo@demo.local` / `viewer@…` / `manager@…` / `admin@…`, password `demo123456`.

---

## File Structure

Create:
- `src/lib/auth/mfa.ts` — MFA helper wrappers (enroll/challenge+verify/list/unenroll/getAAL) + a `signUpWithProfile` wrapper.
- `src/components/auth/TwoFactorEnroll.tsx` — QR + secret + 6-digit verify (used by Register; reusable by Account later).
- `src/components/auth/TwoFactorChallenge.tsx` — 6-digit code prompt that steps login up to aal2.
- `src/components/auth/AuthShell.tsx` — lime "paper" wrapper for auth pages (brand + PaperBackground + `.paper` scope + centered card).
- `src/pages/Register.tsx` — registration form (name/email/password + 2FA toggle) → signUp → optional enroll.
- `src/pages/About.tsx` — lime marketing/portfolio page.
- `supabase/migrations/20260625000001_sample_sandbox.sql` — `entities.is_sample` + sample-membership trigger.

Modify:
- `src/app/router.tsx` — register `/about` and `/register` routes.
- `src/app/AppShell.tsx` — `PAPER_ROUTES`, hybrid header/footer, public nav (Demo · O nás · Sign in), render auth routes inside lime chrome.
- `src/pages/Login.tsx` — redesign in lime via `AuthShell`; 3 clear paths; MFA challenge on sign-in.
- `src/pages/Landing.tsx` — point the hero "Sign up" link to `/register`.

---

## Task 1: Routes + hybrid theming + public nav

**Files:**
- Modify: `src/app/router.tsx`
- Modify: `src/app/AppShell.tsx`
- Create (stubs this task, filled later): `src/pages/About.tsx`, `src/pages/Register.tsx`

**Interfaces:**
- Produces: routes `/about` (component `About`) and `/register` (component `Register`); `PAPER_ROUTES: Set<string>` semantics ("/", "/about", "/login", "/register" are lime). Public header items: Demo (calls exploreDemo), O nás (`/about`), Prihlásiť (`/login`).

- [ ] **Step 1: Create minimal stub pages so routes resolve**

`src/pages/About.tsx`:
```tsx
export function About() {
  return <div className="px-6 py-20 text-foreground">About — placeholder</div>
}
```
`src/pages/Register.tsx`:
```tsx
export function Register() {
  return <div className="px-6 py-20 text-foreground">Register — placeholder</div>
}
```

- [ ] **Step 2: Register the routes**

In `src/app/router.tsx`, add imports and two routes (public):
```tsx
import { About } from "@/pages/About"
import { Register } from "@/pages/Register"
// ...inside routes array:
createRoute({ getParentRoute: () => rootRoute, path: "/about", component: About }),
createRoute({ getParentRoute: () => rootRoute, path: "/register", component: Register }),
```

- [ ] **Step 3: Hybrid theming + public nav in AppShell**

In `src/app/AppShell.tsx`: replace the single-route `onPaper` and the bare `/login` return. Add a `PAPER_ROUTES` set; treat auth routes as paper-with-chrome.

```tsx
// Routes that wear the lime "green paper" skin (marketing + auth).
const PAPER_ROUTES = new Set(["/", "/about", "/login", "/register"])
// ...
const onPaper = PAPER_ROUTES.has(path)
```

Remove the `if (path === "/login") return <Outlet />` bare branch (auth now renders inside chrome). Keep the `loading` branch and the guard.

Update the public (logged-out) desktop nav to Demo · O nás · Sign in. Replace the `!session` branch of the desktop `<nav>`:
```tsx
{session ? (
  NAV.map((item) => (
    <Link key={item.to} to={item.to} className={navLinkBase}
      activeProps={{ className: navLinkActive }} inactiveProps={{ className: navLinkIdle }}>
      {item.label}
    </Link>
  ))
) : (
  <>
    <button onClick={exploreDemo} className={`${navLinkBase} ${navLinkIdle}`}>Demo</button>
    <Link to="/about" className={navLinkBase} activeProps={{ className: navLinkActive }} inactiveProps={{ className: navLinkIdle }}>O nás</Link>
    <Link to="/login" className={`${navLinkBase} ${navLinkIdle}`}>Prihlásiť</Link>
  </>
)}
```
Add an `exploreDemo` helper in AppShell (same call Landing uses), since the Demo nav button needs it:
```tsx
import { useNavigate } from "@tanstack/react-router"
// inside AppShell:
const navigate = useNavigate()
async function exploreDemo() {
  const { error } = await supabase.auth.signInWithPassword({ email: "demo@demo.local", password: "demo123456" })
  if (!error) navigate({ to: "/dashboard" })
}
```
Update the mobile drawer's logged-out links the same way (Demo button, O nás, Prihlásiť).

The header/footer already branch on `onPaper` (paper class vs dark). Confirm both still compile with the new `onPaper`.

- [ ] **Step 4: Point Landing "Sign up" to /register**

In `src/pages/Landing.tsx`, the hero secondary CTA `<Link to="/login">Sign up</Link>` → `<Link to="/register">Sign up</Link>`.

- [ ] **Step 5: Verify (typecheck + browser)**

Run: `npx tsc -b` → expect exit 0.
Browser (dev server already runs on :5173):
- Navigate `/about` and `/register` → placeholder text renders inside the **lime** chrome (header transparent, ink text), not dark, not 404.
- Navigate `/login` → renders inside lime chrome (no longer bare).
- Navigate `/dashboard` (after exploreDemo) → **dark** chrome.
- Logged-out header shows Demo · O nás · Prihlásiť; clicking Demo signs in as demo and lands on /dashboard.
Verify via evaluate_script: `getComputedStyle(document.querySelector('main')).…` or check `document.querySelector('.paper')` presence per route. Screenshot `/about` and `/login`.

- [ ] **Step 6: Checkpoint** — typecheck clean + the four routes themed correctly + nav correct. (No commit.)

---

## Task 2: About page (lime marketing/portfolio)

**Files:**
- Modify: `src/pages/About.tsx`

**Interfaces:**
- Consumes: `.paper` scope (provided by AppShell for `/about`), existing utility classes `.display`/`.poster`/`.stencil`, `motion/react`.
- Produces: none.

- [ ] **Step 1: Implement the About content**

Replace `src/pages/About.tsx` with an honest portfolio/about page using the lime design language. Real content only (no invented metrics; reuse the real figures). Example structure (adjust copy with Mariia's real details; keep placeholders for external links per deploy rules):
```tsx
import { motion } from "motion/react"

const STACK = ["React 19", "TypeScript", "Vite", "Tailwind v4", "TanStack", "recharts", "Supabase", "Postgres", "Edge / Deno", "Docker", "pg_cron", "pg_net", "RLS"]

export function About() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20 md:py-28">
      <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">About</span>
      <h1 className="poster mt-3 text-[clamp(2rem,7vw,4.5rem)] leading-[0.9] text-foreground">
        A real backend, made visible.
      </h1>
      <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        X-Ray is a financial reporting engine built backend-first: messy spreadsheets in,
        validated and anomaly-screened reports out — with row-level security, a real ETL
        pipeline, scheduled jobs, and a live X-ray of every layer. This site is the demo:
        explore it read-only, or create an account.
      </motion.p>
      <div className="mt-10 flex flex-wrap gap-2">
        {STACK.map((s) => (
          <span key={s} className="rounded-full border border-border px-3 py-1.5 font-mono text-xs text-foreground/75">{s}</span>
        ))}
      </div>
      {/* Real, vetted demo figures (same provenance as the landing). */}
      <div className="mt-12 grid grid-cols-2 gap-px border-t border-border pt-10 md:grid-cols-4">
        {[["€3.06M","processed · total debit"],["936","account-months"],["4","entities · RLS-scoped"],["18","monthly periods"]].map(([n,l]) => (
          <div key={l as string} className="py-4">
            <div className="display text-4xl text-foreground md:text-5xl">{n}</div>
            <div className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>
      <p className="mt-12 text-sm text-muted-foreground">
        Built by Capila. Source &amp; CV links are placeholders in this demo.
      </p>
    </section>
  )
}
```

- [ ] **Step 2: Verify** — `npx tsc -b` exit 0; navigate `/about`, screenshot (lime, ink, Big Shoulders headline, stack chips hairline, real figures). Mobile screenshot (390px) — stacks, readable. Reduced-motion respected (the one motion.p just appears).

- [ ] **Step 3: Checkpoint** — About renders in lime, honest content, responsive.

---

## Task 3: MFA helper module

**Files:**
- Create: `src/lib/auth/mfa.ts`

**Interfaces:**
- Produces (exact signatures consumed by Tasks 4 & 5):
  - `signUpWithProfile(email: string, password: string, fullName: string): Promise<{ needsConfirmation: boolean; error: string | null }>`
  - `enrollTotp(): Promise<{ factorId: string; qrSvg: string; secret: string; error: string | null }>`
  - `verifyTotp(factorId: string, code: string): Promise<{ error: string | null }>`
  - `unenrollTotp(factorId: string): Promise<void>`
  - `listTotpFactors(): Promise<{ id: string; status: "verified" | "unverified" }[]>`
  - `needsMfaChallenge(): Promise<boolean>` (true iff currentLevel aal1 && nextLevel aal2)
  - `getVerifiedFactorId(): Promise<string | null>`

- [ ] **Step 1: Implement the helpers**

```tsx
import { supabase } from "@/lib/supabase"

function msg(e: unknown): string | null {
  if (!e) return null
  return e instanceof Error ? e.message : String((e as { message?: string }).message ?? e)
}

/** Create an account and stash full_name in user metadata. The DB trigger creates the
 *  profile (viewer) + sample-entity membership. needsConfirmation=true when Supabase
 *  email confirmations are on (no session yet). */
export async function signUpWithProfile(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { full_name: fullName } },
  })
  return { needsConfirmation: !error && !data.session, error: msg(error) }
}

/** Begin TOTP enrollment; returns the QR (SVG markup, not an external image) + secret. */
export async function enrollTotp() {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" })
  if (error || !data) return { factorId: "", qrSvg: "", secret: "", error: msg(error) ?? "enroll failed" }
  return { factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret, error: null }
}

/** Verify a 6-digit code against a factor (challenge + verify in one). */
export async function verifyTotp(factorId: string, code: string) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
  return { error: msg(error) }
}

export async function unenrollTotp(factorId: string) {
  await supabase.auth.mfa.unenroll({ factorId })
}

export async function listTotpFactors() {
  const { data } = await supabase.auth.mfa.listFactors()
  return (data?.totp ?? []).map((f) => ({ id: f.id, status: f.status as "verified" | "unverified" }))
}

export async function needsMfaChallenge() {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  return data?.currentLevel === "aal1" && data?.nextLevel === "aal2"
}

export async function getVerifiedFactorId() {
  const factors = await listTotpFactors()
  return factors.find((f) => f.status === "verified")?.id ?? null
}
```

- [ ] **Step 2: Verify** — `npx tsc -b` exit 0 (this confirms the Supabase MFA types resolve against 2.107). No UI yet.

- [ ] **Step 3: Checkpoint** — helpers compile; signatures locked for Tasks 4–5.

---

## Task 4: AuthShell + TwoFactorEnroll + Register page

**Files:**
- Create: `src/components/auth/AuthShell.tsx`
- Create: `src/components/auth/TwoFactorEnroll.tsx`
- Modify: `src/pages/Register.tsx`

**Interfaces:**
- Consumes: `signUpWithProfile`, `enrollTotp`, `verifyTotp`, `unenrollTotp` (Task 3).
- Produces: `AuthShell` (props `{ title: string; children: ReactNode }`), `TwoFactorEnroll` (props `{ onVerified: () => void; onSkip?: () => void }`).

- [ ] **Step 1: AuthShell (lime card wrapper)**

`src/components/auth/AuthShell.tsx`:
```tsx
import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"

/** Lime "paper" wrapper for auth pages. AppShell already supplies the .paper scope +
 *  header for /login and /register, so this just centres a hairline card. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <h1 className="poster text-[clamp(1.8rem,6vw,3rem)] leading-[0.9] text-foreground">{title}</h1>
      <div className="mt-8 rounded-[1.5rem] border border-border p-6 md:p-8">{children}</div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Or <Link to="/" className="font-semibold text-foreground underline-offset-4 hover:underline">explore the demo</Link> — no account needed.
      </p>
    </section>
  )
}
```

- [ ] **Step 2: TwoFactorEnroll (QR + verify)**

`src/components/auth/TwoFactorEnroll.tsx`:
```tsx
import { useEffect, useRef, useState } from "react"
import { enrollTotp, verifyTotp, unenrollTotp } from "@/lib/auth/mfa"

export function TwoFactorEnroll({ onVerified, onSkip }: { onVerified: () => void; onSkip?: () => void }) {
  const [qrSvg, setQrSvg] = useState("")
  const [secret, setSecret] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const factorId = useRef("")

  useEffect(() => {
    let active = true
    enrollTotp().then((r) => {
      if (!active) return
      if (r.error) { setError(r.error); return }
      factorId.current = r.factorId; setQrSvg(r.qrSvg); setSecret(r.secret)
    })
    // On unmount before verifying, drop the unverified factor so retries are clean.
    return () => { active = false; if (factorId.current) unenrollTotp(factorId.current).catch(() => {}) }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await verifyTotp(factorId.current, code.trim())
    setBusy(false)
    if (error) { setError(error); return }
    factorId.current = "" // verified — don't unenroll on unmount
    onVerified()
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">Scan this with an authenticator app (Google Authenticator, 1Password…), then enter the 6-digit code.</p>
      {qrSvg
        ? <div className="mt-4 inline-block rounded-xl bg-foreground/[0.04] p-3" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        : <div className="mt-4 h-40 animate-pulse rounded-xl bg-foreground/[0.06]" />}
      {secret && <p className="mt-2 break-all font-mono text-xs text-muted-foreground">Secret: {secret}</p>}
      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)}
          placeholder="123456" className="flex-1 rounded-full border border-border bg-foreground/[0.04] px-5 py-3 text-foreground outline-none focus:border-foreground/60" />
        <button type="submit" disabled={busy || code.length < 6}
          className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-50">
          {busy ? "Verifying…" : "Verify"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {onSkip && <button onClick={onSkip} className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:underline">Skip for now</button>}
    </div>
  )
}
```
Note: `qr_code` from Supabase is an SVG string — rendered inline (no external image), honoring "no images". `dangerouslySetInnerHTML` is acceptable here (trusted Supabase-generated SVG).

- [ ] **Step 3: Register page**

`src/pages/Register.tsx`:
```tsx
import { useState } from "react"
import { useNavigate, Link } from "@tanstack/react-router"
import { AuthShell } from "@/components/auth/AuthShell"
import { TwoFactorEnroll } from "@/components/auth/TwoFactorEnroll"
import { signUpWithProfile } from "@/lib/auth/mfa"

type Stage = "form" | "enroll" | "confirm"

export function Register() {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>("form")
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [want2fa, setWant2fa] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { needsConfirmation, error } = await signUpWithProfile(email.trim(), password, fullName.trim())
    setBusy(false)
    if (error) { setError(error); return }
    if (needsConfirmation) { setStage("confirm"); return }     // email confirmations ON
    if (want2fa) { setStage("enroll"); return }                // session exists → can enroll
    navigate({ to: "/dashboard" })
  }

  if (stage === "confirm") return (
    <AuthShell title="Check your email">
      <p className="text-sm text-muted-foreground">We sent a confirmation link to <span className="text-foreground">{email}</span>. Confirm it, then sign in. You can enable 2FA from your account afterwards.</p>
      <Link to="/login" className="mt-5 inline-block rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground">Go to sign in</Link>
    </AuthShell>
  )

  if (stage === "enroll") return (
    <AuthShell title="Enable 2FA">
      <TwoFactorEnroll onVerified={() => navigate({ to: "/dashboard" })} onSkip={() => navigate({ to: "/dashboard" })} />
    </AuthShell>
  )

  return (
    <AuthShell title="Create your account">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" required
          className="rounded-full border border-border bg-foreground/[0.04] px-5 py-3 text-foreground outline-none focus:border-foreground/60" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required
          className="rounded-full border border-border bg-foreground/[0.04] px-5 py-3 text-foreground outline-none focus:border-foreground/60" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 chars)" required minLength={6}
          className="rounded-full border border-border bg-foreground/[0.04] px-5 py-3 text-foreground outline-none focus:border-foreground/60" />
        <label className="mt-1 flex items-center gap-3 text-sm text-foreground">
          <input type="checkbox" checked={want2fa} onChange={(e) => setWant2fa(e.target.checked)} className="size-4 accent-[#A3E635]" />
          Enable two-factor authentication (2FA)
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={busy}
          className="mt-2 rounded-full bg-accent px-6 py-3.5 text-sm font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-60">
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">Already have an account? <Link to="/login" className="font-semibold text-foreground underline-offset-4 hover:underline">Sign in</Link></p>
    </AuthShell>
  )
}
```

- [ ] **Step 4: Verify (browser, real flow)** — `npx tsc -b` exit 0. On dev server:
  - Navigate `/register`, screenshot (lime card, fields, 2FA toggle).
  - Register a fresh account (e.g. `test+<rand>@demo.local` / `demo123456`, 2FA ON). Confirm either the enroll stage shows a **QR (inline SVG) + secret** (if local has auto-confirm) OR the "check your email" stage (if confirmations on). Record which — this resolves the spec's open email-confirmation question.
  - If enroll shows: generate a TOTP code from the secret (use any TOTP lib/CLI, e.g. `oathtool --totp -b <secret>`), enter it, verify → lands on `/dashboard`.
  - Existing-email + weak-password errors surface inline.

- [ ] **Step 5: Checkpoint** — registration works end to end (note the email-confirmation behavior for the spec). (No commit.)

---

## Task 5: Login redesign + MFA challenge

**Files:**
- Create: `src/components/auth/TwoFactorChallenge.tsx`
- Modify: `src/pages/Login.tsx`

**Interfaces:**
- Consumes: `needsMfaChallenge`, `getVerifiedFactorId`, `verifyTotp` (Task 3); `AuthShell` (Task 4).
- Produces: `TwoFactorChallenge` (props `{ onVerified: () => void }`).

- [ ] **Step 1: TwoFactorChallenge**

`src/components/auth/TwoFactorChallenge.tsx`:
```tsx
import { useState } from "react"
import { getVerifiedFactorId, verifyTotp } from "@/lib/auth/mfa"

export function TwoFactorChallenge({ onVerified }: { onVerified: () => void }) {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const factorId = await getVerifiedFactorId()
    if (!factorId) { setError("No 2FA factor found"); setBusy(false); return }
    const { error } = await verifyTotp(factorId, code.trim())
    setBusy(false)
    if (error) { setError(error); return }
    onVerified()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
      <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)}
        placeholder="123456" className="rounded-full border border-border bg-foreground/[0.04] px-5 py-3 text-foreground outline-none focus:border-foreground/60" />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={busy || code.length < 6}
        className="rounded-full bg-accent px-6 py-3.5 text-sm font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-60">
        {busy ? "Verifying…" : "Verify"}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Redesign Login in lime + 3 paths + MFA step-up**

Rewrite `src/pages/Login.tsx` to use `AuthShell`, keep the existing `validateSearch` redirect + demo-role buttons, and add an MFA challenge stage. Keep `DEMO_USERS`/`DEMO_PASSWORD` constants. Core logic:
```tsx
import { useState } from "react"
import { useNavigate, useSearch, Link } from "@tanstack/react-router"
import { supabase } from "@/lib/supabase"
import { AuthShell } from "@/components/auth/AuthShell"
import { TwoFactorChallenge } from "@/components/auth/TwoFactorChallenge"
import { needsMfaChallenge } from "@/lib/auth/mfa"

const DEMO_PASSWORD = "demo123456"
const DEMO_USERS = [
  { label: "Viewer", email: "viewer@demo.local" },
  { label: "Manager", email: "manager@demo.local" },
  { label: "Admin", email: "admin@demo.local" },
]

export function Login() {
  const navigate = useNavigate()
  const { redirect } = useSearch({ from: "/login" })
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<"creds" | "mfa">("creds")

  const dest = redirect ?? "/dashboard"
  const done = () => navigate({ to: dest })

  async function afterPassword() {
    if (await needsMfaChallenge()) { setStage("mfa"); return }
    done()
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) { setError(error.message); return }
    await afterPassword()
  }

  async function demoLogin(demoEmail: string) {
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: demoEmail, password: DEMO_PASSWORD })
    setBusy(false)
    if (error) { setError(error.message); return }
    await afterPassword()   // demo users have no MFA → proceeds straight through
  }

  if (stage === "mfa") return (
    <AuthShell title="Two-factor"><TwoFactorChallenge onVerified={done} /></AuthShell>
  )

  return (
    <AuthShell title="Sign in">
      <form onSubmit={signIn} className="flex flex-col gap-3">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required
          className="rounded-full border border-border bg-foreground/[0.04] px-5 py-3 text-foreground outline-none focus:border-foreground/60" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required
          className="rounded-full border border-border bg-foreground/[0.04] px-5 py-3 text-foreground outline-none focus:border-foreground/60" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={busy} className="mt-2 rounded-full bg-accent px-6 py-3.5 text-sm font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-60">
          {busy ? "Entering…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">No account? <Link to="/register" className="font-semibold text-foreground underline-offset-4 hover:underline">Create one</Link></p>
      <div className="mt-6 border-t border-border pt-5">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Explore as a role (demo)</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO_USERS.map((u) => (
            <button key={u.email} onClick={() => demoLogin(u.email)} disabled={busy}
              className="rounded-full border border-border px-4 py-2 text-sm text-foreground transition hover:bg-foreground hover:text-background disabled:opacity-50">
              {u.label}
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  )
}
```

- [ ] **Step 3: Verify (browser)** — `npx tsc -b` exit 0. On dev server:
  - `/login` renders in lime via AuthShell; 3 paths visible (Sign in / Create one / demo roles + "explore the demo" footer).
  - Demo role buttons sign in and land on /dashboard (dark).
  - Sign in with the Task-4 account that has 2FA → after password, the **Two-factor** stage appears; entering a valid TOTP code lands on /dashboard. Wrong code → inline error.
  - Sign in with a non-2FA account → straight to /dashboard.
  - Screenshot `/login` desktop + mobile.

- [ ] **Step 4: Checkpoint** — login + MFA step-up + demo paths all work. (No commit.)

---

## Task 6: Sample-sandbox migration

**Files:**
- Create: `supabase/migrations/20260625000001_sample_sandbox.sql`

**Interfaces:**
- Consumes: existing `public.entities`, `public.entity_members`, `public.profiles`, the `on_auth_user_created`→profiles chain.
- Produces: `entities.is_sample` column; `private.grant_sample_membership()` trigger on `profiles`.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- Migration 20 — Sample sandbox for self-registered users
--
-- Every newly created profile is granted READ-ONLY membership to the sample
-- entities, so a registered visitor explores the rich demo data but can write
-- nothing (ingest/approve are manager+; journal/report are read-only via RLS).
-- This keeps remote "demo-only": registrants share one sample sandbox; no real
-- private tenant data is ever created.
-- ============================================================================

alter table public.entities
  add column if not exists is_sample boolean not null default false;

comment on column public.entities.is_sample is
  'true → part of the shared read-only sample sandbox new registrants are granted.';

-- The seeded demo entities are the sample set (idempotent).
update public.entities set is_sample = true
  where slug in ('northwind', 'acme', 'globex', 'initech');

-- SECURITY DEFINER (owner) so it bypasses entity_members'' super-admin-only write
-- RLS; search_path hardened; everything schema-qualified.
create or replace function private.grant_sample_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.entity_members (entity_id, user_id)
  select e.id, new.id
  from public.entities e
  where e.is_sample
  on conflict (entity_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_grant_sample_membership on public.profiles;
create trigger profiles_grant_sample_membership
  after insert on public.profiles
  for each row execute function private.grant_sample_membership();
```

- [ ] **Step 2: Hand off for apply** — STOP. Ask Mariia to apply the migration locally (e.g. `supabase migration up` / her usual flow). Do NOT apply via MCP. Wait for confirmation it applied cleanly.

- [ ] **Step 3: Verify (after applied)** — Register a brand-new account (no 2FA for speed). After landing on `/dashboard`, confirm the dashboard shows the sample data (entities/KPIs populate — not empty). Open the X-ray panel → the `report_account_monthly` / `entities` calls return rows for the new user. Attempt nothing destructive (there are no write controls for a viewer). Optionally in SQL (Mariia): `select count(*) from public.entity_members where user_id = '<new uid>'` → 4.

- [ ] **Step 4: Checkpoint** — new registrants see sample data read-only; tenant isolation intact.

---

## Task 7 (optional): 2FA management in Account

**Files:**
- Modify: `src/pages/Account.tsx`

**Interfaces:** Consumes `listTotpFactors`, `enrollTotp`/`TwoFactorEnroll`, `unenrollTotp` (Task 3/4).

- [ ] **Step 1:** In the (currently stub) `Account.tsx`, add a "Two-factor authentication" card (dark theme — it's a product route): list verified factors (`listTotpFactors`); if none, render `<TwoFactorEnroll onVerified={…} />` to add one; if present, a "Remove 2FA" button calling `unenrollTotp`. Reuse the dark `Card` ui component.
- [ ] **Step 2: Verify** — `npx tsc -b`; on `/account` (signed in), enroll + remove a factor; screenshot.
- [ ] **Step 3: Checkpoint.** Mark skipped if descoped.

---

## Self-Review (completed during authoring)

- **Spec coverage:** D (hybrid theming → Task 1) · B (nav Demo/O nás + About → Tasks 1–2) · A (register → Task 4; 2FA enroll → Tasks 3–4; login challenge → Tasks 3,5; demo-vs-login clarity → Tasks 1,5; sample sandbox → Task 6). Optional Account 2FA (spec §5.3 "optional") → Task 7. ✓
- **Placeholders:** none — every code step has real code; the only "placeholder" is the deploy-mandated external-link placeholder on About (intentional, per constraint).
- **Type consistency:** `mfa.ts` signatures in Task 3 match their consumers in Tasks 4–5 (`signUpWithProfile`, `enrollTotp`→`{factorId,qrSvg,secret}`, `verifyTotp(factorId,code)`, `needsMfaChallenge`, `getVerifiedFactorId`). `AuthShell`/`TwoFactorEnroll`/`TwoFactorChallenge` props match their usages. ✓
- **Open item surfaced by the plan:** Task 4 Step 4 explicitly records whether local Supabase auto-confirms emails (resolves spec §7 risk) — the Register flow already handles both branches.
