-- ============================================================================
-- Migration 25 — set_entity_ruleset RPC (self-serve approval rules + mapping)
--
-- validation_rulesets is append-only and denies API-role writes (migration 6).
-- This SECURITY DEFINER RPC lets a manager of an entity (or an admin) publish a
-- new active ruleset version for that entity — the data the worker reads to
-- decide column mapping (header_aliases), allowed currencies, and the z-score
-- threshold that gates approval. Versioning is preserved: the previous active
-- row is deactivated (not deleted), a new higher version is inserted active.
--
-- Used by BOTH the "approval rules" editor and the upload column-mapping step;
-- both just publish a new `rules` blob for the caller's entity.
-- ============================================================================

create or replace function public.set_entity_ruleset(
  p_entity_id uuid,
  p_rules jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_version integer;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(p_rules) <> 'object' then
    raise exception 'rules must be a JSON object' using errcode = '22023';
  end if;

  -- Permission mirrors ingest_batches_insert: admin+, or a manager assigned to
  -- the entity. Fail-closed for deactivated/unknown users.
  if not coalesce(
       (select private.is_admin())
       or ((select private.user_role()) = 'manager'
            and p_entity_id in (select private.my_entity_ids())),
       false)
  then
    raise exception 'not allowed to set rules for this entity'
      using errcode = '42501';
  end if;

  -- Next version for this entity (versions are monotonic per scope).
  select coalesce(max(version), 0) + 1 into v_version
  from public.validation_rulesets
  where entity_id = p_entity_id;

  -- Retire the current active ruleset (one-active-per-entity index), then
  -- publish the new one. Same transaction → the unique index never trips.
  update public.validation_rulesets
    set is_active = false
  where entity_id = p_entity_id and is_active;

  insert into public.validation_rulesets (entity_id, version, rules, is_active, created_by)
  values (p_entity_id, v_version, p_rules, true, v_uid)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'entity_id', p_entity_id, 'version', v_version);
end;
$$;

revoke all on function public.set_entity_ruleset(uuid, jsonb) from public, anon;
grant execute on function public.set_entity_ruleset(uuid, jsonb) to authenticated;
