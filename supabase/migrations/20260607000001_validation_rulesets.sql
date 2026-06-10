-- ============================================================================
-- Migration 6 — Validation Rulesets (per-entity ETL rules as versioned data)
--
-- Creates:
--   * validation_rulesets — declarative ETL rules, scoped per entity, with an
--     append-only version history; one active version per scope
--   * ingest_batches.ruleset_id — stamps each batch with the EXACT ruleset row
--     it was validated against (filled by the transform step, not at upload)
--   * one seeded global default ruleset so the pipeline works out of the box
--
-- Why rules live here (and not in code or a config file):
--   PLAN §5 wants per-"client" rules that are configurable WITHOUT a redeploy,
--   so they must be DATA, not git. Storing the ruleset id on the batch makes
--   delete-and-reload deterministic — a re-run validates against the very
--   version that was in effect, never a newer one. And the X-ray panel can
--   show the concrete ruleset row + version that gated a batch.
--
-- The INTERPRETER of `rules` (what the JSON means) is TypeScript in the worker
-- plus a Zod schema; this table only stores and versions the data.
--
-- Access model:
--   * read: admin+ see all; managers see the global default + rulesets of
--     their assigned entities. Viewers never touch the ingest machinery.
--   * writes: none from API roles. Versioning (insert new version, flip
--     is_active) goes through a SECURITY DEFINER RPC in a later migration;
--     the seed/ETL use the service role.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. validation_rulesets
--
--    entity_id NULL  = the global default ruleset (fallback for any entity
--                      without its own). entity_id set = a tenant override.
--    Append-only: a rule change is a NEW row with a higher version; the old
--    row stays for audit and for reproducing past batches. Deactivation flips
--    is_active rather than deleting, so history is never lost.
-- ----------------------------------------------------------------------------
create table public.validation_rulesets (
  id         uuid primary key default gen_random_uuid(),
  -- NULL = global default; FK cascade drops a tenant's rulesets with the tenant.
  entity_id  uuid references public.entities (id) on delete cascade,
  version    integer not null,
  -- Declarative rules; shape is validated by the worker's Zod schema, not here.
  -- Documented in the seeded default below.
  rules      jsonb not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) default auth.uid(),

  -- A ruleset blob is always a JSON object (cheap guard; deep shape = Zod).
  constraint validation_rulesets_rules_is_object
    check (jsonb_typeof(rules) = 'object'),
  -- Versions are positive and monotonic per scope.
  constraint validation_rulesets_version_positive
    check (version > 0)
);

comment on table public.validation_rulesets is
  'Per-entity ETL validation rules as versioned data. entity_id NULL = global default. Append-only history.';
comment on column public.validation_rulesets.entity_id is
  'NULL = global default ruleset; otherwise a per-tenant override.';
comment on column public.validation_rulesets.rules is
  'Declarative rules (required_columns, header_aliases, date_formats, allowed_currencies, amount_mode, zscore). Interpreted by the worker.';


-- ----------------------------------------------------------------------------
-- 2. Uniqueness — version history + single active per scope
--
--    NULL entity_id needs explicit handling: in a plain UNIQUE, NULLs are
--    distinct, so two global rows of the same version would both be allowed.
--    Hence separate partial indexes for the global vs per-entity scopes.
-- ----------------------------------------------------------------------------

-- One row per (entity, version) for tenant rulesets...
create unique index validation_rulesets_entity_version_idx
  on public.validation_rulesets (entity_id, version)
  where entity_id is not null;

-- ...and one row per version among global rulesets.
create unique index validation_rulesets_global_version_idx
  on public.validation_rulesets (version)
  where entity_id is null;

-- At most ONE active ruleset per tenant...
create unique index validation_rulesets_one_active_per_entity_idx
  on public.validation_rulesets (entity_id)
  where is_active and entity_id is not null;

-- ...and at most ONE active global default (constant key → only one row fits).
create unique index validation_rulesets_one_active_global_idx
  on public.validation_rulesets ((true))
  where is_active and entity_id is null;


-- ----------------------------------------------------------------------------
-- 3. Stamp the batch with the ruleset it was validated against
--
--    Nullable: a batch is created at upload (ingest-submit), before validation.
--    The transform step fills this in when it resolves which ruleset applied.
--    No ON DELETE clause = NO ACTION (the actual FK default — NOT restrict):
--    you still cannot delete a ruleset a batch points at, the delete fails and
--    the audit trail stays intact. NO ACTION vs RESTRICT differ only in check
--    timing (NO ACTION is deferrable); for this intent they are equivalent.
-- ----------------------------------------------------------------------------
alter table public.ingest_batches
  add column ruleset_id uuid references public.validation_rulesets (id);

comment on column public.ingest_batches.ruleset_id is
  'The exact validation_rulesets row this batch was validated against. Filled by the transform step; makes delete-and-reload deterministic.';


-- ----------------------------------------------------------------------------
-- 4. Grants — no client writes; versioning happens via RPC / service role
-- ----------------------------------------------------------------------------
revoke insert, update, delete on public.validation_rulesets from authenticated, anon;


-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------
alter table public.validation_rulesets enable row level security;

-- Read: admin+ see everything; managers see the global default plus the
-- rulesets of entities they are assigned to. (No USING (true) — the global
-- default is matched explicitly via entity_id is null.)
create policy validation_rulesets_select on public.validation_rulesets
  for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.user_role()) = 'manager'
      and (
        entity_id is null
        or entity_id in (select private.my_entity_ids())
      )
    )
  );

-- No write policies: inserts/updates go through the service role (seed/ETL)
-- and a future SECURITY DEFINER versioning RPC.


-- ----------------------------------------------------------------------------
-- 6. Seed the global default ruleset (v1)
--
--    Structural, not demo data: every install needs at least one ruleset for
--    the pipeline to run. Demo tenants and their per-entity overrides live in
--    the separate seed script. Inserted with the service role's privileges
--    during migration; created_by stays NULL (no auth.uid() in a migration).
--
--    Rule keys (interpreted by the worker):
--      required_columns   columns that must be resolvable after header mapping
--      header_aliases     polymorphic reader: accepted header spellings → field
--      date_formats       accepted txn_date formats, tried in order
--      allowed_currencies whitelist; anything else → validation_error
--      amount_mode        "split" = separate debit/credit; "signed" = one col
--      zscore.threshold   |z| above this flags the row as an anomaly
--      zscore.min_history_periods  fewer prior periods than this → no flag
--      zscore.trailing_months      trailing baseline window (excludes the
--                                  tested period, so an anomaly never dilutes
--                                  its own mean/stddev)
-- ----------------------------------------------------------------------------
insert into public.validation_rulesets (entity_id, version, rules)
values (
  null,
  1,
  jsonb_build_object(
    'required_columns', jsonb_build_array('account_code', 'txn_date'),
    'header_aliases', jsonb_build_object(
      'account_code', jsonb_build_array('account', 'acct', 'account code', 'kód účtu'),
      'txn_date',     jsonb_build_array('date', 'posting date', 'dátum'),
      'debit',        jsonb_build_array('dr', 'debit'),
      'credit',       jsonb_build_array('cr', 'credit'),
      'amount',       jsonb_build_array('amount', 'value', 'suma'),
      'description',  jsonb_build_array('memo', 'narrative', 'popis'),
      'currency',     jsonb_build_array('ccy', 'currency', 'mena')
    ),
    'date_formats',       jsonb_build_array('YYYY-MM-DD', 'DD.MM.YYYY', 'MM/DD/YYYY'),
    'allowed_currencies', jsonb_build_array('EUR', 'USD', 'GBP'),
    'amount_mode',        'split',
    'zscore', jsonb_build_object(
      'threshold',           3.0,
      'min_history_periods', 3,
      'trailing_months',     12
    )
  )
);
