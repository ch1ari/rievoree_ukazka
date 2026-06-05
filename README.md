# X-Ray Financial Reporting Engine

A full-stack financial reporting tool whose real product is **visible backend
machinery**: every page carries an X-ray panel (🔬) showing live API calls,
RLS policies, SQL and security layers doing the work.

Portfolio project — all data is fake, built from scratch.

> **Status:** Phase 1 — database foundation (5 migrations, multi-tenant RLS,
> least-privilege grants), frontend scaffold, X-ray instrumentation seam,
> Docker worker placeholder. ETL pipeline lands in Phase 2–3.

## Repository map

| Path | Responsibility |
|---|---|
| `src/` | React 19 + TypeScript frontend (Vite, Tailwind v4, shadcn/ui, TanStack Router/Query) |
| `src/lib/xray/` | X-ray instrumentation: every Supabase request is timed at the fetch layer |
| `supabase/migrations/` | Versioned SQL — schema, RLS policies, grant hardening |
| `worker/` | Deno ETL/metrics worker (queue consumer in Phase 3) |
| `docker-compose.yml` | Our services on top of the Supabase local stack |
| `PLAN.md` | Full project specification |

## Architecture (local dev)

```
┌─ Vite dev server ── React app ── instrumented supabase-js ─┐
│                                                            │
│   ┌──────────────── Docker ─────────────────────────────┐  │
│   │  Supabase CLI stack          our docker-compose     │  │
│   │  ┌───────────────────────┐   ┌───────────────────┐  │  │
│   │  │ Postgres :54322       │◄──┤ Deno ETL worker   │  │  │
│   │  │ Auth / REST :54321    │   │ (queue consumer)  │  │  │
│   │  │ Studio :54323         │   └───────────────────┘  │  │
│   │  └───────────────────────┘                          │  │
│   └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

`supabase start` already runs the platform (Postgres, Auth, REST, Studio) as
Docker containers, so our compose file only adds what the platform doesn't
have: the ETL worker. One command starts everything (see below).

## Getting started

Prerequisites: Node 20+, Docker, [Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
npm install
supabase start            # boots the local stack + applies all migrations
cp .env.example .env.local
# fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from `supabase status`

npm run stack             # = supabase start + docker compose up + vite dev
```

### macOS / Windows (Docker Desktop)

Works out of the box — the worker reaches the host's Postgres via
`host.docker.internal`, which Docker Desktop provides natively.

### Linux (native Docker)

Also works out of the box, via the `extra_hosts: host.docker.internal:host-gateway`
mapping in `docker-compose.yml` (requires Docker 20.10+, released 2020).
If your Supabase Postgres runs on a non-default port, override the URL:

```bash
WORKER_DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres \
  docker compose up -d
```

## Security model (Phase 1)

- **Multi-tenant RLS** on every table, keyed by `entities`; global roles
  (super_admin / admin / manager / viewer) + per-entity membership.
- **Defense in depth:** column-level grants under RLS under triggers —
  privileged profile columns are frozen at three layers.
- **Least privilege:** API roles hold only what they can legitimately use
  (no TRUNCATE/REFERENCES/TRIGGER anywhere; `ingest_queue` is deny-all by
  design — the linter INFO on it is intentional).
- **InitPlan-optimized policies:** helpers wrapped in `(select …)` so
  Postgres evaluates them once per query, not per row.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server only |
| `npm run stack` | Supabase stack + worker container + Vite |
| `npm run build` | typecheck + production build |
| `npm run typecheck` | `tsc -b` |
