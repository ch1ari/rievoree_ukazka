-- ============================================================================
-- Migration 27 — Scoped admin: keep the admin role, stop entities from mixing
--
-- Problem: private.is_admin() granted GLOBAL visibility (every tenant), so a
-- self-registered user who chose/switched to "admin" could see — and approve —
-- the showcase tenants and other users' sandboxes.
--
-- Fix: admin is now SCOPED. private.is_admin() is global ONLY for platform
-- accounts that own no sandbox (the seeded super_admin/admin). A self-registered
-- user (who owns a sandbox entity) is never "global admin"; their access is
-- purely membership-based, so they see only their own entities — whatever role
-- they hold. To keep admin USEFUL inside their own sandbox, the manager-only
-- branches of the ingest/approval policies now also accept 'admin'.
--
-- Net effect:
--   * registered viewer  → reads own reports only
--   * registered manager → ingest + approve, own entities only
--   * registered admin   → manager rights + own chart of accounts, own entities only
--   * platform super_admin/admin (own no sandbox) → unchanged, global
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Scope the global-admin helper to platform accounts (no owned sandbox).
-- ----------------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.user_role() in ('super_admin', 'admin')
    and not exists (
      select 1 from public.entities where owner_id = (select auth.uid())
    ),
    false)
$$;

comment on function private.is_admin() is
  'TRUE only for platform staff (super_admin/admin who own no sandbox) → global access. A self-registered admin owns a sandbox, so this is FALSE for them and their access stays membership-scoped (migration 27).';


-- ----------------------------------------------------------------------------
-- 2. Let a scoped admin keep manager-level rights on their OWN entities.
--    (Platform admin is still covered by is_admin() above.)
-- ----------------------------------------------------------------------------

drop policy if exists journal_staging_select on public.journal_staging;
create policy journal_staging_select on public.journal_staging
  for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.user_role()) in ('manager', 'admin')
      and entity_id in (select private.my_entity_ids())
    )
  );

drop policy if exists ingest_batches_select on public.ingest_batches;
create policy ingest_batches_select on public.ingest_batches
  for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.user_role()) in ('manager', 'admin')
      and entity_id in (select private.my_entity_ids())
    )
  );

drop policy if exists ingest_batches_insert on public.ingest_batches;
create policy ingest_batches_insert on public.ingest_batches
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      (select private.is_admin())
      or (
        (select private.user_role()) in ('manager', 'admin')
        and entity_id in (select private.my_entity_ids())
      )
    )
  );

drop policy if exists validation_rulesets_select on public.validation_rulesets;
create policy validation_rulesets_select on public.validation_rulesets
  for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.user_role()) in ('manager', 'admin')
      and (
        entity_id is null
        or entity_id in (select private.my_entity_ids())
      )
    )
  );

-- Chart of accounts: a scoped admin manages their own entities' charts; platform
-- admin manages any. (Was admin-only globally.)
drop policy if exists accounts_write on public.accounts;
create policy accounts_write on public.accounts
  for all to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.user_role()) = 'admin'
      and entity_id in (select private.my_entity_ids())
    )
  )
  with check (
    (select private.is_admin())
    or (
      (select private.user_role()) = 'admin'
      and entity_id in (select private.my_entity_ids())
    )
  );


-- ----------------------------------------------------------------------------
-- 3. Same widening in the SECURITY DEFINER gates (RLS is bypassed there).
-- ----------------------------------------------------------------------------

-- approve_batch: a scoped admin may approve their own entities' batches.
create or replace function public.approve_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_batch  public.ingest_batches;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_batch from public.ingest_batches where id = p_batch_id for update;
  if not found then
    raise exception 'approve_batch: batch % not found', p_batch_id using errcode = 'P0002';
  end if;

  if not coalesce(
    (select private.is_admin())
    or (
      (select private.user_role()) in ('manager', 'admin')
      and v_batch.entity_id in (select private.my_entity_ids())
    ),
    false
  ) then
    raise exception 'not authorized to approve batches for entity %', v_batch.entity_id
      using errcode = '42501';
  end if;

  if v_batch.status <> 'awaiting_review' then
    raise exception 'batch % is not awaiting_review (status=%)', p_batch_id, v_batch.status
      using errcode = '22023';
  end if;

  v_result := private.load_batch(p_batch_id);

  update public.journal_staging
    set review_status = 'approved', reviewed_by = v_uid, reviewed_at = now()
  where batch_id = p_batch_id
    and validation_errors is null
    and is_anomaly = false;

  insert into public.pipeline_events (entity_id, batch_id, stage, actor, detail)
  values (v_batch.entity_id, p_batch_id, 'approved', v_uid, v_result);

  return jsonb_build_object('status', 'approved', 'batch_id', p_batch_id) || v_result;
end;
$$;

-- submit_batch: a scoped admin may upload for their own entities.
create or replace function public.submit_batch(
  p_entity_id    uuid,
  p_storage_path text,
  p_file_name    text,
  p_file_hash    text,
  p_period       date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_batch_id uuid;
  v_existing uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_entity_id is null then
    raise exception 'entity_id is required' using errcode = '22023';
  end if;
  if coalesce(p_file_name, '') = '' then
    raise exception 'file_name is required' using errcode = '22023';
  end if;
  if p_file_hash is null or p_file_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'file_hash must be a sha-256 hex digest' using errcode = '22023';
  end if;
  if p_storage_path is null
     or p_storage_path not like ('ingest/' || p_entity_id::text || '/%') then
    raise exception 'storage_path must be under ingest/%/', p_entity_id
      using errcode = '22023';
  end if;
  if p_period is null then
    raise exception 'period is required' using errcode = '22023';
  end if;

  if not coalesce(
    (select private.is_admin())
    or (
      (select private.user_role()) in ('manager', 'admin')
      and p_entity_id in (select private.my_entity_ids())
    ),
    false
  ) then
    raise exception 'not authorized to submit a batch for entity %', p_entity_id
      using errcode = '42501';
  end if;

  begin
    insert into public.ingest_batches
      (entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
    values
      (p_entity_id, v_uid, 'manual', p_file_name, p_storage_path, p_file_hash,
       date_trunc('month', p_period::timestamp)::date, 'queued')
    returning id into v_batch_id;
  exception
    when unique_violation then
      select id into v_existing
      from public.ingest_batches
      where entity_id = p_entity_id
        and file_hash = p_file_hash
        and status not in ('rejected', 'failed')
      limit 1;
      return jsonb_build_object('status', 'duplicate', 'batch_id', v_existing);
  end;

  insert into public.ingest_queue (batch_id, job_type, payload)
  values (v_batch_id, 'process_batch', '{}'::jsonb);

  return jsonb_build_object('status', 'created', 'batch_id', v_batch_id);
end;
$$;

-- set_entity_ruleset: a scoped admin may set rules for their own entities.
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

  if not coalesce(
       (select private.is_admin())
       or ((select private.user_role()) in ('manager', 'admin')
            and p_entity_id in (select private.my_entity_ids())),
       false)
  then
    raise exception 'not allowed to set rules for this entity'
      using errcode = '42501';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.validation_rulesets
  where entity_id = p_entity_id;

  update public.validation_rulesets
    set is_active = false
  where entity_id = p_entity_id and is_active;

  insert into public.validation_rulesets (entity_id, version, rules, is_active, created_by)
  values (p_entity_id, v_version, p_rules, true, v_uid)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'entity_id', p_entity_id, 'version', v_version);
end;
$$;
