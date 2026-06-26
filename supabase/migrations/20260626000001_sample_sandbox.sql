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
-- NOTE: which entities ARE the sample set is data, set in seed.sql (this migration
-- runs before seed.sql, when public.entities is still empty).

-- SECURITY DEFINER (owner) so it bypasses entity_members' super-admin-only write
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
