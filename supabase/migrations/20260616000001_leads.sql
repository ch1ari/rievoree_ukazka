-- ============================================================================
-- Migration 19 — leads (soft email capture from the landing page)
--
-- Truly optional, non-blocking email capture. The integrity stance mirrors the
-- rest of the project: writes are allowed, reads are not.
--   * INSERT: anyone (anon or signed-in) may drop an email — no gate, no wall.
--   * SELECT/UPDATE/DELETE: nobody via the API. With no SELECT policy the table
--     is unreadable through PostgREST, so captured emails are never exposed to
--     other visitors. The owner reads them via service_role / the dashboard.
-- ============================================================================
create table public.leads (
  id         bigint generated always as identity primary key,
  email      text not null
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
           and length(email) <= 254),
  source     text,
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;

-- Anyone may submit; the WHERE-less check keeps it open (it's just an email).
create policy leads_insert on public.leads
  for insert to anon, authenticated
  with check (true);

-- Systemic hardening (migration 12) already stripped anon; be explicit here:
-- INSERT only for both API roles, nothing else (no SELECT → not readable).
revoke all on public.leads from anon, authenticated;
grant insert on public.leads to anon, authenticated;

comment on table public.leads is
  'Soft landing-page email capture. INSERT-only for anon/authenticated; no SELECT policy so emails are never API-readable. Owner reads via service_role.';
