-- ============================================================================
-- Migration 7 — ETL core (transform · anomaly detection · delete-and-reload)
--
-- Three private SECURITY DEFINER functions, the center of gravity of the ETL
-- pipeline. The worker (service_role) calls them in order over its existing
-- postgres connection — they are NOT client-facing (no public RPC here; the
-- manager review/approval RPC ties into AAL2 and lands in the auth phase).
--
--   private.transform_batch(batch)   resolve ruleset + account_id, validate,
--                                    stamp ruleset_id, status → awaiting_review
--   private.detect_anomalies(batch)  z-score per (account) of the batch month
--                                    vs trailing history, flag anomalies
--   private.load_batch(batch)        delete-and-reload promotable rows into
--                                    journal_entries, status → loaded
--
-- Why in the DB and not the worker (decided in Phase 2 design):
--   delete-and-reload is a transactional set op; z-score needs history already
--   in journal_entries; DB constraints (unique (batch_id,row_num), the amount
--   CHECK) enforce idempotency; and SQL functions are X-ray-visible later.
--
-- The worker only does what must live outside the DB: fetch the file, parse
-- CSV/XLSX, sanitize cells (formula-injection), map headers via the ruleset,
-- and bulk-insert raw + best-effort-typed rows into journal_staging. Anything
-- it could not coerce is left NULL and caught here as a validation_error.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. transform_batch — resolve, validate, stamp
--
--    Idempotent: safe to re-run on the same batch (re-resolves account_id,
--    rebuilds validation_errors, resets anomaly fields). Returns a stats blob.
-- ----------------------------------------------------------------------------
create or replace function private.transform_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch       public.ingest_batches;
  v_ruleset     public.validation_rulesets;
  v_rules       jsonb;
  v_allowed     text[];
  v_amount_mode text;
  v_stats       jsonb;
begin
  select * into v_batch from public.ingest_batches where id = p_batch_id;
  if not found then
    raise exception 'transform_batch: batch % not found', p_batch_id using errcode = 'P0002';
  end if;

  -- Effective ruleset: an active per-entity override wins over the active
  -- global default. (Both partial-unique indexes guarantee at most one of each,
  -- so this order-by + limit is deterministic.)
  select * into v_ruleset
  from public.validation_rulesets
  where is_active
    and (entity_id = v_batch.entity_id or entity_id is null)
  order by (entity_id is not null) desc
  limit 1;
  if not found then
    raise exception 'transform_batch: no active ruleset for entity %', v_batch.entity_id
      using errcode = 'P0002';
  end if;

  -- Stamp the exact ruleset used — makes a later reload validate against the
  -- same version, never a newer one.
  update public.ingest_batches
    set ruleset_id = v_ruleset.id, status = 'transforming', updated_at = now()
  where id = p_batch_id;

  v_rules       := v_ruleset.rules;
  v_allowed     := array(select jsonb_array_elements_text(v_rules -> 'allowed_currencies'));
  v_amount_mode := coalesce(v_rules ->> 'amount_mode', 'split');

  -- Resolve account_id against the chart of accounts for this entity.
  -- NULL after this = code did not match (caught as a validation_error below).
  update public.journal_staging s
    set account_id = a.id
  from public.accounts a
  where s.batch_id = p_batch_id
    and a.entity_id = s.entity_id
    and a.code = s.account_code;

  -- Reset per-row review/anomaly state for an idempotent re-run, then rebuild
  -- validation_errors. A NULL errors array = the row passed validation.
  update public.journal_staging
    set review_status = 'pending', is_anomaly = false, z_score = null, anomaly_reason = null
  where batch_id = p_batch_id;

  update public.journal_staging s
    set validation_errors = nullif(e.errs, '[]'::jsonb)
  from (
    select s2.id,
      ( case when s2.account_code is null or s2.account_code = ''
          then jsonb_build_array(jsonb_build_object('field', 'account_code', 'error', 'missing'))
          else '[]'::jsonb end
        || case when s2.account_code is not null and s2.account_code <> '' and s2.account_id is null
          then jsonb_build_array(jsonb_build_object('field', 'account_code', 'error', 'unknown account code'))
          else '[]'::jsonb end
        || case when s2.txn_date is null
          then jsonb_build_array(jsonb_build_object('field', 'txn_date', 'error', 'missing or unparseable'))
          else '[]'::jsonb end
        || case when s2.txn_date is not null
                 and date_trunc('month', s2.txn_date::timestamp)::date <> v_batch.period
          then jsonb_build_array(jsonb_build_object('field', 'txn_date', 'error', 'outside batch period'))
          else '[]'::jsonb end
        || case when s2.currency is null or upper(s2.currency::text) <> all (v_allowed)
          then jsonb_build_array(jsonb_build_object('field', 'currency', 'error', 'not allowed'))
          else '[]'::jsonb end
        || case when v_amount_mode = 'split' and not (
                    coalesce(s2.debit, 0) >= 0 and coalesce(s2.credit, 0) >= 0
                    and ((coalesce(s2.debit, 0) = 0) <> (coalesce(s2.credit, 0) = 0)))
          then jsonb_build_array(jsonb_build_object('field', 'amount',
                 'error', 'exactly one of debit/credit must be non-zero, both >= 0'))
          else '[]'::jsonb end
      ) as errs
    from public.journal_staging s2
    where s2.batch_id = p_batch_id
  ) e
  where s.id = e.id;

  select jsonb_build_object(
    'ruleset_id',      v_ruleset.id,
    'ruleset_version', v_ruleset.version,
    'rows_total',      count(*),
    'rows_valid',      count(*) filter (where validation_errors is null),
    'rows_invalid',    count(*) filter (where validation_errors is not null)
  ) into v_stats
  from public.journal_staging where batch_id = p_batch_id;

  update public.ingest_batches
    set stats = stats || v_stats, status = 'awaiting_review', updated_at = now()
  where id = p_batch_id;

  return v_stats;
end;
$$;

comment on function private.transform_batch(uuid) is
  'Resolve ruleset + account_id, build validation_errors, stamp ruleset_id. Idempotent. Worker-only (service_role).';


-- ----------------------------------------------------------------------------
-- 2. detect_anomalies — monthly per-account z-score vs trailing history
--
--    Granularity: the batch covers one month (batch.period). For each account
--    we take the month's net movement (Σdebit − Σcredit) from VALID staging
--    rows and compare it to the same measure over prior months in the
--    PRODUCTION journal. The baseline is strictly period < batch.period (a
--    trailing window), so an anomaly can never dilute its own mean/stddev.
--    All rows of an anomalous account are flagged.
--
--    Guards against false flags / divide-by-zero: fewer than min_history
--    prior periods, or zero/NULL stddev → z_score stays NULL, no flag.
-- ----------------------------------------------------------------------------
create or replace function private.detect_anomalies(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch     public.ingest_batches;
  v_rules     jsonb;
  v_threshold numeric;
  v_min_hist  integer;
  v_trailing  integer;
  v_flagged   integer;
begin
  select * into v_batch from public.ingest_batches where id = p_batch_id;
  if not found then
    raise exception 'detect_anomalies: batch % not found', p_batch_id using errcode = 'P0002';
  end if;

  select rules into v_rules from public.validation_rulesets where id = v_batch.ruleset_id;
  v_threshold := coalesce((v_rules -> 'zscore' ->> 'threshold')::numeric, 3.0);
  v_min_hist  := coalesce((v_rules -> 'zscore' ->> 'min_history_periods')::integer, 3);
  v_trailing  := coalesce((v_rules -> 'zscore' ->> 'trailing_months')::integer, 12);

  with current_m as (
    -- this batch-month's net movement per account (valid rows only)
    select s.account_id, sum(coalesce(s.debit, 0) - coalesce(s.credit, 0)) as m
    from public.journal_staging s
    where s.batch_id = p_batch_id
      and s.validation_errors is null
      and s.account_id is not null
    group by s.account_id
  ),
  hist as (
    -- prior monthly net per account, trailing window, STRICTLY before the
    -- batch period (excludes the tested month → no self-dilution)
    select je.account_id, je.period, sum(je.debit - je.credit) as m
    from public.journal_entries je
    where je.entity_id = v_batch.entity_id
      and je.period <  v_batch.period
      and je.period >= (v_batch.period - make_interval(months => v_trailing))::date
    group by je.account_id, je.period
  ),
  stats as (
    select account_id, count(*) as n, avg(m) as mean, stddev_samp(m) as sd
    from hist group by account_id
  ),
  scored as (
    select c.account_id, c.m, st.n, st.mean, st.sd,
           case when st.n >= v_min_hist and st.sd is not null and st.sd <> 0
                then (c.m - st.mean) / st.sd
                else null end as z
    from current_m c
    left join stats st on st.account_id = c.account_id
  )
  update public.journal_staging s
    set z_score = sc.z,
        is_anomaly = (sc.z is not null and abs(sc.z) > v_threshold),
        anomaly_reason = case when sc.z is not null and abs(sc.z) > v_threshold
          then format('month net %s is %sσ vs %s-mo mean %s ± %s',
                      round(sc.m, 2), round(sc.z, 1), sc.n, round(sc.mean, 2), round(sc.sd, 2))
          else null end,
        review_status = case when sc.z is not null and abs(sc.z) > v_threshold
          then 'flagged'::public.review_status
          else s.review_status end
  from scored sc
  where s.batch_id = p_batch_id
    and s.account_id = sc.account_id
    and s.validation_errors is null;

  select count(distinct account_id) into v_flagged
  from public.journal_staging where batch_id = p_batch_id and is_anomaly;

  update public.ingest_batches
    set stats = stats || jsonb_build_object('flagged_accounts', v_flagged), updated_at = now()
  where id = p_batch_id;

  return jsonb_build_object('flagged_accounts', v_flagged);
end;
$$;

comment on function private.detect_anomalies(uuid) is
  'Monthly per-account z-score vs trailing journal history (period < batch.period). Flags anomalies. Worker-only.';


-- ----------------------------------------------------------------------------
-- 3. load_batch — delete-and-reload into production
--
--    Reload granularity (entity, period, source): drop the production rows of
--    ANY batch for the same slot (the prior load), then insert this batch's
--    promotable rows. Idempotent — re-running cannot duplicate.
--
--    Promotable = passed validation AND not an unreviewed anomaly. A flagged
--    anomaly therefore does NOT load; it waits in staging for the review step
--    (auth phase). That is the visible "anomaly blocks the import" behavior.
--
--    Known simplification: a superseded older batch stays in status 'loaded'
--    (the enum has no 'superseded'); its rows are gone but the batch row keeps
--    its history. Acceptable for now.
-- ----------------------------------------------------------------------------
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
  'Delete-and-reload promotable staging rows into journal_entries at (entity, period, source). Idempotent. Worker-only.';


-- ----------------------------------------------------------------------------
-- 4. Grants — worker (service_role) only; never client-callable
--    (functions default to EXECUTE for PUBLIC on creation; revoke that.)
-- ----------------------------------------------------------------------------
revoke all on function private.transform_batch(uuid)  from public;
revoke all on function private.detect_anomalies(uuid) from public;
revoke all on function private.load_batch(uuid)       from public;

grant execute on function private.transform_batch(uuid)  to service_role;
grant execute on function private.detect_anomalies(uuid) to service_role;
grant execute on function private.load_batch(uuid)       to service_role;
