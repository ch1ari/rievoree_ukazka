-- ============================================================================
-- Migration 21 — Budgets table (schema only) for Budget-vs-Actual / variance.
-- The budget ROWS are seeded in seed.sql (this migration runs before seed.sql,
-- when public.entities / journal_entries are still empty). Tenant-scoped RLS.
-- ============================================================================

create table if not exists public.budgets (
  entity_id    uuid not null references public.entities (id) on delete cascade,
  period       date not null,
  account_code text not null,
  amount       numeric not null default 0,
  primary key (entity_id, period, account_code)
);

comment on table public.budgets is
  'Seeded demo budget by (entity, month, account_code) for Budget-vs-Actual reporting.';

alter table public.budgets enable row level security;

-- Members see their entities; admin+ see all. No client writes (demo data only).
create policy budgets_select on public.budgets
  for select to authenticated
  using ((select private.is_admin()) or entity_id in (select private.my_entity_ids()));

grant select on public.budgets to authenticated;
revoke all on public.budgets from anon;
-- Budget rows are seeded in seed.sql.
