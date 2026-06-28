-- ============================================================================
-- Migration 32 — User management v2: company-scoped admin + super_admin global
--
-- Tightens who an admin may SEE and MANAGE (migration 30 leant on the "platform
-- admin" notion — any admin who owned no sandbox saw EVERY user, including other
-- people's personal accounts). New model, requested explicitly:
--
--   * super_admin  → global. Sees and manages every user. (The platform owner.)
--   * admin        → their COMPANY only: users who share at least one entity with
--                    them. Can manage (invite / reset / deactivate / set role) only
--                    those users, and only up to 'manager' (never another admin or
--                    a super_admin).
--   * manager/viewer → no access to user management.
--
-- This only re-scopes the USER-MANAGEMENT surface. App-data RLS (reports, ingest)
-- still uses private.is_admin() and is unchanged.
--
-- All privileged writes keep the frozen-column guard (set_config opt-in inside
-- the RPC after its own permission check).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Helpers
-- ----------------------------------------------------------------------------

-- Do the caller and the target user share at least one entity? (The "same
-- company" test for a scoped admin.)
create or replace function private.shares_entity_with(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.entity_members me
    join public.entity_members te on te.entity_id = me.entity_id
    where me.user_id = (select auth.uid())
      and te.user_id = p_target
  )
$$;

revoke all on function private.shares_entity_with(uuid) from public, anon;
grant execute on function private.shares_entity_with(uuid) to authenticated, service_role;

-- Exposed: is the caller a super_admin (the global platform owner)?
create or replace function public.am_i_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_super_admin())
$$;

-- Exposed: does the caller OWN this entity? (Used by the invite edge function to
-- confirm a scoped admin is inviting into their own company.)
create or replace function public.do_i_own_entity(p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entities
    where id = p_entity_id and owner_id = (select auth.uid())
  )
$$;

revoke all on function public.am_i_super_admin()        from public, anon;
revoke all on function public.do_i_own_entity(uuid)     from public, anon;
grant execute on function public.am_i_super_admin()     to authenticated, service_role;
grant execute on function public.do_i_own_entity(uuid)  to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2. can_manage_user — the single authorization predicate for credential ops.
--    super_admin → anyone. admin → a company member who is only viewer/manager
--    (never a peer admin or a super_admin). Used by the admin-users edge fn.
-- ----------------------------------------------------------------------------
create or replace function public.can_manage_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.is_super_admin())
    or (
      (select private.user_role()) = 'admin'
      and p_user_id <> (select auth.uid())
      and (select private.shares_entity_with(p_user_id))
      and (select role from public.profiles where id = p_user_id) in ('viewer', 'manager')
    ),
    false)
$$;

revoke all on function public.can_manage_user(uuid)  from public, anon;
grant execute on function public.can_manage_user(uuid) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. list_org_members — super_admin → all; admin → their company.
-- ----------------------------------------------------------------------------
create or replace function public.list_org_members()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_super  boolean := (select private.is_super_admin());
  v_role   public.app_role := (select private.user_role());
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not (v_super or v_role = 'admin') then
    raise exception 'admin only' using errcode = '42501';
  end if;

  with visible_entities as (
    -- Entities whose membership the caller may see: all (super) or the caller's own.
    select e.id, e.name
    from public.entities e
    where v_super
       or e.id in (select private.my_entity_ids())
  ),
  visible_users as (
    select p.id from public.profiles p where v_super
    union
    -- Company members: anyone sharing a visible entity with the caller.
    select em.user_id
    from public.entity_members em
    join visible_entities ve on ve.id = em.entity_id
    union
    select v_uid
  ),
  per_user_entities as (
    select em.user_id,
           jsonb_agg(jsonb_build_object('id', ve.id, 'name', ve.name) order by ve.name) as entities
    from public.entity_members em
    join visible_entities ve on ve.id = em.entity_id
    group by em.user_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'email', p.email,
      'full_name', p.full_name,
      'role', p.role,
      'is_active', p.is_active,
      'is_self', (p.id = v_uid),
      'can_manage', (p.id <> v_uid and (select public.can_manage_user(p.id))),
      'mfa_verified', exists (
        select 1 from auth.mfa_factors f
        where f.user_id = p.id and f.status = 'verified'
      ),
      'entities', coalesce(pue.entities, '[]'::jsonb),
      'created_at', p.created_at
    ) order by p.created_at
  ), '[]'::jsonb)
  into v_result
  from public.profiles p
  join visible_users vu on vu.id = p.id
  left join per_user_entities pue on pue.user_id = p.id;

  return v_result;
end;
$$;


-- ----------------------------------------------------------------------------
-- 4. Role + active-state setters — super_admin global, admin company-scoped.
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_member_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_super  boolean := (select private.is_super_admin());
  v_target public.app_role;
begin
  select role into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  if v_super then
    -- Global: only guard the last super_admin (keep an escape hatch).
    if v_target = 'super_admin' and p_role <> 'super_admin'
       and (select count(*) from public.profiles where role = 'super_admin' and is_active) <= 1 then
      raise exception 'cannot demote the last super_admin' using errcode = '22023';
    end if;
  elsif (select private.user_role()) = 'admin' then
    -- Company-scoped: only manage company members, only up to manager.
    if not (select public.can_manage_user(p_user_id)) then
      raise exception 'you can only manage users in your own company' using errcode = '42501';
    end if;
    if p_role not in ('viewer', 'manager') then
      raise exception 'an admin may only assign viewer or manager' using errcode = '42501';
    end if;
  else
    raise exception 'not authorized' using errcode = '42501';
  end if;

  perform set_config('app.allow_privileged_profile_change', 'on', true);
  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

create or replace function public.admin_set_user_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_super boolean := (select private.is_super_admin());
begin
  if p_user_id = (select auth.uid()) then
    raise exception 'you cannot change your own active state' using errcode = '22023';
  end if;

  if v_super then
    if not p_active
       and (select role from public.profiles where id = p_user_id) = 'super_admin'
       and (select count(*) from public.profiles where role = 'super_admin' and is_active) <= 1 then
      raise exception 'cannot deactivate the last super_admin' using errcode = '22023';
    end if;
  elsif (select private.user_role()) = 'admin' then
    if not (select public.can_manage_user(p_user_id)) then
      raise exception 'you can only manage users in your own company' using errcode = '42501';
    end if;
  else
    raise exception 'not authorized' using errcode = '42501';
  end if;

  perform set_config('app.allow_privileged_profile_change', 'on', true);
  update public.profiles set is_active = p_active where id = p_user_id;
end;
$$;

comment on function public.list_org_members() is
  'Admin user list. super_admin → all profiles; admin → company (users sharing an entity). Carries can_manage + MFA state per row.';
comment on function public.can_manage_user(uuid) is
  'Credential-op gate. super_admin → anyone; admin → company member who is viewer/manager (never a peer admin or super_admin), never self.';
