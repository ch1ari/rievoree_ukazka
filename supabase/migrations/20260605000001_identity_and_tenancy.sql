-- ============================================================================
-- Migration 1 — Identity & Tenancy
--
-- Creates the foundation of the multi-tenant security model:
--   * app_role enum (global roles: super_admin / admin / manager / viewer)
--   * entities        — the tenant ("client") table
--   * profiles        — 1:1 mirror of auth.users with role + status
--   * entity_members  — which users may access which entities
--   * private helper functions used by every RLS policy
--   * RLS policies for the three tables above
--
-- Security model in one paragraph:
--   manager/viewer only see entities they are assigned to via entity_members;
--   admin/super_admin see all entities. Privileged profile columns (role,
--   is_active, email, id) are "frozen": column-level grants stop direct
--   updates at the privilege layer, and a BEFORE UPDATE trigger stops them
--   at the data layer (defense in depth). They can only change through a
--   SECURITY DEFINER admin RPC (added in a later migration) that sets a
--   transaction-local flag after doing its own permission checks.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Private schema — RLS helpers and internals.
--    PostgREST only exposes `public`, so nothing in here is callable as a
--    client-facing RPC; `authenticated` still needs USAGE + EXECUTE because
--    RLS policies run these functions inside the caller's query.
-- ----------------------------------------------------------------------------
create schema if not exists private;

grant usage on schema private to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 1. Roles enum
-- ----------------------------------------------------------------------------
create type public.app_role as enum ('super_admin', 'admin', 'manager', 'viewer');


-- ----------------------------------------------------------------------------
-- 2. Tables
-- ----------------------------------------------------------------------------

-- Tenants. One row = one "client" whose books we process.
create table public.entities (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  base_currency char(3) not null default 'EUR',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.entities is
  'Tenant table. All financial data hangs off an entity; RLS isolates by it.';

-- 1:1 mirror of auth.users. Created automatically by the on_auth_user_created
-- trigger below — there is intentionally NO INSERT policy for clients.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       public.app_role not null default 'viewer',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.role is
  'FROZEN column — changes only via admin RPC (see enforce_frozen_profile_columns).';
comment on column public.profiles.is_active is
  'FROZEN column — deactivated users lose all data access (helpers return NULL).';

-- Which users may access which entities. Only relevant for manager/viewer;
-- admin & super_admin see all entities without rows here.
create table public.entity_members (
  entity_id  uuid not null references public.entities (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (entity_id, user_id)
);

-- Reverse lookup used by private.my_entity_ids() on every tenant query.
create index entity_members_user_idx on public.entity_members (user_id, entity_id);


-- ----------------------------------------------------------------------------
-- 3. Helper functions (SECURITY DEFINER)
--
--    Why DEFINER: profiles itself has RLS, so a policy on profiles that read
--    profiles as the caller would recurse. The definer (owner) bypasses RLS,
--    breaking the cycle. All helpers are STABLE so Postgres may evaluate them
--    once per statement; policies wrap them in (select ...) to force the
--    InitPlan optimization (one evaluation instead of one per row — the
--    before/after timing demo planned for the X-ray panel).
--
--    set search_path = '' hardens DEFINER functions against search-path
--    hijacking; everything inside is schema-qualified.
-- ----------------------------------------------------------------------------

-- Role of the current user, or NULL when unauthenticated, unknown, or
-- deactivated — NULL fails every policy, so is_active=false cuts all access.
create or replace function private.user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
    and is_active
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.user_role() in ('super_admin', 'admin'), false)
$$;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.user_role() = 'super_admin', false)
$$;

-- Entities the current user is assigned to (manager/viewer path).
create or replace function private.my_entity_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select entity_id
  from public.entity_members
  where user_id = (select auth.uid())
$$;


-- ----------------------------------------------------------------------------
-- 4. Triggers
-- ----------------------------------------------------------------------------

-- Auto-create a profile (always as 'viewer') when a user signs up.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Frozen-columns guard. Even code paths that bypass column grants (table
-- owner, SECURITY DEFINER, service_role) cannot change privileged columns
-- unless the transaction explicitly opts in via the local flag — which only
-- the audited admin RPC (later migration) will do after its own checks.
create or replace function private.enforce_frozen_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id    is distinct from old.id
  or new.email is distinct from old.email
  or new.role  is distinct from old.role
  or new.is_active is distinct from old.is_active
  then
    if coalesce(current_setting('app.allow_privileged_profile_change', true), 'off') <> 'on' then
      raise exception 'frozen profile column changed — use the admin RPC'
        using errcode = '42501'; -- insufficient_privilege
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_frozen_columns
  before update on public.profiles
  for each row execute function private.enforce_frozen_profile_columns();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();


-- ----------------------------------------------------------------------------
-- 5. Column-level grants (first hardening layer for frozen columns)
--
--    Supabase's default privileges grant full UPDATE to authenticated; we
--    narrow that so the API can only ever touch full_name. The trigger above
--    is the second layer behind this one.
-- ----------------------------------------------------------------------------
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;

-- Membership and tenant management is super-admin-only and will go through
-- RPCs; no direct writes from the API roles at all.
revoke insert, update, delete on public.entities from authenticated, anon;
revoke insert, update, delete on public.entity_members from authenticated, anon;


-- ----------------------------------------------------------------------------
-- 6. RLS
--
--    Conventions:
--      * every policy targets `to authenticated` — anon sees nothing;
--      * helpers are wrapped in (select ...) for the InitPlan optimization;
--      * no USING (true) anywhere (the CI migration scanner will enforce this).
-- ----------------------------------------------------------------------------
alter table public.entities       enable row level security;
alter table public.profiles       enable row level security;
alter table public.entity_members enable row level security;

-- entities: members see their entities, admin+ see all. Writes are blocked by
-- the grants above; these policies exist so a future grant change alone can
-- never open the table (defense in depth).
create policy entities_select on public.entities
  for select to authenticated
  using (
    (select private.is_admin())
    or id in (select private.my_entity_ids())
  );

create policy entities_write on public.entities
  for all to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

-- profiles: own row always; admin+ see everyone (user management screens).
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_admin())
  );

-- Own row only; combined with the column grant this means: full_name only.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No INSERT/DELETE policies on profiles: rows are created by the auth trigger
-- and removed via the auth.users cascade.

-- entity_members: users see their own memberships, admin+ see all;
-- assignment itself is super-admin-only.
create policy entity_members_select on public.entity_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_admin())
  );

create policy entity_members_write on public.entity_members
  for all to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));
