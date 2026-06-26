-- ============================================================================
-- Migration 24 — Self-serve provisioning: personal sandboxes + role switching
--
-- Reworks onboarding so a self-registered user gets their OWN sandbox instead of
-- read-only access to the shared showcase:
--
--   * entities.owner_id — marks a "personal" entity (showcase entities keep NULL).
--   * provision_account(mode, role) — called right after sign-up:
--       - sets the caller's global role (viewer / manager / admin),
--       - creates (once) a personal entity owned by the caller + membership,
--       - clones the standard chart of accounts from Northwind,
--       - mode 'demo'  → also clones Northwind's 18-month history into it,
--       - mode 'own'   → leaves it empty (nothing shows until they upload),
--       - drops any membership to entities the caller does NOT own, so the
--         showcase demo data can never be seen — or corrupted — by registrants.
--   * set_my_role(role) — lets a user flip their own role live (to watch how
--     approval behaves), but ONLY inside their own sandbox: refused if they can
--     reach any entity they don't own (this keeps the showcase explorer read-only).
--
-- The old auto-grant trigger (migration 20) that gave every new profile read-only
-- membership to the sample entities is removed — provisioning is now explicit and
-- per-user, so no registrant shares the showcase tenant.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Mark personal entities with their owner.
-- ----------------------------------------------------------------------------
alter table public.entities
  add column if not exists owner_id uuid references public.profiles (id) on delete cascade;

comment on column public.entities.owner_id is
  'Owner of a personal sandbox entity (self-registered users). NULL = shared showcase tenant.';

create index if not exists entities_owner_idx on public.entities (owner_id);


-- ----------------------------------------------------------------------------
-- 2. Stop auto-granting showcase membership to new registrants.
--    Provisioning is explicit now (provision_account), per user.
-- ----------------------------------------------------------------------------
drop trigger if exists profiles_grant_sample_membership on public.profiles;
drop function if exists private.grant_sample_membership();


-- ----------------------------------------------------------------------------
-- 3. provision_account — the post-signup setup RPC.
--
--    SECURITY DEFINER (owner) so it can write the tenant tables (which deny the
--    API roles) and refresh the report MV. search_path hardened.
-- ----------------------------------------------------------------------------
create or replace function public.provision_account(
  p_mode text,
  p_role public.app_role
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_name    text;
  v_source  uuid;   -- Northwind (the clone template)
  v_entity  uuid;   -- the caller's personal entity
  v_batch   uuid;
  v_created boolean := false;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_mode not in ('demo', 'own') then
    raise exception 'mode must be demo or own' using errcode = '22023';
  end if;
  if p_role not in ('viewer', 'manager', 'admin') then
    raise exception 'role must be viewer, manager or admin' using errcode = '22023';
  end if;

  select coalesce(nullif(full_name, ''), split_part(email, '@', 1))
    into v_name
  from public.profiles where id = v_uid;

  -- Set the caller's global role (frozen column → privileged-change opt-in).
  perform set_config('app.allow_privileged_profile_change', 'on', true);
  update public.profiles set role = p_role where id = v_uid;

  -- Clean slate: a registrant only ever sees entities they own (never the
  -- shared showcase). This also makes re-provisioning idempotent.
  delete from public.entity_members em
  using public.entities e
  where em.user_id = v_uid
    and em.entity_id = e.id
    and e.owner_id is distinct from v_uid;

  -- Find or create the caller's personal entity.
  select id into v_entity from public.entities
  where owner_id = v_uid order by created_at limit 1;

  if v_entity is null then
    insert into public.entities (name, slug, base_currency, is_sample, owner_id)
    values (
      coalesce(v_name, 'My') || ' — Sandbox',
      'sandbox-' || replace(v_uid::text, '-', ''),
      'EUR', false, v_uid
    )
    returning id into v_entity;
    v_created := true;
  end if;

  insert into public.entity_members (entity_id, user_id, granted_by)
  values (v_entity, v_uid, v_uid)
  on conflict (entity_id, user_id) do nothing;

  -- The clone template — the showcase Northwind tenant.
  select id into v_source from public.entities where slug = 'northwind';

  -- Clone the chart of accounts (so uploads can resolve codes). Idempotent.
  if v_source is not null then
    insert into public.accounts (entity_id, code, name, type)
    select v_entity, a.code, a.name, a.type
    from public.accounts a
    where a.entity_id = v_source
    on conflict (entity_id, code) do nothing;
  end if;

  -- Demo mode → clone the 18-month history too (only if not already present, so
  -- a second call never duplicates rows).
  if p_mode = 'demo'
     and v_source is not null
     and not exists (select 1 from public.journal_entries where entity_id = v_entity)
  then
    insert into public.ingest_batches
      (entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
    values (
      v_entity, v_uid, 'manual', 'seed-history.csv',
      'ingest/' || v_entity::text || '/seed-history.csv',
      'clone-' || v_entity::text, '2026-04-01', 'loaded'
    )
    returning id into v_batch;

    insert into public.journal_entries
      (entity_id, account_id, batch_id, txn_date, description, debit, credit, currency)
    select v_entity, ta.id, v_batch, je.txn_date, je.description, je.debit, je.credit, je.currency
    from public.journal_entries je
    join public.accounts sa on sa.id = je.account_id
    join public.accounts ta on ta.entity_id = v_entity and ta.code = sa.code
    where je.entity_id = v_source;

    -- Surface the cloned figures on the report pages immediately.
    refresh materialized view private.mv_account_monthly;
  end if;

  return jsonb_build_object(
    'entity_id', v_entity,
    'mode', p_mode,
    'role', p_role,
    'created', v_created
  );
end;
$$;

revoke all on function public.provision_account(text, public.app_role) from public, anon;
grant execute on function public.provision_account(text, public.app_role) to authenticated;


-- ----------------------------------------------------------------------------
-- 4. set_my_role — flip your own role live, only inside your own sandbox.
--
--    Guard: refused if the caller can reach ANY entity they don't own. That keeps
--    the showcase explorer (member of the shared sample tenant) read-only, while
--    letting a registrant move viewer→manager→admin to watch approval behaviour
--    change on their own data.
-- ----------------------------------------------------------------------------
create or replace function public.set_my_role(p_role public.app_role)
returns public.app_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_role not in ('viewer', 'manager', 'admin') then
    raise exception 'role must be viewer, manager or admin' using errcode = '22023';
  end if;

  -- Only inside your own sandbox: reject if any reachable entity isn't yours.
  if exists (
    select 1
    from public.entity_members em
    join public.entities e on e.id = em.entity_id
    where em.user_id = v_uid
      and e.owner_id is distinct from v_uid
  ) then
    raise exception 'role switching is only available in your own sandbox'
      using errcode = '42501';
  end if;

  perform set_config('app.allow_privileged_profile_change', 'on', true);
  update public.profiles set role = p_role where id = v_uid;
  return p_role;
end;
$$;

revoke all on function public.set_my_role(public.app_role) from public, anon;
grant execute on function public.set_my_role(public.app_role) to authenticated;
