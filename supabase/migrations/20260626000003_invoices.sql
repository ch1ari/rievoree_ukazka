-- ============================================================================
-- Migration 22 — Invoices table (schema only) for AR/AP aging. The invoice ROWS
-- are seeded in seed.sql (this migration runs before seed.sql, when
-- public.entities is still empty). Tenant-scoped RLS. as-of date = 2026-05-31.
-- ============================================================================

create table if not exists public.invoices (
  id           uuid primary key default gen_random_uuid(),
  entity_id    uuid not null references public.entities (id) on delete cascade,
  kind         text not null check (kind in ('ar', 'ap')),
  counterparty text not null,
  issued_date  date not null,
  due_date     date not null,
  amount       numeric not null check (amount > 0),
  status       text not null default 'open' check (status in ('open', 'paid'))
);

comment on table public.invoices is
  'Seeded demo AR/AP invoices for aging. as-of date for aging is 2026-05-31.';

create index invoices_entity_idx on public.invoices (entity_id, kind);

alter table public.invoices enable row level security;

create policy invoices_select on public.invoices
  for select to authenticated
  using ((select private.is_admin()) or entity_id in (select private.my_entity_ids()));

grant select on public.invoices to authenticated;
revoke all on public.invoices from anon;
-- Invoice rows are seeded in seed.sql (scaled by entity).
