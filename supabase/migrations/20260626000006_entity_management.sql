-- ============================================================================
-- Migration 26 — Self-serve entity management
--
-- Lets a user manage the entities they OWN (personal sandboxes) without ever
-- touching the showcase tenants. entities/journal writes deny the API roles, so
-- these are SECURITY DEFINER RPCs that check owner_id = auth.uid().
--
--   create_my_entity(name, mode) — a new owned entity; clones Northwind's chart
--     of accounts, and (mode 'demo') its 18-month history.
--   rename_my_entity(id, name)   — rename an entity you own.
--   delete_my_entity(id)         — delete an entity you own (cascades to its
--     accounts / journal / batches / members / rulesets via FK on delete cascade).
-- ============================================================================

create or replace function public.create_my_entity(
  p_name text,
  p_mode text default 'own'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_entity uuid;
  v_source uuid;
  v_batch  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_mode not in ('demo', 'own') then
    raise exception 'mode must be demo or own' using errcode = '22023';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required' using errcode = '22023';
  end if;

  insert into public.entities (name, slug, base_currency, is_sample, owner_id)
  values (
    trim(p_name),
    'sb-' || replace(gen_random_uuid()::text, '-', ''),
    'EUR', false, v_uid
  )
  returning id into v_entity;

  insert into public.entity_members (entity_id, user_id, granted_by)
  values (v_entity, v_uid, v_uid);

  select id into v_source from public.entities where slug = 'northwind';

  if v_source is not null then
    insert into public.accounts (entity_id, code, name, type)
    select v_entity, a.code, a.name, a.type
    from public.accounts a
    where a.entity_id = v_source
    on conflict (entity_id, code) do nothing;
  end if;

  if p_mode = 'demo' and v_source is not null then
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

    refresh materialized view private.mv_account_monthly;
  end if;

  return jsonb_build_object('entity_id', v_entity);
end;
$$;

create or replace function public.rename_my_entity(p_entity_id uuid, p_name text)
returns void
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
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required' using errcode = '22023';
  end if;
  update public.entities set name = trim(p_name)
  where id = p_entity_id and owner_id = v_uid;
  if not found then
    raise exception 'not your entity' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.delete_my_entity(p_entity_id uuid)
returns void
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
  delete from public.entities where id = p_entity_id and owner_id = v_uid;
  if not found then
    raise exception 'not your entity' using errcode = '42501';
  end if;
  refresh materialized view private.mv_account_monthly;
end;
$$;

revoke all on function public.create_my_entity(text, text)  from public, anon;
revoke all on function public.rename_my_entity(uuid, text)  from public, anon;
revoke all on function public.delete_my_entity(uuid)        from public, anon;
grant execute on function public.create_my_entity(text, text) to authenticated;
grant execute on function public.rename_my_entity(uuid, text) to authenticated;
grant execute on function public.delete_my_entity(uuid)       to authenticated;
