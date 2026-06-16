-- ============================================================================
-- Migration 17 — pg_net: notify a reviewer when a batch is ready for review
--
-- Closes the LAST async gap of the X-ray pipeline and demonstrates an honest
-- outbound call (DB → edge function), not a dead self-invoke:
--
--   worker: transform_batch (→ awaiting_review)  then  detect_anomalies
--           (stamps stats.flagged_accounts)
--                       │
--   [HERE] AFTER UPDATE trigger fires the moment flagged_accounts is stamped
--          → pg_net POSTs to the `notify-review` edge function (async)
--          → emits review_notify_requested  (mirrors refresh_enqueued)
--   notify-review (edge fn): logs + emits review_notified (mirrors mv_refreshed)
--
-- WHY the trigger keys on stats.flagged_accounts (NOT the status flip):
--   transform_batch sets status = 'awaiting_review' BEFORE detect_anomalies has
--   computed the anomaly count. A trigger on the status transition would fire
--   too early — with no count to report. detect_anomalies later writes
--   stats.flagged_accounts; THAT write is the "review is ready" signal, and it
--   carries the count. So the WHEN keys on flagged_accounts newly appearing.
--   Side effect: an idempotent transform/detect re-run does NOT re-notify (the
--   key is already present), which is exactly what we want.
--
-- FAIL-SOFT (a deliberate inversion of the auth-gate fail-CLOSED invariant):
--   this trigger runs INSIDE the worker's ETL transaction, and a notification is
--   best-effort. It is NOT an authorization barrier, so any failure (Vault read,
--   pg_net, event insert) is swallowed — a missed ping is acceptable, a
--   rolled-back load is not. coalesce-fail-CLOSED applies to permission gates;
--   this is a side effect, so the correct posture is the opposite.
--
-- CONFIG, NOT HARDCODE (the local≠remote guard):
--   the endpoint URL + bearer live in Supabase Vault, read at runtime. The code
--   is byte-identical in every environment; only the secret VALUES differ
--   (local kong URL + demo key vs the remote public URL + real service_role
--   key). Secrets are provisioned out-of-band — seed.sql locally (db reset),
--   vault.create_secret on remote — and NEVER committed. No hostname appears
--   here. If the secrets are absent, the trigger fail-soft skips.
-- ============================================================================

-- pg_net installs into schema `net`. Unconditional (unlike pg_cron's guarded
-- DO block): the trigger body references net.http_post, which must resolve at
-- CREATE time (check_function_bodies). pg_net is available locally and on remote
-- (verified: 0.20.3 both).
create extension if not exists pg_net;

-- ----------------------------------------------------------------------------
-- Trigger function — enqueue the outbound notification + emit the request event.
-- SECURITY DEFINER (owned by postgres) so it can read Vault and write
-- pipeline_events regardless of the firing context; search_path = '' with every
-- reference schema-qualified.
-- ----------------------------------------------------------------------------
create or replace function private.notify_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url     text;
  v_key     text;
  v_flagged integer := coalesce((new.stats ->> 'flagged_accounts')::integer, 0);
  v_payload jsonb;
begin
  -- Endpoint config from Vault. Identical everywhere; only the values differ →
  -- that difference IS the local≠remote guard. Provisioned out-of-band.
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'edge_notify_review_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'edge_service_role_key';

  -- Not configured → skip, visibly-but-soft. NEVER raise (see header: fail-soft).
  if v_url is null or v_key is null then
    raise notice 'notify_review: Vault endpoint not configured, skipping (batch %)', new.id;
    return null;
  end if;

  v_payload := jsonb_build_object(
    'batch_id',         new.id,
    'entity_id',        new.entity_id,
    'period',           new.period,
    'status',           new.status,
    'flagged_accounts', v_flagged,
    'rows_total',       (new.stats ->> 'rows_total')::integer,
    'rows_invalid',     (new.stats ->> 'rows_invalid')::integer
  );

  -- Async POST. pg_net enqueues into net.http_request_queue and its background
  -- worker sends only AFTER this transaction commits — so a rolled-back ETL txn
  -- sends nothing (no phantom notification), and the call never blocks the
  -- worker. The bearer is the service_role JWT (passes the edge fn's verify_jwt).
  perform net.http_post(
    url     => v_url,
    body    => v_payload,
    headers => jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    )
  );

  -- X-ray timeline: "the DB asked for a review notification." The edge fn emits
  -- the matching review_notified once the round-trip actually completes, so the
  -- panel shows request → delivered (mirrors refresh_enqueued → mv_refreshed).
  insert into public.pipeline_events (entity_id, batch_id, stage, detail)
  values (new.entity_id, new.id, 'review_notify_requested',
          jsonb_build_object('flagged_accounts', v_flagged));

  return null; -- AFTER trigger
exception
  -- Fail-soft backstop: ANY error is swallowed so the worker's ETL transaction
  -- survives intact. The plpgsql exception block is a savepoint, so a failure
  -- here also unwinds the http_post enqueue + event insert together (all-or-
  -- nothing for this side effect), never the surrounding ETL work.
  when others then
    raise notice 'notify_review: suppressed error for batch %: %', new.id, sqlerrm;
    return null;
end;
$$;

comment on function private.notify_review() is
  'AFTER-UPDATE trigger fn: when detect_anomalies stamps stats.flagged_accounts on an awaiting_review batch, pg_net POSTs to the notify-review edge fn and emits review_notify_requested. Fail-soft (never rolls back the ETL). Endpoint via Vault (local≠remote guard).';

-- Trigger-fn, cron/trigger-internal: strip the default PUBLIC execute grant.
revoke all on function private.notify_review() from public;

-- ----------------------------------------------------------------------------
-- The trigger. Keys on flagged_accounts NEWLY appearing on an awaiting_review
-- batch (see header). Fires once per batch lifecycle, after detect_anomalies.
--
-- TOGGLE: to notify only when there ARE anomalies (N>0) rather than for every
-- review-ready batch (N>=0, current — a clean batch still needs manager
-- approval, so it must not sit silently), add to the WHEN:
--     and (new.stats ->> 'flagged_accounts')::integer > 0
-- ----------------------------------------------------------------------------
create trigger ingest_batches_notify_review
after update on public.ingest_batches
for each row
when (
  new.status = 'awaiting_review'
  and new.stats ? 'flagged_accounts'
  and not coalesce(old.stats ? 'flagged_accounts', false)
)
execute function private.notify_review();
