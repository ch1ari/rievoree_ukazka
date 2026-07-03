-- ============================================================================
-- Migration 31 — Bounded pg_cron auto-sync for Google Drive connectors
--
-- Closes the connector loop the way migration 16/17 closed the report loop:
--   [HERE] cron tick → claim up to N active gdrive connectors DUE for a sync
--          → pg_net POSTs each to the `connector-sync` edge function (cron mode,
--            service_role bearer) → the function refreshes the access token,
--            pulls Drive changes from connectors.cursor (the resumable page
--            token), ingests new files, and advances the cursor.
--
-- BOUNDED: at most N connectors per tick (default 5), oldest-synced first, so a
-- backlog drains steadily and one tick can never fan out unboundedly.
--
-- Same postures as the existing async infra:
--   * WORK (claim + POST) is plain plpgsql in `private`, testable directly.
--   * SCHEDULING is a guarded DO block — no-ops where pg_cron is unavailable, so
--     the migration applies identically everywhere.
--   * Endpoint URL + bearer come from Vault (config, not hardcode); absent →
--     fail-soft skip. NEVER raises (a missed sync is acceptable).
-- ============================================================================

create or replace function private.run_connector_syncs(p_limit integer default 5)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url  text;
  v_key  text;
  v_conn record;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'edge_connector_sync_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'edge_service_role_key';

  -- Not configured → skip softly (mirrors notify_review).
  if v_url is null or v_key is null then
    raise notice 'run_connector_syncs: Vault endpoint not configured, skipping';
    return;
  end if;

  -- Bounded claim: active gdrive connectors, least-recently-synced first.
  for v_conn in
    select id from public.connectors
    where kind = 'gdrive' and status = 'active'
    order by last_sync_at asc nulls first
    limit greatest(p_limit, 1)
  loop
    -- Async POST in cron mode. The edge function authenticates the cron caller by
    -- the service_role bearer and syncs exactly this connector.
    perform net.http_post(
      url     => v_url,
      body    => jsonb_build_object('mode', 'cron', 'connector_id', v_conn.id),
      headers => jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_key
      )
    );
  end loop;
exception
  when others then
    raise notice 'run_connector_syncs: suppressed error: %', sqlerrm;
end;
$$;

comment on function private.run_connector_syncs(integer) is
  'Cron-driven: claim up to N active gdrive connectors (oldest sync first) and pg_net POST each to connector-sync in cron mode. Fail-soft. Endpoint via Vault.';

revoke all on function private.run_connector_syncs(integer) from public;


-- Scheduling — guarded, idempotent (same shape as migration 16).
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron unavailable — run_connector_syncs installed, scheduling skipped.';
    return;
  end if;

  execute 'create extension if not exists pg_cron';

  if exists (select 1 from cron.job where jobname = 'connector-auto-sync') then
    perform cron.unschedule('connector-auto-sync');
  end if;
  perform cron.schedule(
    'connector-auto-sync',
    '*/10 * * * *',                       -- every 10 minutes
    $job$select private.run_connector_syncs(5);$job$
  );
end;
$$;
