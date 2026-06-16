# Demo walkthrough — X-Ray Financial Reporting Engine

A 5-minute self-guided tour: sign in, read RLS-filtered reports, run the full
ETL pipeline from the browser, and watch the backend machinery live in the
X-ray panel.

---

## 1. Run it locally

You need three things alive: the Supabase stack, the ETL worker, and the Vite
dev server.

```bash
# from the repo root

# 1) Supabase (Postgres, Auth, Storage, Edge Functions, Realtime)
supabase start

# 2) ETL worker (consumes the ingest queue: validate → transform → z-score)
docker compose up -d --build

# 3) Frontend
npm run dev
```

Or all three at once: `npm run stack`.

Then open **http://localhost:5173**.

> **Tip — clean slate:** for a pristine demo run `supabase db reset` first. It
> re-applies migrations + seed (4 tenants, 18 months of history, demo users).
> The `.env.local` pointing the frontend at the local stack is already in place.

**Sanity checks (optional):**
```bash
docker ps | grep worker                     # worker container is Up
docker logs --tail 3 rievoree_ukazka-worker-1   # heartbeat every ~30s
```

---

## 2. Demo scenario, step by step

### A. Sign in
0. If a previous session is still active (top-right shows a role), click **SIGN OUT** first for a clean start.
1. Go to **http://localhost:5173/dashboard** → you're bounced to **/login** (route guard; anon can't see protected pages).
2. Under **Demo login**, click **Manager**. (Manager sees 2 entities: Northwind + Acme.)
3. You land on the Dashboard. Top-right shows **MANAGER · SIGN OUT**.

*Try the refresh test:* press **F5** — you stay signed in (session persists).

### B. Read the RLS-filtered report
4. **Dashboard** — KPI cards. Note **ENTITIES (RLS SCOPE) = 2** (manager sees only their two).
5. Open the **🔬 X-RAY** panel (top-right) → **RLS** tab → click **Run as Viewer**, then **Manager**, then **Admin**. Same query `select id, name from entities`, different row counts: **1 / 2 / 4**. That's RLS, live. Click **Reset → anon** when done (it really signs you out).
   - Sign back in as **Manager** to continue.
6. **Reports** — per-account monthly table from `report_account_monthly`, filtered to your entities. Use the **Period** filter; note the row count (top-right).

### C. Run the full pipeline (upload → approve → report)
7. Go to **Ingest**.
8. Upload the **clean** file:
   - **Entity:** Northwind Trading
   - **Period:** 2026-06
   - **File:** `demo/clean-northwind-june.csv`
   - Click **Upload**.
9. Watch the **Batches · live** table. The new batch moves through statuses (the worker is processing): `queued → … → awaiting_review`. Stats show **4 rows · 0 flagged** (amounts match history → no anomaly).
10. Click **Approve** on that row → status becomes **loaded** (`4 loaded`).
11. Go to **Reports** → the **2026-06 Northwind** rows are now at the top (Cash, Product Sales, Salaries, Rent). The report grew by 4 rows.
    - The report refreshes via **pg_cron** (~1 min). If June isn't there yet, wait a few seconds and the page re-fetches.

### D. See the anomaly path (z-score blocks a bad batch)
12. Back on **Ingest**, upload the **anomaly** file:
    - **Entity:** Northwind Trading · **Period:** 2026-07 · **File:** `demo/anomaly-northwind-july.csv`
13. The batch reaches `awaiting_review` with **4 flagged** (amounts are ~10× the historical mean → z-score > 3).
14. Click **Approve** → it loads, but **0 rows load** — flagged anomalies are held back. July does **not** appear in Reports. That's the "anomaly blocks the import" guarantee, working as designed.

### E. Confirm the tenant barrier
15. **Sign out** → Demo login as **Viewer**.
16. Go to **Ingest** → **NO BATCHES VISIBLE** ("your role doesn't manage ingest batches"). The upload form is hidden. Viewers can't see or approve batches — enforced by RLS *and* the `approve_batch` SECURITY DEFINER gate, not just the UI.

---

## 3. What proves the flow actually ran

- **Reports table** — new `2026-06 Northwind` rows appear after approval (real rows from the report view, RLS-filtered to your role). The row count goes up by 4.
- **Dashboard KPIs** — Account-months / Net change after the load.
- **X-ray → PIPELINE tab** — a live timeline over Realtime: after approval you'll
  see `approved` → `refresh_enqueued` → `mv_refreshed` events for Northwind. This
  is the async machinery (trigger chain + pg_cron) made visible.
- **X-ray → CALLS tab** — every Supabase request you triggered, timed at the
  fetch seam (sign-in `auth`, the `ingest-submit` edge function, `approve_batch`
  RPC, the report `rest` reads).
- **X-ray → SQL / ARCH tabs** — the real policies behind the calls, and which
  layers were exercised this session (derived from real CALLS + PIPELINE signals).

The whole thing runs through one Supabase client, so the X-ray panel sees — and
proves — every step.
