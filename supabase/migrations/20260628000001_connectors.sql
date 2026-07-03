-- ============================================================================
-- Migration 29 — Connectors (Google Drive auto-ingest + HMAC webhook)
--
-- An external data SOURCE that feeds the ETL queue without a manual upload.
-- Two kinds, sharing one table + one ingestion path:
--
--   * gdrive  — real Google OAuth2 (offline/refresh token) + Drive Changes API.
--               A resumable page token (connectors.cursor) survives restarts;
--               connector_files is the idempotent claim ledger so a file is
--               ingested at most once even if a sync repeats.
--   * webhook — an HMAC-signed POST endpoint (constant-time verify in the edge
--               function). The shared secret lives in connectors.webhook_secret,
--               which is NOT API-readable (column grant) — only the create /
--               rotate RPC returns it once, and service_role reads it to verify.
--
-- Security posture (matches the rest of the project):
--   * SELECT: managers/admins of the entity + platform admin (same predicate as
--     ingest_batches). Viewers never see the machinery.
--   * No client writes — every mutation is a SECURITY DEFINER RPC that re-checks
--     permission (private.can_manage_entity). Secret columns are revoked from the
--     API roles entirely; service_role (edge functions) bypasses RLS to read them.
--   * OAuth refresh token + webhook secret are write-once from the client's view:
--     they are set by service_role (callback / create RPC) and never selectable.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. pgcrypto (extensions schema) for gen_random_bytes — the HMAC secret source.
--    Supabase ships it here; `if not exists` makes this a no-op when present.
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;


-- ----------------------------------------------------------------------------
-- 1. Shared authorization helper — "may the caller manage this entity?"
--    Mirrors the coalesce gate used inline by submit_batch / approve_batch /
--    process_uploaded_rows, factored out so connector RPCs stay DRY.
-- ----------------------------------------------------------------------------
create or replace function private.can_manage_entity(p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.is_admin()
    or (
      private.user_role() in ('manager', 'admin')
      and p_entity_id in (select private.my_entity_ids())
    ),
    false)
$$;

comment on function private.can_manage_entity(uuid) is
  'TRUE if the caller is a platform admin, or a manager/admin assigned to the entity. The single source of truth for "can run ingest machinery for this entity".';

revoke all on function private.can_manage_entity(uuid) from public, anon;
grant execute on function private.can_manage_entity(uuid) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2. connectors — one external source binding per row
-- ----------------------------------------------------------------------------
create type public.connector_kind   as enum ('gdrive', 'webhook');
create type public.connector_status as enum ('pending_auth', 'active', 'paused', 'error');

create table public.connectors (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null references public.entities (id) on delete cascade,
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  kind          public.connector_kind not null,
  name          text not null,
  status        public.connector_status not null default 'pending_auth',
  -- Free-form per-kind settings: gdrive → {folder_id, folder_name};
  -- webhook → {format:'csv'|'rows'}. Never holds secrets (see below).
  config        jsonb not null default '{}'::jsonb,
  -- Resumable Drive Changes page token. Survives restarts → no re-scan.
  cursor        text,
  last_sync_at  timestamptz,
  last_error    text,

  -- ---- Secret columns: NOT exposed to the API roles (see grants below) -------
  -- Webhook HMAC shared secret (hex). Returned once by create/rotate RPC.
  webhook_secret      text,
  -- Google OAuth offline credentials. Written by the callback edge function
  -- (service_role); never selectable by authenticated.
  oauth_refresh_token text,
  oauth_access_token  text,
  oauth_expiry        timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A webhook connector always has a secret; a gdrive one never does.
  constraint connectors_kind_secret_chk check (
    (kind = 'webhook' and webhook_secret is not null)
    or (kind = 'gdrive'  and webhook_secret is null)
  )
);

create index connectors_entity_idx on public.connectors (entity_id, created_at desc);
create index connectors_owner_idx  on public.connectors (owner_id);
-- Bounded-cron claim query: "active gdrive connectors due for a sync".
create index connectors_due_idx
  on public.connectors (kind, status, last_sync_at)
  where kind = 'gdrive' and status = 'active';

create trigger connectors_set_updated_at
  before update on public.connectors
  for each row execute function private.set_updated_at();


-- ----------------------------------------------------------------------------
-- 3. connector_files — idempotent claim ledger (one row per ingested file)
-- ----------------------------------------------------------------------------
create table public.connector_files (
  id           uuid primary key default gen_random_uuid(),
  connector_id uuid not null references public.connectors (id) on delete cascade,
  entity_id    uuid not null references public.entities (id) on delete cascade,
  -- Drive file id, or the webhook delivery id — the dedup key within a connector.
  external_id  text not null,
  file_name    text,
  batch_id     uuid references public.ingest_batches (id) on delete set null,
  status       text not null default 'ingested',
  created_at   timestamptz not null default now(),

  -- The claim: a file is ingested at most once per connector.
  unique (connector_id, external_id)
);

create index connector_files_connector_idx
  on public.connector_files (connector_id, created_at desc);


-- ----------------------------------------------------------------------------
-- 4. Grants — secret columns are unreadable through the API
--
--    Default privileges (migration 12) already give authenticated SELECT-only on
--    new tables and anon nothing. We narrow connectors' SELECT to the non-secret
--    columns so the webhook secret / OAuth tokens can never leave via PostgREST.
--    service_role keeps full access (edge functions read secrets to verify/sync).
-- ----------------------------------------------------------------------------
revoke select on public.connectors from authenticated;
grant select (
  id, entity_id, owner_id, kind, name, status, config,
  cursor, last_sync_at, last_error, created_at, updated_at
) on public.connectors to authenticated;

-- connector_files carries no secret → plain SELECT (RLS still gates the rows).
-- Explicit (not relying on default privileges) since new-table auto-exposure is
-- off post-2026-05-30; writes stay closed (RPC / service_role only).
grant select on public.connector_files to authenticated;


-- ----------------------------------------------------------------------------
-- 5. RLS — read for entity managers/admins; all writes via RPC / service_role
-- ----------------------------------------------------------------------------
alter table public.connectors      enable row level security;
alter table public.connector_files enable row level security;

create policy connectors_select on public.connectors
  for select to authenticated
  using ((select private.can_manage_entity(entity_id)));

create policy connector_files_select on public.connector_files
  for select to authenticated
  using ((select private.can_manage_entity(entity_id)));

-- No INSERT/UPDATE/DELETE policies: writes happen only inside SECURITY DEFINER
-- RPCs (which re-check permission) or via service_role (which bypasses RLS).


-- ============================================================================
-- 6. Management RPCs (client-facing, SECURITY DEFINER, permission re-checked)
-- ============================================================================

-- create_connector — register a source. For 'webhook' it mints + returns the
-- HMAC secret ONCE (the only time it is ever readable). For 'gdrive' it lands in
-- 'pending_auth'; the OAuth start/callback edge functions complete it.
create or replace function public.create_connector(
  p_entity_id uuid,
  p_kind      public.connector_kind,
  p_name      text,
  p_config    jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_id     uuid;
  v_secret text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required' using errcode = '22023';
  end if;
  if not (select private.can_manage_entity(p_entity_id)) then
    raise exception 'not authorized to add a connector for entity %', p_entity_id
      using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_config, '{}'::jsonb)) <> 'object' then
    raise exception 'config must be a JSON object' using errcode = '22023';
  end if;

  if p_kind = 'webhook' then
    -- 256-bit hex secret. Returned now and never again (column is not selectable).
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.connectors (entity_id, owner_id, kind, name, status, config, webhook_secret)
    values (p_entity_id, v_uid, 'webhook', trim(p_name), 'active', coalesce(p_config, '{}'::jsonb), v_secret)
    returning id into v_id;
  else
    insert into public.connectors (entity_id, owner_id, kind, name, status, config)
    values (p_entity_id, v_uid, 'gdrive', trim(p_name), 'pending_auth', coalesce(p_config, '{}'::jsonb))
    returning id into v_id;
  end if;

  insert into public.pipeline_events (entity_id, stage, actor, detail)
  values (p_entity_id, 'connector_created', v_uid,
          jsonb_build_object('connector_id', v_id, 'kind', p_kind, 'name', trim(p_name)));

  return jsonb_build_object(
    'id', v_id,
    'kind', p_kind,
    'status', case when p_kind = 'webhook' then 'active' else 'pending_auth' end,
    'webhook_secret', v_secret  -- null for gdrive
  );
end;
$$;

-- rename_connector
create or replace function public.rename_connector(p_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required' using errcode = '22023';
  end if;
  select entity_id into v_entity from public.connectors where id = p_id;
  if not found then
    raise exception 'connector % not found', p_id using errcode = 'P0002';
  end if;
  if not (select private.can_manage_entity(v_entity)) then
    raise exception 'not your connector' using errcode = '42501';
  end if;
  update public.connectors set name = trim(p_name) where id = p_id;
end;
$$;

-- set_connector_status — pause / resume (only between active and paused).
create or replace function public.set_connector_status(p_id uuid, p_status public.connector_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity uuid;
begin
  if p_status not in ('active', 'paused') then
    raise exception 'status must be active or paused' using errcode = '22023';
  end if;
  select entity_id into v_entity from public.connectors where id = p_id;
  if not found then
    raise exception 'connector % not found', p_id using errcode = 'P0002';
  end if;
  if not (select private.can_manage_entity(v_entity)) then
    raise exception 'not your connector' using errcode = '42501';
  end if;
  update public.connectors set status = p_status where id = p_id;
  insert into public.pipeline_events (entity_id, stage, actor, detail)
  values (v_entity, 'connector_' || p_status, (select auth.uid()),
          jsonb_build_object('connector_id', p_id));
end;
$$;

-- rotate_webhook_secret — issue a fresh HMAC secret (webhook only), returned once.
create or replace function public.rotate_webhook_secret(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conn   public.connectors;
  v_secret text;
begin
  select * into v_conn from public.connectors where id = p_id;
  if not found then
    raise exception 'connector % not found', p_id using errcode = 'P0002';
  end if;
  if not (select private.can_manage_entity(v_conn.entity_id)) then
    raise exception 'not your connector' using errcode = '42501';
  end if;
  if v_conn.kind <> 'webhook' then
    raise exception 'only webhook connectors have a secret' using errcode = '22023';
  end if;
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  update public.connectors set webhook_secret = v_secret where id = p_id;
  return jsonb_build_object('id', p_id, 'webhook_secret', v_secret);
end;
$$;

-- delete_connector
create or replace function public.delete_connector(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity uuid;
begin
  select entity_id into v_entity from public.connectors where id = p_id;
  if not found then
    raise exception 'connector % not found', p_id using errcode = 'P0002';
  end if;
  if not (select private.can_manage_entity(v_entity)) then
    raise exception 'not your connector' using errcode = '42501';
  end if;
  delete from public.connectors where id = p_id;
  insert into public.pipeline_events (entity_id, stage, actor, detail)
  values (v_entity, 'connector_deleted', (select auth.uid()),
          jsonb_build_object('connector_id', p_id));
end;
$$;

revoke all on function public.create_connector(uuid, public.connector_kind, text, jsonb) from public, anon;
revoke all on function public.rename_connector(uuid, text)            from public, anon;
revoke all on function public.set_connector_status(uuid, public.connector_status) from public, anon;
revoke all on function public.rotate_webhook_secret(uuid)             from public, anon;
revoke all on function public.delete_connector(uuid)                  from public, anon;

grant execute on function public.create_connector(uuid, public.connector_kind, text, jsonb) to authenticated;
grant execute on function public.rename_connector(uuid, text)            to authenticated;
grant execute on function public.set_connector_status(uuid, public.connector_status) to authenticated;
grant execute on function public.rotate_webhook_secret(uuid)             to authenticated;
grant execute on function public.delete_connector(uuid)                  to authenticated;


-- ============================================================================
-- 7. Service-role ingestion + OAuth RPCs (edge functions only)
--
--    These run the REAL pipeline in SQL (X-ray visible) and are granted ONLY to
--    service_role — the edge functions (Drive sync / webhook receiver / OAuth
--    callback) call them. They are never client-callable.
-- ============================================================================

-- ingest_connector_rows — the connector equivalent of process_uploaded_rows.
-- Idempotent per (connector, external_id): a repeat delivery returns the prior
-- batch instead of staging twice. Stages the typed rows, then runs the same
-- transform_batch + detect_anomalies the manual path uses, so the batch reaches
-- 'awaiting_review' with anomalies flagged.
create or replace function public.ingest_connector_rows(
  p_connector_id uuid,
  p_external_id  text,
  p_file_name    text,
  p_file_hash    text,
  p_period       date,
  p_rows         jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conn      public.connectors;
  v_batch_id  uuid;
  v_existing  uuid;
  v_period    date;
  v_transform jsonb;
  v_detect    jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;
  select * into v_conn from public.connectors where id = p_connector_id;
  if not found then
    raise exception 'connector % not found', p_connector_id using errcode = 'P0002';
  end if;

  v_period := date_trunc('month', coalesce(p_period, now())::timestamp)::date;

  -- Idempotent claim: if this file was already ingested, return its batch.
  select batch_id into v_existing
  from public.connector_files
  where connector_id = p_connector_id and external_id = p_external_id;
  if found then
    return jsonb_build_object('status', 'duplicate', 'batch_id', v_existing);
  end if;

  insert into public.ingest_batches
    (entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
  values (
    v_conn.entity_id, v_conn.owner_id, v_conn.kind::text::public.ingest_source,
    coalesce(p_file_name, 'connector-import.csv'),
    'connector/' || p_connector_id::text || '/' || p_external_id,
    coalesce(nullif(p_file_hash, ''), 'conn-' || md5(p_external_id || v_period::text)),
    v_period, 'queued'
  )
  returning id into v_batch_id;

  insert into public.connector_files (connector_id, entity_id, external_id, file_name, batch_id)
  values (p_connector_id, v_conn.entity_id, p_external_id, p_file_name, v_batch_id);

  insert into public.pipeline_events (entity_id, batch_id, stage, detail)
  values (v_conn.entity_id, v_batch_id, 'connector_file_received',
          jsonb_build_object('connector_id', p_connector_id, 'kind', v_conn.kind, 'external_id', p_external_id));

  -- Stage the typed rows (same shape process_uploaded_rows expects).
  insert into public.journal_staging
    (batch_id, entity_id, row_num, account_code, txn_date, description, debit, credit, currency, raw)
  select
    v_batch_id, v_conn.entity_id, t.ord::int,
    nullif(t.r ->> 'account_code', ''),
    case when coalesce(t.r ->> 'txn_date', '') = '' then null else (t.r ->> 'txn_date')::date end,
    nullif(t.r ->> 'description', ''),
    case when coalesce(t.r ->> 'debit', '')  = '' then null else (t.r ->> 'debit')::numeric  end,
    case when coalesce(t.r ->> 'credit', '') = '' then null else (t.r ->> 'credit')::numeric end,
    nullif(t.r ->> 'currency', ''),
    coalesce(t.r -> 'raw', '{}'::jsonb)
  from jsonb_array_elements(p_rows) with ordinality as t(r, ord);

  -- The real pipeline (same functions the worker / manual upload call).
  v_transform := private.transform_batch(v_batch_id);
  v_detect    := private.detect_anomalies(v_batch_id);

  update public.ingest_queue set status = 'done'
  where batch_id = v_batch_id and status <> 'done';

  update public.connectors set last_sync_at = now(), last_error = null
  where id = p_connector_id;

  return jsonb_build_object('status', 'created', 'batch_id', v_batch_id)
         || coalesce(v_transform, '{}'::jsonb) || coalesce(v_detect, '{}'::jsonb);
end;
$$;

-- store_connector_oauth — the OAuth callback persists the offline credentials +
-- the initial Drive page token, and flips the connector to active.
create or replace function public.store_connector_oauth(
  p_connector_id  uuid,
  p_refresh_token text,
  p_access_token  text,
  p_expiry        timestamptz,
  p_cursor        text,
  p_config        jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.connectors
    set oauth_refresh_token = coalesce(p_refresh_token, oauth_refresh_token),
        oauth_access_token  = p_access_token,
        oauth_expiry        = p_expiry,
        cursor              = coalesce(p_cursor, cursor),
        config              = coalesce(p_config, config),
        status              = 'active',
        last_error          = null
  where id = p_connector_id and kind = 'gdrive';
  if not found then
    raise exception 'gdrive connector % not found', p_connector_id using errcode = 'P0002';
  end if;
  insert into public.pipeline_events (entity_id, stage, detail)
  select entity_id, 'connector_authorized',
         jsonb_build_object('connector_id', p_connector_id, 'kind', 'gdrive')
  from public.connectors where id = p_connector_id;
end;
$$;

-- mark_connector_error — record a sync failure for surfacing in the UI/X-ray.
create or replace function public.mark_connector_error(p_connector_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.connectors set last_error = left(p_error, 500), status = 'error'
  where id = p_connector_id;
end;
$$;

revoke all on function public.ingest_connector_rows(uuid, text, text, text, date, jsonb) from public, anon, authenticated;
revoke all on function public.store_connector_oauth(uuid, text, text, timestamptz, text, jsonb) from public, anon, authenticated;
revoke all on function public.mark_connector_error(uuid, text) from public, anon, authenticated;

grant execute on function public.ingest_connector_rows(uuid, text, text, text, date, jsonb) to service_role;
grant execute on function public.store_connector_oauth(uuid, text, text, timestamptz, text, jsonb) to service_role;
grant execute on function public.mark_connector_error(uuid, text) to service_role;

comment on table public.connectors is
  'External data sources (Google Drive OAuth / HMAC webhook) that auto-feed the ETL queue. Secrets (webhook_secret, oauth tokens) are column-revoked from the API; service_role reads them in edge functions.';
