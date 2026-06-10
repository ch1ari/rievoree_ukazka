-- ============================================================================
-- Migration 10 — Advisory lock on load_batch (serialize delete-and-reload)
--
-- load_batch does a delete-and-reload at (entity, period, source). Two concurrent
-- loads targeting the SAME (entity, period) could interleave their delete and
-- insert and corrupt the slot. A transaction-scoped advisory lock keyed on
-- (entity, period) serializes them: the second waits for the first to commit,
-- then runs its own clean delete-and-reload. xact-scoped → released automatically
-- at commit/rollback, so there is nothing to leak even if the function errors.
--
-- This is the advisory-lock half of the async design (PLAN §5); the queue claim
-- uses FOR UPDATE SKIP LOCKED, which guards a different thing (one worker per
-- job). This guards one reload per (entity, period) target.
--
-- Re-creates the function verbatim from migration 7 with a single added line
-- (the pg_advisory_xact_lock call); body otherwise unchanged.
-- ============================================================================
create or replace function private.load_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch    public.ingest_batches;
  v_deleted  integer;
  v_loaded   integer;
begin
  select * into v_batch from public.ingest_batches where id = p_batch_id;
  if not found then
    raise exception 'load_batch: batch % not found', p_batch_id using errcode = 'P0002';
  end if;

  -- Serialize concurrent reloads of the SAME (entity, period) slot. Transaction-
  -- scoped: auto-released at commit/rollback. hashtext collisions only cause an
  -- occasional harmless extra wait, never a missed lock.
  perform pg_advisory_xact_lock(
    hashtext(v_batch.entity_id::text || '|' || v_batch.period::text)
  );

  update public.ingest_batches set status = 'loading', updated_at = now() where id = p_batch_id;

  with superseded as (
    delete from public.journal_entries je
    where je.entity_id = v_batch.entity_id
      and je.period = v_batch.period
      and je.batch_id in (
        select b.id from public.ingest_batches b
        where b.entity_id = v_batch.entity_id
          and b.period = v_batch.period
          and b.source = v_batch.source
      )
    returning 1
  )
  select count(*) into v_deleted from superseded;

  with promoted as (
    insert into public.journal_entries
      (entity_id, account_id, batch_id, txn_date, description, debit, credit, currency)
    select s.entity_id, s.account_id, s.batch_id, s.txn_date, s.description,
           coalesce(s.debit, 0), coalesce(s.credit, 0), s.currency
    from public.journal_staging s
    where s.batch_id = p_batch_id
      and s.validation_errors is null
      and s.is_anomaly = false
      and s.account_id is not null
      and s.txn_date is not null
    returning 1
  )
  select count(*) into v_loaded from promoted;

  update public.ingest_batches
    set status = 'loaded',
        stats = stats || jsonb_build_object('rows_loaded', v_loaded, 'rows_superseded', v_deleted),
        updated_at = now()
  where id = p_batch_id;

  return jsonb_build_object('rows_loaded', v_loaded, 'rows_superseded', v_deleted);
end;
$$;

comment on function private.load_batch(uuid) is
  'Delete-and-reload promotable staging rows into journal_entries at (entity, period, source). Advisory-locked on (entity, period) to serialize concurrent reloads. Idempotent. Worker-only.';
