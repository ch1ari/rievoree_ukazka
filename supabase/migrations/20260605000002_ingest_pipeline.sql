-- ============================================================================
-- Migration 2 — Ingest Pipeline (accounts, batches, queue)
--
-- Creates:
--   * account_type / batch_status / queue_status / ingest_source enums
--   * accounts        — chart of accounts per entity
--   * ingest_batches  — one upload/import run, with idempotency via file_hash
--   * ingest_queue    — async job queue (FOR UPDATE SKIP LOCKED consumer)
--
-- Access model:
--   * accounts        read: entity members + admin+; writes: admin+ (ETL uses
--                     service role, which bypasses RLS)
--   * ingest_batches  read/insert: managers of the entity + admin+ (viewers
--                     never see the ingest machinery, only finished reports);
--                     status transitions only via RPC / worker
--   * ingest_queue    DENY ALL — RLS enabled with NO policies. Only the
--                     worker / service role (which bypasses RLS) touches it.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------
create type public.account_type as enum
  ('asset', 'liability', 'equity', 'revenue', 'expense');

create type public.ingest_source as enum
  ('manual', 'gdrive', 'webhook');

create type public.batch_status as enum
  ('received', 'queued', 'validating', 'transforming', 'awaiting_review',
   'approved', 'loading', 'loaded', 'rejected', 'failed');

create type public.queue_status as enum
  ('pending', 'processing', 'done', 'failed');


-- ----------------------------------------------------------------------------
-- 2. accounts — chart of accounts, scoped per entity
-- ----------------------------------------------------------------------------
create table public.accounts (
  id         uuid primary key default gen_random_uuid(),
  entity_id  uuid not null references public.entities (id) on delete cascade,
  code       text not null,
  name       text not null,
  type       public.account_type not null,
  created_at timestamptz not null default now(),

  -- Codes are unique within a tenant, not globally; also serves as the
  -- entity_id index that RLS filtering relies on.
  unique (entity_id, code)
);

comment on table public.accounts is
  'Chart of accounts per entity. Rows are mostly created by the ETL (service role).';


-- ----------------------------------------------------------------------------
-- 3. ingest_batches — one upload = one batch
-- ----------------------------------------------------------------------------
create table public.ingest_batches (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null references public.entities (id) on delete cascade,
  uploaded_by   uuid not null references public.profiles (id) default auth.uid(),
  source        public.ingest_source not null default 'manual',
  file_name     text not null,
  storage_path  text not null,
  file_hash     text not null,
  -- Reload granularity is (entity, month, source): period is always the
  -- first day of the month the batch covers.
  period        date not null,
  status        public.batch_status not null default 'received',
  stats         jsonb not null default '{}'::jsonb,
  error_summary text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint ingest_batches_period_is_month
    check (period = date_trunc('month', period)::date)
);

-- Idempotency: the same file cannot be imported twice for the same entity.
-- Scoped to entity_id (not global) so one tenant's upload can never collide
-- with — and thereby reveal the existence of — another tenant's file.
-- Partial: a batch that ended rejected/failed releases the hash, so the user
-- can fix the cause and retry the very same file.
create unique index ingest_batches_dedup_idx
  on public.ingest_batches (entity_id, file_hash)
  where status not in ('rejected', 'failed');

-- Listing screens: "batches of entity X, newest first" (also serves RLS).
create index ingest_batches_entity_idx
  on public.ingest_batches (entity_id, created_at desc);

create trigger ingest_batches_set_updated_at
  before update on public.ingest_batches
  for each row execute function private.set_updated_at();


-- ----------------------------------------------------------------------------
-- 4. ingest_queue — async job queue
--
--    Consumer pattern (Phase 3 worker):
--      select ... from ingest_queue
--      where status = 'pending' and run_after <= now()
--      order by run_after
--      limit 1
--      for update skip locked;
-- ----------------------------------------------------------------------------
create table public.ingest_queue (
  id           bigint generated always as identity primary key,
  batch_id     uuid not null references public.ingest_batches (id) on delete cascade,
  job_type     text not null,
  payload      jsonb not null default '{}'::jsonb,
  status       public.queue_status not null default 'pending',
  attempts     integer not null default 0,
  max_attempts integer not null default 5,
  run_after    timestamptz not null default now(),
  locked_by    text,
  locked_at    timestamptz,
  last_error   text,
  created_at   timestamptz not null default now()
);

-- Supports the SKIP LOCKED claim query above.
create index ingest_queue_claim_idx
  on public.ingest_queue (status, run_after);

-- FK lookups (cascade deletes, "jobs of this batch" in the X-ray panel).
create index ingest_queue_batch_idx
  on public.ingest_queue (batch_id);


-- ----------------------------------------------------------------------------
-- 5. Grants (privilege layer — first line of defense, RLS is the second)
-- ----------------------------------------------------------------------------

-- accounts: reads via RLS; client-side writes restricted to admin+ by policy,
-- so the grant stays. ETL writes use service role.

-- ingest_batches: clients may create (upload) and read; status transitions
-- belong to the worker / RPCs only.
revoke update, delete on public.ingest_batches from authenticated, anon;

-- ingest_queue: API roles get nothing at all.
revoke all on public.ingest_queue from authenticated, anon;


-- ----------------------------------------------------------------------------
-- 6. RLS
-- ----------------------------------------------------------------------------
alter table public.accounts       enable row level security;
alter table public.ingest_batches enable row level security;
alter table public.ingest_queue   enable row level security;

-- ingest_queue: RLS on, NO policies = deny all for API roles.
-- The worker connects with the service role, which bypasses RLS.
-- (Intentionally no policy here — do not "fix" this.)

-- accounts: entity members and admin+ can read.
create policy accounts_select on public.accounts
  for select to authenticated
  using (
    (select private.is_admin())
    or entity_id in (select private.my_entity_ids())
  );

-- accounts: only admin+ may manage the chart of accounts from the client.
create policy accounts_write on public.accounts
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ingest_batches: managers of the entity + admin+ see the machinery;
-- viewers do not (they only consume finished reports).
create policy ingest_batches_select on public.ingest_batches
  for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.user_role()) = 'manager'
      and entity_id in (select private.my_entity_ids())
    )
  );

-- Upload: manager for their assigned entity, or admin+; uploaded_by must be
-- the caller — nobody files a batch under someone else's name.
create policy ingest_batches_insert on public.ingest_batches
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      (select private.is_admin())
      or (
        (select private.user_role()) = 'manager'
        and entity_id in (select private.my_entity_ids())
      )
    )
  );

-- No UPDATE/DELETE policies on ingest_batches: status transitions happen via
-- RPC / worker (service role). Grants above already revoke these anyway.
