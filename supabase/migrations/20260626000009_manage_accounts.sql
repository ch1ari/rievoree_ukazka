-- ============================================================================
-- Migration 29 — Manage chart of accounts (flexible per-entity charts)
--
-- So any user can upload their OWN data with their OWN account codes: a manager
-- or admin of an entity can add/update its accounts. The upload flow classifies
-- unknown codes (with a type) and calls this before processing, so the codes
-- resolve and the rows load. SECURITY DEFINER + owner/manager check (the table's
-- accounts_write policy is admin-only; this opens it to managers of the entity).
-- ============================================================================

create or replace function public.upsert_accounts(
  p_entity_id uuid,
  p_accounts jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(p_accounts) <> 'array' then
    raise exception 'accounts must be a JSON array' using errcode = '22023';
  end if;

  if not coalesce(
       (select private.is_admin())
       or ((select private.user_role()) in ('manager', 'admin')
            and p_entity_id in (select private.my_entity_ids())),
       false)
  then
    raise exception 'not allowed to manage accounts for this entity'
      using errcode = '42501';
  end if;

  insert into public.accounts (entity_id, code, name, type)
  select
    p_entity_id,
    a ->> 'code',
    coalesce(nullif(a ->> 'name', ''), a ->> 'code'),
    (a ->> 'type')::public.account_type
  from jsonb_array_elements(p_accounts) as a
  where coalesce(a ->> 'code', '') <> ''
  on conflict (entity_id, code) do update
    set name = excluded.name, type = excluded.type;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.upsert_accounts(uuid, jsonb) from public, anon;
grant execute on function public.upsert_accounts(uuid, jsonb) to authenticated;
