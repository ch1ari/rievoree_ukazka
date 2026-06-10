-- ============================================================================
-- Migration 16 — pg_cron: report-MV refresh + housekeeping
--
-- Closes the async loop the trigger chain (migration 13) opened:
--   journal write → trigger enqueues (entity, period) into report_refresh_queue
--   → [HERE] cron consumes the queue → REFRESH MV CONCURRENTLY → emits
--     mv_refreshed → X-ray panel (Realtime).
--
-- Two concerns, deliberately split:
--   1. The WORK is plain plpgsql in `private` — installed unconditionally and
--      fully testable by calling the function directly (deterministic), with no
--      dependency on pg_cron existing.
--   2. The SCHEDULING (create extension + cron.schedule) is wrapped in a guarded
--      DO block that no-ops where pg_cron is unavailable. This is the local≠remote
--      guard: identical migration applies everywhere; only whether the scheduler
--      is wired differs. Scheduling is authoritatively verified on remote via
--      cron.job / cron.job_run_details.
--
-- Both functions are SECURITY DEFINER owned by `postgres` (the migration role).
-- pg_cron jobs created here run as `postgres`, so the definer === MV owner ===
-- job owner: REFRESH CONCURRENTLY is permitted and no extra EXECUTE grant is
-- needed (we revoke all from public — these are cron-internal, not client RPCs).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Refresh function — whole-MV CONCURRENTLY refresh, coalesced via the queue.
--
--    Key insight: REFRESH MATERIALIZED VIEW CONCURRENTLY rebuilds the ENTIRE MV
--    in one shot, not per (entity, period). So report_refresh_queue is a single
--    "is anything dirty?" signal, not a worklist to iterate. If anything is
--    queued we do exactly one global refresh, then clear what we claimed.
-- ----------------------------------------------------------------------------
create or replace function private.refresh_report_mv()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_watermark   timestamptz;
  v_start       timestamptz;
  v_duration_ms integer;
begin
  -- One refresh at a time. A second concurrent REFRESH CONCURRENTLY on the same
  -- MV would block/error; this also guards a manual call racing the cron tick.
  -- xact-scoped, auto-released on commit (same advisory pattern as load_batch).
  if not pg_try_advisory_xact_lock(hashtext('refresh_report_mv')) then
    return;
  end if;

  -- Claim everything queued up to NOW by snapshotting the high-water enqueue
  -- time BEFORE the refresh. Rows enqueued *during* the refresh carry a later
  -- enqueued_at, survive the delete below, and get picked up next tick — so a
  -- write that lands mid-refresh is never silently dropped. (Negligible-window
  -- caveat: a concurrent enqueue committing with a timestamp <= watermark just
  -- after we read it would have had its data in this refresh anyway.)
  v_watermark := (select max(enqueued_at) from public.report_refresh_queue);

  -- Nothing dirty → no work, no event (keep the X-ray timeline quiet).
  if v_watermark is null then
    return;
  end if;

  v_start := clock_timestamp();

  -- Whole-MV refresh. CONCURRENTLY keeps SELECTs (public.report_account_monthly)
  -- readable throughout; it requires the unique index mv_account_monthly_pk,
  -- which exists (migration 11).
  refresh materialized view concurrently private.mv_account_monthly;

  -- clock_timestamp() (wall clock), not now() (fixed at txn start).
  v_duration_ms := (extract(epoch from clock_timestamp() - v_start) * 1000)::integer;

  -- Clear exactly what we claimed AND emit one mv_refreshed event per affected
  -- entity in a single statement. pipeline_events.entity_id is NOT NULL, so a
  -- per-entity row means each tenant sees the refresh in its own X-ray panel.
  with cleared as (
    delete from public.report_refresh_queue
     where enqueued_at <= v_watermark
    returning entity_id, period
  )
  insert into public.pipeline_events (entity_id, stage, detail, duration_ms)
  select entity_id,
         'mv_refreshed',
         jsonb_build_object('periods', array_agg(distinct period order by period)),
         v_duration_ms
  from cleared
  group by entity_id;
end;
$$;

comment on function private.refresh_report_mv() is
  'Cron-driven: if report_refresh_queue is non-empty, REFRESH MV CONCURRENTLY once, clear claimed slots (watermark), emit mv_refreshed per entity. Advisory-locked against overlap.';

-- cron-internal only: strip the default PUBLIC execute grant. No client RPC.
revoke all on function private.refresh_report_mv() from public;


-- ----------------------------------------------------------------------------
-- 2. Housekeeping function — bound the unbounded tables.
--
--    Retention is 30 days for everything. journal_staging and ingest_queue both
--    FK to ingest_batches ON DELETE CASCADE, so deleting a terminal batch sweeps
--    its staging rows and queue jobs too — no separate "orphan" cleanup needed.
-- ----------------------------------------------------------------------------
create or replace function private.run_housekeeping()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_retention constant interval := interval '30 days';
begin
  -- Terminal batches (and, via cascade, their journal_staging + ingest_queue
  -- rows). 'loaded' batches are never touched — they are the audit trail behind
  -- the production journal_entries.
  delete from public.ingest_batches
   where status in ('rejected', 'failed')
     and updated_at < now() - v_retention;

  -- The X-ray timeline: the one table that grows without bound. Trim by age.
  delete from public.pipeline_events
   where created_at < now() - v_retention;

  -- Old terminal queue jobs whose batch is still around (the cascade above only
  -- reaches DELETED batches; jobs of surviving 'loaded' batches linger). Keep
  -- the queue table lean.
  delete from public.ingest_queue
   where status in ('done', 'failed')
     and created_at < now() - v_retention;
end;
$$;

comment on function private.run_housekeeping() is
  'Cron-driven daily: purge >30d terminal batches (cascades to staging+queue), >30d pipeline_events, and >30d done/failed queue jobs of surviving batches.';

revoke all on function private.run_housekeeping() from public;


-- ----------------------------------------------------------------------------
-- 3. Scheduling — guarded. No-ops where pg_cron is unavailable so the migration
--    applies identically everywhere; the functions above are already installed.
--    Authoritatively verified on remote (cron.job + cron.job_run_details).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron unavailable — functions installed, scheduling skipped (wire on remote).';
    return;
  end if;

  execute 'create extension if not exists pg_cron';

  -- Idempotent (re)schedule: drop any same-named job first, then (re)create, so
  -- re-applying this migration never errors and never duplicates a job.
  if exists (select 1 from cron.job where jobname = 'refresh-report-mv') then
    perform cron.unschedule('refresh-report-mv');
  end if;
  perform cron.schedule(
    'refresh-report-mv',
    '* * * * *',                                  -- every minute
    $job$select private.refresh_report_mv();$job$
  );

  if exists (select 1 from cron.job where jobname = 'housekeeping') then
    perform cron.unschedule('housekeeping');
  end if;
  perform cron.schedule(
    'housekeeping',
    '17 3 * * *',                                 -- daily 03:17 (DB tz / UTC)
    $job$select private.run_housekeeping();$job$
  );
end;
$$;
