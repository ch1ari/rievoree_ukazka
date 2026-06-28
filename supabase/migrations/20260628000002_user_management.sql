-- ============================================================================
-- Migration 30 — User management (admin)
--
-- The admin screen from PLAN.md §6. Two audiences, one page:
--
--   * Platform admin / super_admin (own no sandbox → private.is_admin() = TRUE):
--       global view of every user; assign global roles, activate/deactivate, and
--       (via the admin-users edge function, which holds the service role)
--       create users, reset passwords and reset MFA.
--   * Scoped admin (role 'admin' but owns a sandbox → is_admin() = FALSE):
--       manages MEMBERSHIP of the entities they OWN — invite an existing user by
--       email, remove a member, see who can reach their books and their MFA state.
--       Credential operations stay platform-only (enforced in the edge function).
--
-- Everything privileged still flows through the frozen-column guard: role and
-- is_active change only inside these SECURITY DEFINER RPCs, which set the
-- transaction-local opt-in flag AFTER their own permission check — never by a
-- direct client UPDATE.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Tiny exposed helpers (so the frontend + edge function can branch on authz)
-- ----------------------------------------------------------------------------

-- Is the caller a GLOBAL platform admin (owns no sandbox)?
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_admin())
$$;

-- May the caller administer this user? Platform admin → anyone. Scoped admin →
-- only users who are members of an entity the caller OWNS. Used by the edge
-- function to gate credential operations with the caller's own JWT.
create or replace function public.can_manage_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.is_admin())
    or exists (
      select 1
      from public.entity_members em
      join public.entities e on e.id = em.entity_id
      where em.user_id = p_user_id
        and e.owner_id = (select auth.uid())
    ),
    false)
$$;

revoke all on function public.is_platform_admin()      from public, anon;
revoke all on function public.can_manage_user(uuid)    from public, anon;
grant execute on function public.is_platform_admin()   to authenticated, service_role;
grant execute on function public.can_manage_user(uuid) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2. list_org_members — the user table the page renders.
--    Platform admin → every profile. Scoped admin → members of owned entities
--    (plus self). Each row carries the entities the CALLER may see for that user
--    and whether the user has a verified MFA factor.
-- ----------------------------------------------------------------------------
create or replace function public.list_org_members()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_platform boolean := (select private.is_admin());
  v_role     public.app_role := (select private.user_role());
  v_result   jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  -- Only admins reach this screen (scoped or platform). Others get nothing.
  if not (v_platform or v_role = 'admin') then
    raise exception 'admin only' using errcode = '42501';
  end if;

  with visible_entities as (
    -- The entities whose membership the caller may administer.
    select e.id, e.name
    from public.entities e
    where v_platform or e.owner_id = v_uid
  ),
  visible_users as (
    -- Platform admin sees all profiles; a scoped admin sees members of their
    -- owned entities, plus themselves.
    select p.id from public.profiles p where v_platform
    union
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

revoke all on function public.list_org_members() from public, anon;
grant execute on function public.list_org_members() to authenticated;


-- ----------------------------------------------------------------------------
-- 3. Membership management — invite / remove members of OWNED entities.
--    Authorization is owner-based (the sandbox owner decides who joins) OR
--    platform admin. Never touches global roles.
-- ----------------------------------------------------------------------------
create or replace function public.add_org_member(p_entity_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_target  uuid;
  v_owner   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if coalesce(trim(p_email), '') = '' then
    raise exception 'email required' using errcode = '22023';
  end if;

  select owner_id into v_owner from public.entities where id = p_entity_id;
  if not found then
    raise exception 'entity not found' using errcode = 'P0002';
  end if;
  if not ((select private.is_admin()) or v_owner = v_uid) then
    raise exception 'only the entity owner (or a platform admin) may add members'
      using errcode = '42501';
  end if;

  select id into v_target from public.profiles where lower(email) = lower(trim(p_email));
  if not found then
    raise exception 'no user with email % — they must register first', p_email
      using errcode = 'P0002';
  end if;

  insert into public.entity_members (entity_id, user_id, granted_by)
  values (p_entity_id, v_target, v_uid)
  on conflict (entity_id, user_id) do nothing;

  return jsonb_build_object('entity_id', p_entity_id, 'user_id', v_target);
end;
$$;

create or replace function public.remove_org_member(p_entity_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select owner_id into v_owner from public.entities where id = p_entity_id;
  if not found then
    raise exception 'entity not found' using errcode = 'P0002';
  end if;
  if not ((select private.is_admin()) or v_owner = v_uid) then
    raise exception 'only the entity owner (or a platform admin) may remove members'
      using errcode = '42501';
  end if;
  -- Never strip the owner's own access to their sandbox.
  if p_user_id = v_owner then
    raise exception 'the entity owner cannot be removed from their own entity'
      using errcode = '22023';
  end if;
  delete from public.entity_members where entity_id = p_entity_id and user_id = p_user_id;
end;
$$;

revoke all on function public.add_org_member(uuid, text)    from public, anon;
revoke all on function public.remove_org_member(uuid, uuid) from public, anon;
grant execute on function public.add_org_member(uuid, text)    to authenticated;
grant execute on function public.remove_org_member(uuid, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 4. Global role + active state — PLATFORM ADMIN ONLY (frozen-column writers).
--    These set the privileged-change flag after their own check, so they are the
--    only sanctioned path to a role / is_active change (the trigger blocks the
--    rest). A super_admin can never be demoted by anyone but themselves here.
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_member_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_target public.app_role;
begin
  if not (select private.is_admin()) then
    raise exception 'platform admin only' using errcode = '42501';
  end if;
  select role into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  -- Guard the platform: only a super_admin may grant/revoke super_admin, and
  -- nobody may strip the last one (keeps an escape hatch).
  if (p_role = 'super_admin' or v_target = 'super_admin')
     and not (select private.is_super_admin()) then
    raise exception 'only a super_admin may change super_admin status'
      using errcode = '42501';
  end if;
  if v_target = 'super_admin' and p_role <> 'super_admin'
     and (select count(*) from public.profiles where role = 'super_admin' and is_active) <= 1 then
    raise exception 'cannot demote the last super_admin' using errcode = '22023';
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
  v_uid uuid := (select auth.uid());
begin
  if not (select private.is_admin()) then
    raise exception 'platform admin only' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'you cannot change your own active state' using errcode = '22023';
  end if;
  if not p_active
     and (select role from public.profiles where id = p_user_id) = 'super_admin'
     and (select count(*) from public.profiles where role = 'super_admin' and is_active) <= 1 then
    raise exception 'cannot deactivate the last super_admin' using errcode = '22023';
  end if;
  perform set_config('app.allow_privileged_profile_change', 'on', true);
  update public.profiles set is_active = p_active where id = p_user_id;
end;
$$;

revoke all on function public.admin_set_member_role(uuid, public.app_role) from public, anon;
revoke all on function public.admin_set_user_active(uuid, boolean)         from public, anon;
grant execute on function public.admin_set_member_role(uuid, public.app_role) to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean)         to authenticated;


-- ----------------------------------------------------------------------------
-- 5. Service-role-only role stamp for the create-user edge function.
--
--    admin_set_member_role guards on the CALLER being a platform admin via
--    auth.uid(). The admin-users edge function runs as service_role (no
--    auth.uid()), so it can't use it — but it has ALREADY verified the human
--    caller is a platform admin (is_platform_admin under their JWT) before it
--    gets here. This variant therefore trusts service_role and only does the
--    frozen-column write. Granted to service_role ONLY — never client-callable.
-- ----------------------------------------------------------------------------
create or replace function public.service_set_user_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.allow_privileged_profile_change', 'on', true);
  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.service_set_user_role(uuid, public.app_role) from public, anon, authenticated;
grant execute on function public.service_set_user_role(uuid, public.app_role) to service_role;

comment on function public.list_org_members() is
  'Admin user list. Platform admin → all profiles; scoped admin → members of owned entities. Carries per-user entities (caller-scoped) + MFA state.';
