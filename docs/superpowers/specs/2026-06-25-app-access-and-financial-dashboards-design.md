# Design spec — App access (register + 2FA), simplified nav + About, and interactive financial dashboards

Date: 2026-06-25
Status: Approved (design), pending spec review
Scope owner: Mariia (capila.io)

## 1. Context & current state (audited 2026-06-25)

The project is a mature multi-tenant financial reporting engine. Much of what this
work seems to require already exists — this spec only adds what is genuinely missing.

Already in place (do NOT rebuild):
- **DB + RLS + seed**: migrations 1–19. Tables `entities`, `profiles`, `entity_members`,
  `accounts`, `ingest_batches`, `ingest_queue`, `journal_staging`, `journal_entries`,
  `validation_rulesets`, `pipeline_events`, `report_refresh_queue`, `leads`. Views
  `private.mv_account_monthly` + tenant-filtered `public.report_account_monthly`. RLS
  everywhere via `private.is_admin()` / `private.my_entity_ids()`. Seed (LOCAL ONLY):
  4 entities, 52 accounts, ~3,744 journal entries over 18 months (2024-11 → 2026-04),
  1 live batch with a real Utilities z-score anomaly, 5 demo users (super/admin/manager/
  viewer/`demo@demo.local`, password `demo123456`). Edge fns (`ingest-submit`,
  `notify-review`), Deno worker (FOR UPDATE SKIP LOCKED), pg_cron, pg_net.
- **Pages already pull real DB data** via TanStack Query hooks (`useReport`,
  `useEntities`, `useBatches`): Dashboard (6 KPI cards, no charts), Reports (filters +
  table), Ingest (upload + batches + approve). Connectors/Users/Account are stubs.
- **All Supabase traffic is instrumented** → the X-ray panel already shows the real
  backend on every page.
- **Design system**: dark theme (`:root`/`.dark`) app-wide; lime "green paper" `.paper`
  scope on the landing only. All shadcn/ui read CSS tokens, so re-theming via tokens
  cascades. Fonts: Saira / Saira Condensed / Big Shoulders (Display + Stencil) /
  JetBrains Mono.

Missing (this spec builds it):
- No registration, no MFA/2FA.
- No "About" page; nav has 6 product items (no public Demo/About split).
- No charts anywhere (recharts is a dependency but unused); KPIs are static (no animation).

## 2. Decisions (approved)

1. **Hybrid design**: lime "paper" for marketing + auth (`/`, `/about`, `/login`,
   `/register`); dark for the product app (`/dashboard`, `/reports`, `/ingest`, …).
2. **Real registration + sample sandbox**: `signUp` creates a real account that lands
   in a shared, read-only **sample-data sandbox** (the demo entities). Works locally;
   on remote it stays "demo-only" because every registered user sees only the shared
   sample data and can write nothing.
3. **Full TOTP 2FA** via Supabase MFA: optional at registration (enroll), enforced as a
   login challenge for users who have a factor.
4. **Public header = Demo + About** (+ Sign in) for logged-out visitors; the signed-in
   product keeps its functional nav.

## 3. Constraints (must honor)

- **Migrations**: written as SQL files in `supabase/migrations/`; **Mariia applies them**
  (read-only MCP). Next migration timestamp: `20260625000001` (latest is 20260616000001).
- **Honesty invariant**: every code/number shown in the UI/X-ray is real (via `?raw` or
  real queries). No invented figures. Charts use real `report_account_monthly` data.
- **Deploy**: demo-only on remote; placeholder external links stay placeholders; do NOT
  push to GitHub.
- **Perf/a11y**: 60 FPS (animate transform/opacity only); `prefers-reduced-motion` →
  no motion (charts render statically, count-up shows final values).
- Slovak chat / English code + comments.

## 4. Build order (two phases, each its own implementation plan + approval gate)

- **Phase 1 — Access & marketing** (this cycle): D (hybrid theming) + B (nav + About) +
  A (auth redesign + register + 2FA). The "front door."
- **Phase 2 — Financial dashboards**: C (charts/KPIs/animation/interactivity on
  Dashboard + Reports) + E (optional `report_entity_monthly` view).

This spec covers both; the first implementation plan targets Phase 1.

---

## 5. Phase 1 — Access & marketing

### 5.1 Hybrid theming (D)
- `src/app/AppShell.tsx`: define `PAPER_ROUTES = new Set(["/", "/about", "/login", "/register"])`.
  `const onPaper = PAPER_ROUTES.has(path)`. Apply the `paper` class + lime/transparent
  header & footer when `onPaper`; dark chrome otherwise (current behavior).
- Auth pages currently render "bare" (AppShell returns `<Outlet/>` for `/login`). Change:
  auth routes render inside a **lime marketing chrome** (a slim header with the brand +
  "Demo · About · Sign in", the `PaperBackground`, and `.paper` scope). Either reuse
  AppShell's header (preferred — fewer surfaces) or a small `<AuthLayout>` wrapper.
- Product routes unchanged (dark). No token changes needed — `.paper` already overrides
  the palette and cascades to shadcn/ui.
- **Interface**: a route is "paper" iff it's in `PAPER_ROUTES`. One place to change.

### 5.2 Navigation + About (B)
- Public header (logged out): `Demo` (triggers explore-demo), `O nás` → `/about`,
  `Prihlásiť` → `/login`. Signed-in: keep the functional product nav (Dashboard/Ingest/
  Reports/Connectors/Users/Account) exactly as today.
- New route `/about` (component `src/pages/About.tsx`), lime/paper design, honest content:
  what the engine is, the architecture/stack, who built it (Capila / Mariia), links
  (GitHub/CV remain placeholders per deploy checklist). May reuse landing's `.poster`,
  torn-rip motif sparingly. No fabricated metrics — reuse the real vetted figures
  (€3.06M etc. already shown on the landing as real).
- `src/app/router.tsx`: add `/about` and `/register` routes (both public).

### 5.3 Auth redesign + register + 2FA (A)
Components:
- `src/pages/Login.tsx` (redesigned, lime): email+password sign-in; keep the demo-role
  buttons (viewer/manager/admin) as a clearly-labelled "Explore as a role" block; a
  prominent **3-path** layout: *Explore demo (no account)* · *Sign in* · *Create account*.
- `src/pages/Register.tsx` (new, lime): full name, email, password, confirm, and a
  toggle **"Enable two-factor authentication (2FA)"**.
- `src/lib/auth/` helpers (new): thin wrappers around `supabase.auth.signUp`,
  `supabase.auth.mfa.enroll/challenge/verify/unenroll`, `getAuthenticatorAssuranceLevel`.

Registration flow:
1. `supabase.auth.signUp({ email, password, options: { data: { full_name } } })`.
   The existing `on_auth_user_created` trigger creates a `profiles` row (role `viewer`).
2. If 2FA toggled on: after the session exists, `mfa.enroll({ factorType: 'totp' })` →
   render the returned QR (`data.totp.qr_code`, an SVG data URI — no external image) +
   the secret; user enters the 6-digit code; `mfa.challenge` + `mfa.verify`. On success
   the factor is verified.
3. Redirect to `/dashboard` (sample sandbox).

Login challenge flow:
- After `signInWithPassword`, call `mfa.getAuthenticatorAssuranceLevel()`. If
  `nextLevel === 'aal2'` and `currentLevel === 'aal1'` (user has a verified TOTP factor),
  show a code prompt → `mfa.challenge` + `mfa.verify` to step up to aal2. Otherwise proceed.
- `AuthProvider` should expose enough to gate on aal where needed (initially just the
  login page handles the challenge inline).

Account management (light): a section in `/account` (currently a stub) to enroll/unenroll
2FA later — out of Phase-1 critical path but the helpers make it trivial. Mark as optional.

### 5.4 Sample sandbox (A — backend, migration `20260625000001`)
New users must SEE the rich sample data but WRITE nothing.
- A migration that, for every newly created profile, grants **read-only `entity_members`
  rows into the designated sample entities** (the 4 demo entities), as `viewer`.
  Implementation: add an `AFTER INSERT ON public.profiles` trigger (SECURITY
  DEFINER) `private.grant_sample_membership()` that inserts `entity_members(entity_id,
  user_id)` for each entity flagged sample. To avoid hardcoding ids, add a boolean
  `entities.is_sample` column (default true for seeded demo entities; default false
  for any future real tenant) and the trigger inserts membership for `is_sample = true`.
- Result: registered user = viewer with membership to sample entities → existing RLS
  already makes journal/reports read-only and tenant-scoped. No write paths open (ingest
  is manager+; approve is manager+). On remote this is the shared sample sandbox.
- Idempotent (`on conflict do nothing`). New real tenants (is_sample=false) are unaffected.

**Edge cases / errors**: signUp with existing email → show "account exists, sign in"; weak
password → Supabase error surfaced; email confirmation (if enabled) → show "check your
email" state (confirm whether local has confirmations off — seed users are pre-confirmed);
MFA verify wrong code → inline error, allow retry; user closes during enroll → factor stays
"unverified" (can re-enroll; we `unenroll` stale unverified factors on next attempt).

### 5.5 Phase-1 testing/verification
- Browser (Chrome DevTools MCP): register (with and without 2FA), enroll TOTP (QR shows,
  verify with a generated code), sign in (with 2FA challenge), explore-demo path, About
  page, nav states (logged out vs in), hybrid theming per route, mobile, reduced-motion.
- Confirm RLS: a freshly registered user sees sample data read-only and cannot write
  (X-ray shows the calls). Typecheck `tsc -b`. No external images. No push.

---

## 6. Phase 2 — Financial dashboards (C + E)

### 6.1 Data (E) — migration `20260625000002` (optional but recommended)
- `public.report_entity_monthly`: a thin, tenant-filtered view over
  `private.mv_account_monthly` aggregating to (entity_id, period) →
  `total_debit, total_credit, net, txn_count`. Same owner-run + WHERE-clause tenant
  barrier as `report_account_monthly` (mirrors `my_entity_ids()`/`is_admin()`); grant
  SELECT to authenticated; revoke anon. Gives each trend chart a real backend object for
  the X-ray story. If we skip this, the dashboard aggregates `report_account_monthly`
  client-side (no migration) — acceptable fallback.

### 6.2 Charts/KPIs/animation/interactivity (C, dark product)
- New `src/components/charts/` built on **recharts** (already a dep): `AreaTrend`,
  `GroupedBars`, `Donut` — thin wrappers themed to the dark tokens (emerald/teal/red),
  with entrance animation (recharts `isAnimationActive`, gated off under reduced-motion)
  and tooltips.
- New hooks: `useEntityMonthly()` (reads the view or aggregates `report_account_monthly`),
  reuse `useReport()`/`useEntities()`.
- **Dashboard**: animated KPI cards (reuse `CountUp`), NET monthly trend (area, 18 mo),
  revenue vs expense over time, net-by-account-type (donut/bar), admin entity comparison
  (bar), and an **anomaly callout** for the seeded Utilities spike (from the live batch /
  `journal_staging`). Interactivity: entity + period-range filter (shared state), hover
  tooltips, click a series/segment to drill into Reports.
- **Reports**: keep the table; add trend + breakdown charts above it; clicking a chart
  element filters the table (shared filter state).
- Perf: 60 FPS — chart entrance uses transform/opacity; no per-frame JS beyond recharts'
  own; large datasets memoized. reduced-motion → charts render final state instantly.

### 6.3 Phase-2 testing
- Browser: charts render from real data, filters/drill work, anomaly visible, X-ray shows
  the (new view's) query; mobile reflow; reduced-motion static; 60fps trace; typecheck.

---

## 7. Risks / open items
- **Email confirmation on signUp**: if Supabase email confirmations are ON, new users
  can't sign in until confirmed. Need to confirm local/remote setting; if ON, design a
  "confirm your email" state (or use auto-confirm locally). To verify during Phase 1.
- **MFA AAL gating**: minimal in Phase 1 (login page handles the challenge inline). A
  fuller app-wide aal guard is out of scope unless requested.
- **Sample sandbox on remote**: depends on the demo entities existing on remote. If the
  remote has only `demo@demo.local`'s entities, `is_sample` must be set there too (part
  of the migration / a one-off update Mariia applies).
- **Two specs, one doc**: Phase 2 is sketched; it gets its own implementation plan after
  Phase 1 lands.

## 8. Out of scope
- Real external integrations (Connectors page stays a stub or a "coming soon" in-paper).
- Full user-management UI (Users page).
- Production email/Slack for notify-review (already a stub by design).
- Pushing to GitHub.
