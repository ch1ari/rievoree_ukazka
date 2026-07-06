-- ============================================================================
-- Migration 34 — simulate_connector_sync: warning-free Drive demo
--
-- Runs a synthetic file through the REAL connector pipeline (stage → transform →
-- z-score → awaiting_review) without any Google OAuth — so a portfolio visitor
-- can watch the whole Drive → ETL → review chain light up in the X-ray panel with
-- no "unverified app" consent screen. Deterministic, fake data only.
--
-- The real OAuth2 + Drive Changes API path (connector-sync edge fn) stays as the
-- production implementation; this is the demo affordance beside it.
--
-- Permission: manager/admin of the entity (private.can_manage_entity), same gate
-- as the rest of the ingest machinery.
-- ============================================================================
create or replace function public.simulate_connector_sync(p_connector_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conn      public.connectors;
  v_rev       text;
  v_exp       text;
  v_period    date := date_trunc('month', now())::date;
  v_seq       integer;
  v_ext       text;
  v_batch     uuid;
  v_rows      jsonb;
  v_transform jsonb;
  v_detect    jsonb;
begin
  select * into v_conn from public.connectors where id = p_connector_id;
  if not found then
    raise exception 'connector % not found', p_connector_id using errcode = 'P0002';
  end if;
  if not (select private.can_manage_entity(v_conn.entity_id)) then
    raise exception 'not authorized for this connector' using errcode = '42501';
  end if;

  -- Use real account codes from the entity's chart so the rows validate cleanly.
  select code into v_rev from public.accounts
    where entity_id = v_conn.entity_id and type = 'revenue' order by code limit 1;
  select code into v_exp from public.accounts
    where entity_id = v_conn.entity_id and type = 'expense' order by code limit 1;
  if v_rev is null or v_exp is null then
    raise exception 'this entity has no revenue/expense accounts to simulate with — add a chart of accounts first'
      using errcode = '22023';
  end if;

  -- Unique external id per run (no clock in a deterministic fn → count-based).
  select count(*) + 1 into v_seq from public.connector_files where connector_id = p_connector_id;
  v_ext := 'sim-' || v_seq;

  -- One balanced pair of entries for the current month.
  v_rows := jsonb_build_array(
    jsonb_build_object('account_code', v_rev, 'txn_date', to_char(v_period, 'YYYY-MM-DD'),
      'debit', '0', 'credit', '12000', 'currency', 'EUR', 'description', 'Simulated Drive import — sales'),
    jsonb_build_object('account_code', v_exp, 'txn_date', to_char(v_period, 'YYYY-MM-DD'),
      'debit', '12000', 'credit', '0', 'currency', 'EUR', 'description', 'Simulated Drive import — costs')
  );

  -- X-ray chain: the connector "polled" the source.
  insert into public.pipeline_events (entity_id, stage, actor, detail)
  values (v_conn.entity_id, 'connector_poll', (select auth.uid()),
          jsonb_build_object('connector_id', p_connector_id, 'kind', v_conn.kind, 'mode', 'demo'));

  insert into public.ingest_batches
    (entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
  values (
    v_conn.entity_id, v_conn.owner_id, v_conn.kind::text::public.ingest_source,
    'drive-demo-' || v_seq || '.csv',
    'connector/' || p_connector_id::text || '/' || v_ext,
    'sim-' || md5(p_connector_id::text || v_ext), v_period, 'queued'
  )
  returning id into v_batch;

  insert into public.connector_files (connector_id, entity_id, external_id, file_name, batch_id)
  values (p_connector_id, v_conn.entity_id, v_ext, 'drive-demo-' || v_seq || '.csv', v_batch);

  insert into public.pipeline_events (entity_id, batch_id, stage, detail)
  values (v_conn.entity_id, v_batch, 'connector_file_received',
          jsonb_build_object('connector_id', p_connector_id, 'external_id', v_ext, 'mode', 'demo'));

  insert into public.journal_staging
    (batch_id, entity_id, row_num, account_code, txn_date, description, debit, credit, currency, raw)
  select
    v_batch, v_conn.entity_id, t.ord::int,
    t.r ->> 'account_code', (t.r ->> 'txn_date')::date, t.r ->> 'description',
    (t.r ->> 'debit')::numeric, (t.r ->> 'credit')::numeric, t.r ->> 'currency', t.r
  from jsonb_array_elements(v_rows) with ordinality as t(r, ord);

  v_transform := private.transform_batch(v_batch);
  v_detect    := private.detect_anomalies(v_batch);

  update public.ingest_queue set status = 'done' where batch_id = v_batch and status <> 'done';
  update public.connectors set last_sync_at = now(), last_error = null where id = p_connector_id;

  return jsonb_build_object('status', 'created', 'batch_id', v_batch, 'file', 'drive-demo-' || v_seq || '.csv')
         || coalesce(v_transform, '{}'::jsonb) || coalesce(v_detect, '{}'::jsonb);
end;
$$;

revoke all on function public.simulate_connector_sync(uuid) from public, anon;
grant execute on function public.simulate_connector_sync(uuid) to authenticated;
