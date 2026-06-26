-- ============================================================================
-- Migration 28 — process_uploaded_rows: serverless ingest (no standing worker)
--
-- The Deno worker is the only piece that needed to run outside the database, and
-- only because it PARSED the uploaded file. For the hosted demo we parse the CSV
-- in the browser instead and hand the typed rows to this RPC, which does exactly
-- what the worker did inside the DB: stage the rows, then run the REAL
-- transform_batch + detect_anomalies (validation + z-score). So an upload reaches
-- 'awaiting_review' immediately — Approve appears — with no container to host.
--
-- The meaningful logic (account resolution, validation_errors, anomaly z-score)
-- still runs server-side in the existing private functions; only file parsing
-- moved to the client. Permission mirrors approve_batch (manager/admin of the
-- entity). Idempotent: re-running replaces the batch's staging rows.
-- ============================================================================

create or replace function public.process_uploaded_rows(
  p_batch_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_batch     public.ingest_batches;
  v_transform jsonb;
  v_detect    jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;

  select * into v_batch from public.ingest_batches where id = p_batch_id for update;
  if not found then
    raise exception 'batch % not found', p_batch_id using errcode = 'P0002';
  end if;

  -- Permission: admin, or a manager/admin assigned to the entity (mirrors approve).
  if not coalesce(
       (select private.is_admin())
       or ((select private.user_role()) in ('manager', 'admin')
            and v_batch.entity_id in (select private.my_entity_ids())),
       false)
  then
    raise exception 'not authorized to process batches for entity %', v_batch.entity_id
      using errcode = '42501';
  end if;

  if v_batch.status = 'loaded' then
    raise exception 'batch % is already loaded', p_batch_id using errcode = '22023';
  end if;

  -- Idempotent: clear any prior staging, then stage the parsed rows. row_num is
  -- the source ordinal (unique per batch). Amounts/dates arrive already coerced
  -- (ISO date or null, numeric or null) so the casts here are safe; anything the
  -- client could not parse is null and becomes a validation_error in transform.
  delete from public.journal_staging where batch_id = p_batch_id;

  insert into public.journal_staging
    (batch_id, entity_id, row_num, account_code, txn_date, description, debit, credit, currency, raw)
  select
    p_batch_id, v_batch.entity_id, t.ord::int,
    nullif(t.r ->> 'account_code', ''),
    case when coalesce(t.r ->> 'txn_date', '') = '' then null else (t.r ->> 'txn_date')::date end,
    nullif(t.r ->> 'description', ''),
    case when coalesce(t.r ->> 'debit', '')  = '' then null else (t.r ->> 'debit')::numeric  end,
    case when coalesce(t.r ->> 'credit', '') = '' then null else (t.r ->> 'credit')::numeric end,
    nullif(t.r ->> 'currency', ''),
    coalesce(t.r -> 'raw', '{}'::jsonb)
  from jsonb_array_elements(p_rows) with ordinality as t(r, ord);

  -- The real pipeline (same functions the worker called).
  v_transform := private.transform_batch(p_batch_id);
  v_detect    := private.detect_anomalies(p_batch_id);

  -- No worker will touch the queue job — mark it done so it doesn't linger.
  update public.ingest_queue set status = 'done'
  where batch_id = p_batch_id and status <> 'done';

  return coalesce(v_transform, '{}'::jsonb) || coalesce(v_detect, '{}'::jsonb);
end;
$$;

revoke all on function public.process_uploaded_rows(uuid, jsonb) from public, anon;
grant execute on function public.process_uploaded_rows(uuid, jsonb) to authenticated;
