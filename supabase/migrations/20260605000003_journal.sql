-- ============================================================================
-- Migration 3 — Journal (staging + production)
--
-- Creates:
--   * review_status enum
--   * journal_staging — transformed rows awaiting validation review/approval;
--     carries z-score anomaly flags and the original raw row for audit
--   * journal_entries — the production journal; only ever written by the ETL
--     (service role) and later by the staging→production trigger chain
--
-- Access model:
--   * journal_staging  read: managers of the entity + admin+ (viewers never
--                      see the machinery); ALL writes via ETL / review RPC
--   * journal_entries  read: every member of the entity incl. viewers
--                      (this IS the report data) + admin+; NO client writes
--
-- This pair is the X-ray showcase for roles: the same SELECT on
-- journal_entries returns different rows for viewer vs manager vs admin
-- purely through RLS.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Enum
-- ----------------------------------------------------------------------------
create type public.review_status as enum
  ('pending', 'flagged', 'approved', 'rejected');


-- ----------------------------------------------------------------------------
-- 2. journal_staging
--
--    Lenient by design: rows land here straight from the transform step, so
--    amount/date columns are nullable and problems are recorded in
--    validation_errors instead of being rejected by constraints. The strict
--    rules live on journal_entries — bad rows simply never get promoted.
-- ----------------------------------------------------------------------------
create table public.journal_staging (
  id                bigint generated always as identity primary key,
  batch_id          uuid not null references public.ingest_batches (id) on delete cascade,
  entity_id         uuid not null references public.entities (id) on delete cascade,
  row_num           integer not null,
  account_code      text,
  -- Resolved during validation; NULL = code did not match the chart of accounts.
  account_id        uuid references public.accounts (id),
  txn_date          date,
  description       text,
  debit             numeric(14, 2),
  credit            numeric(14, 2),
  currency          char(3),
  -- Original row exactly as read from the file (audit + reprocessing).
  raw               jsonb not null,
  -- NULL = row passed validation; otherwise array of {field, error} objects.
  validation_errors jsonb,
  -- Z-score vs historical (entity, account, month) mean/stddev; filled by the
  -- anomaly detection step. is_anomaly=true forces review_status='flagged'.
  z_score           numeric,
  is_anomaly        boolean not null default false,
  anomaly_reason    text,
  review_status     public.review_status not null default 'pending',
  reviewed_by       uuid references public.profiles (id),
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),

  -- Transform idempotency: re-running a batch can delete-and-reinsert, but
  -- can never silently duplicate a row of the same file.
  unique (batch_id, row_num)
);

-- RLS filter + "staging rows of entity X" queries.
create index journal_staging_entity_idx
  on public.journal_staging (entity_id);

-- Review screen: "rows of this batch still needing attention".
create index journal_staging_review_idx
  on public.journal_staging (batch_id, review_status);


-- ----------------------------------------------------------------------------
-- 3. journal_entries (production)
-- ----------------------------------------------------------------------------
create table public.journal_entries (
  id         bigint generated always as identity primary key,
  entity_id  uuid not null references public.entities (id) on delete cascade,
  account_id uuid not null references public.accounts (id),
  -- Provenance: every production row traces back to the batch that loaded it.
  -- Cascade matches delete-and-reload semantics (drop batch = drop its rows).
  batch_id   uuid not null references public.ingest_batches (id) on delete cascade,
  txn_date   date not null,
  -- Reporting/reload granularity; generated so it can never drift from txn_date.
  -- Explicit ::timestamp picks the IMMUTABLE date_trunc overload — the bare
  -- date arg would resolve to the timestamptz one, which is only STABLE
  -- (TimeZone-dependent) and thus rejected in a generated column.
  period     date not null generated always as (date_trunc('month', txn_date::timestamp)::date) stored,
  description text,
  debit      numeric(14, 2) not null default 0,
  credit     numeric(14, 2) not null default 0,
  currency   char(3) not null,
  created_at timestamptz not null default now(),

  -- Accounting shape: amounts non-negative, exactly one side non-zero.
  constraint journal_entries_amounts_valid
    check (debit >= 0 and credit >= 0 and ((debit = 0) <> (credit = 0)))
);

-- P&L / report aggregation per month (also the delete-and-reload target).
create index journal_entries_entity_period_idx
  on public.journal_entries (entity_id, period);

-- Account drill-down and z-score history scans.
create index journal_entries_account_idx
  on public.journal_entries (entity_id, account_id, txn_date);


-- ----------------------------------------------------------------------------
-- 4. Grants — no client writes anywhere in the journal
--    (ETL/worker = service role; review/approval = SECURITY DEFINER RPCs)
-- ----------------------------------------------------------------------------
revoke insert, update, delete on public.journal_staging from authenticated, anon;
revoke insert, update, delete on public.journal_entries from authenticated, anon;


-- ----------------------------------------------------------------------------
-- 5. RLS — read-only policies; absence of write policies is intentional
-- ----------------------------------------------------------------------------
alter table public.journal_staging enable row level security;
alter table public.journal_entries enable row level security;

-- Staging is ingest machinery: managers of the entity + admin+.
create policy journal_staging_select on public.journal_staging
  for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.user_role()) = 'manager'
      and entity_id in (select private.my_entity_ids())
    )
  );

-- Production journal is the report source: ALL entity members read it,
-- viewers included. Same query, different rows per role — X-ray demo.
create policy journal_entries_select on public.journal_entries
  for select to authenticated
  using (
    (select private.is_admin())
    or entity_id in (select private.my_entity_ids())
  );
