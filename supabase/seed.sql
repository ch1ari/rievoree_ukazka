-- ============================================================================
-- seed.sql — LOCAL demo data (run by `supabase db reset` / `supabase start`)
--
-- ⚠️  LOCAL ONLY. This file is wired via config.toml [db.seed] and runs only on a
--     local `db reset`/`start`. `supabase db push` ships ONLY migrations/, never
--     this file — so these demo users (shared password) never reach remote.
--     Do NOT run this against a production database.
--
-- Demo login (password is the same for everyone): ......  demo123456
--
--   email                | role        | sees entities
--   ---------------------+-------------+--------------------------------------
--   super@demo.local     | super_admin | all 4 (and may assign membership)
--   admin@demo.local     | admin       | all 4
--   manager@demo.local   | manager     | Northwind + Acme (2, via membership)
--   viewer@demo.local    | viewer      | Northwind (1, via membership)
--
-- Entities: Northwind Trading, Acme Industries, Globex Foods, Initech Software.
-- 18 months of deterministic history (≈11k journal_entries, no random()), plus
-- one live batch on Northwind left at 'awaiting_review' with a real Utilities
-- spike flagged by detect_anomalies — the X-ray "anomaly blocks import" scene.
-- ============================================================================

-- Fixed UUIDs so the data is stable across resets (and referenceable below).
--   users    d0000000-…-000000000001..4
--   entities e0000000-…-000000000001..4
--   live batch f0000000-…-000000000001

-- ----------------------------------------------------------------------------
-- 1. Demo auth users (+ identities). The on_auth_user_created trigger creates
--    the matching public.profiles rows (all as 'viewer'); roles are promoted
--    below. Token columns set to '' to avoid GoTrue's NULL-scan login error.
-- ----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  is_sso_user, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, crypt('demo123456', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name),
  now(), now(), '', '', '', '', false, false
from (values
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'super@demo.local',   'Sasha Super'),
  ('d0000000-0000-4000-8000-000000000002'::uuid, 'admin@demo.local',   'Adam Admin'),
  ('d0000000-0000-4000-8000-000000000003'::uuid, 'manager@demo.local', 'Mira Manager'),
  ('d0000000-0000-4000-8000-000000000004'::uuid, 'viewer@demo.local',  'Vera Viewer')
) as u(id, email, full_name);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.email like '%@demo.local';

-- Promote roles. role/is_active are FROZEN columns — the trigger needs the
-- transaction-local opt-in flag (same gate the admin RPC will use later).
begin;
  set local app.allow_privileged_profile_change = 'on';
  update public.profiles set role = 'super_admin' where id = 'd0000000-0000-4000-8000-000000000001';
  update public.profiles set role = 'admin'       where id = 'd0000000-0000-4000-8000-000000000002';
  update public.profiles set role = 'manager'     where id = 'd0000000-0000-4000-8000-000000000003';
  -- viewer keeps the default 'viewer' role.
commit;

-- ----------------------------------------------------------------------------
-- 2. Entities + memberships (admin/super_admin need no rows — they see all).
-- ----------------------------------------------------------------------------
insert into public.entities (id, name, slug, base_currency) values
  ('e0000000-0000-4000-8000-000000000001', 'Northwind Trading',  'northwind', 'EUR'),
  ('e0000000-0000-4000-8000-000000000002', 'Acme Industries',    'acme',      'EUR'),
  ('e0000000-0000-4000-8000-000000000003', 'Globex Foods',       'globex',    'EUR'),
  ('e0000000-0000-4000-8000-000000000004', 'Initech Software',   'initech',   'EUR');

insert into public.entity_members (entity_id, user_id, granted_by) values
  -- viewer → Northwind only
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001'),
  -- manager → Northwind + Acme
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001');

-- ----------------------------------------------------------------------------
-- 3. Chart of accounts — the same 13-account chart for every entity.
-- ----------------------------------------------------------------------------
insert into public.accounts (entity_id, code, name, type)
select e.id, c.code, c.name, c.type::public.account_type
from public.entities e
cross join (values
  ('1000', 'Cash',                 'asset'),
  ('1100', 'Accounts Receivable',  'asset'),
  ('1200', 'Inventory',            'asset'),
  ('2000', 'Accounts Payable',     'liability'),
  ('2100', 'Accrued Liabilities',  'liability'),
  ('3000', 'Owner Equity',         'equity'),
  ('4000', 'Product Sales',        'revenue'),
  ('4100', 'Service Revenue',      'revenue'),
  ('5000', 'Cost of Goods Sold',   'expense'),
  ('6000', 'Salaries',             'expense'),
  ('6100', 'Rent',                 'expense'),
  ('6200', 'Utilities',            'expense'),
  ('6300', 'Marketing',            'expense')
) as c(code, name, type);

-- ----------------------------------------------------------------------------
-- 4. A per-entity ruleset override for Globex (tighter z-threshold + CZK),
--    to demonstrate that transform_batch prefers an entity override over the
--    global default seeded in migration 6.
-- ----------------------------------------------------------------------------
insert into public.validation_rulesets (entity_id, version, rules)
values (
  'e0000000-0000-4000-8000-000000000003', 1,
  jsonb_build_object(
    'required_columns',   jsonb_build_array('account_code', 'txn_date'),
    'header_aliases', jsonb_build_object(
      'account_code', jsonb_build_array('account', 'acct', 'account code'),
      'txn_date',     jsonb_build_array('date', 'posting date'),
      'debit',        jsonb_build_array('dr', 'debit'),
      'credit',       jsonb_build_array('cr', 'credit'),
      'currency',     jsonb_build_array('ccy', 'currency'),
      'description',  jsonb_build_array('memo', 'narrative')
    ),
    'date_formats',       jsonb_build_array('YYYY-MM-DD', 'DD.MM.YYYY'),
    'allowed_currencies', jsonb_build_array('EUR', 'CZK'),
    'amount_mode',        'split',
    'zscore', jsonb_build_object('threshold', 2.5, 'min_history_periods', 3, 'trailing_months', 12)
  )
);

-- ----------------------------------------------------------------------------
-- 5. History — one 'loaded' provenance batch per entity, then 18 months of
--    deterministic journal_entries (2024-11 … 2026-04).
--
--    Determinism: amount = base/lines × (1 ± jitter), where jitter is derived
--    from hashtext(entity||code||month||line) — stable across resets, no
--    random(). Side follows account type (asset/expense = debit, else credit).
--    Variance is small and centered, so each account's monthly net is a tight
--    baseline — which makes the seeded Utilities spike a clear z-score outlier.
-- ----------------------------------------------------------------------------
insert into public.ingest_batches
  (entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
select e.id, 'd0000000-0000-4000-8000-000000000003', 'manual', 'seed-history.csv',
       'ingest/' || e.id::text || '/seed-history.csv',
       'seedhistory-' || e.slug, '2026-04-01', 'loaded'
from public.entities e;

with base(code, b) as (values
  ('1000', 5000), ('1100', 6000), ('1200', 4000), ('2000', 3500), ('2100', 1500),
  ('3000', 2000), ('4000', 20000), ('4100', 8000), ('5000', 9000), ('6000', 12000),
  ('6100', 3000), ('6200', 1000), ('6300', 2500)
)
insert into public.journal_entries
  (entity_id, account_id, batch_id, txn_date, description, debit, credit, currency)
select
  a.entity_id,
  a.id,
  hb.id,
  make_date(extract(year from dd.d0)::int, extract(month from dd.d0)::int, 2 + (l.ln % 26)),
  a.name || ' ' || to_char(dd.d0, 'YYYY-MM'),
  case when a.type in ('asset', 'expense') then ac.amt else 0 end,
  case when a.type in ('asset', 'expense') then 0 else ac.amt end,
  'EUR'
from public.accounts a
join base bm on bm.code = a.code
join public.ingest_batches hb
  on hb.entity_id = a.entity_id and hb.file_name = 'seed-history.csv'
cross join generate_series(0, 17) as m(idx)
cross join generate_series(1, 12) as l(ln)
cross join lateral (
  select (date '2024-11-01' + (m.idx || ' months')::interval)::date as d0
) dd
cross join lateral (
  select round(
    (bm.b / 12.0) *
    (1 + ((hashtext(a.entity_id::text || a.code || m.idx::text || l.ln::text) % 1000)::numeric / 1000) * 0.12),
    2) as amt
) ac;

-- ----------------------------------------------------------------------------
-- 6. Live batch on Northwind (period 2026-05) — staged rows including a 5×
--    Utilities spike. We populate journal_staging directly (simulating the
--    worker's parse output), then call the REAL transform + detect functions
--    so the anomaly flag is authentic. load_batch is NOT called: the batch
--    stops at 'awaiting_review' for the manager-approval scene.
-- ----------------------------------------------------------------------------
insert into public.ingest_batches
  (id, entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
values (
  'f0000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000003', 'manual', 'may-2026.csv',
  'ingest/e0000000-0000-4000-8000-000000000001/may-2026.csv',
  repeat('a', 64), '2026-05-01', 'queued'
);

insert into public.journal_staging
  (batch_id, entity_id, row_num, account_code, txn_date, description, debit, credit, currency, raw)
values
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 1, '6200', '2026-05-12', 'Electricity spike', 5000, 0, 'EUR', '{"account_code":"6200","debit":"5000","memo":"Electricity spike"}'::jsonb),
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 2, '6000', '2026-05-25', 'May salaries',      12000, 0, 'EUR', '{"account_code":"6000","debit":"12000","memo":"May salaries"}'::jsonb),
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 3, '6100', '2026-05-01', 'May rent',           3000, 0, 'EUR', '{"account_code":"6100","debit":"3000","memo":"May rent"}'::jsonb),
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 4, '4000', '2026-05-20', 'May product sales',  0, 20000, 'EUR', '{"account_code":"4000","credit":"20000","memo":"May product sales"}'::jsonb),
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 5, '4100', '2026-05-28', 'May services',       0, 8000,  'EUR', '{"account_code":"4100","credit":"8000","memo":"May services"}'::jsonb);

select private.transform_batch('f0000000-0000-4000-8000-000000000001');
select private.detect_anomalies('f0000000-0000-4000-8000-000000000001');

-- ----------------------------------------------------------------------------
-- 7. Populate the report aggregate now that the history is loaded. The MV is
--    created (empty) by migration 11 BEFORE this seed runs; pg_cron keeps it
--    fresh thereafter, but the first reset needs an explicit refresh so the
--    Reports page has data immediately.
-- ----------------------------------------------------------------------------
refresh materialized view private.mv_account_monthly;

-- ----------------------------------------------------------------------------
-- 8. notify-review endpoint config (LOCAL ONLY) — the local half of the
--    local≠remote Vault guard for migration 17's pg_net trigger.
--
--    These are the standard, PUBLIC, fixed local demo values:
--      * URL  : the internal Kong gateway hostname, reachable from the db
--               container (verified: db resolves `kong`), routing to the bundled
--               edge runtime that serves supabase/functions/.
--      * key  : the well-known local demo service_role JWT (iss=supabase-demo,
--               signed with the default local JWT secret). This is NOT a real
--               secret and NOT the remote key — it is identical on every local
--               Supabase install, hence safe to commit here. The REAL remote
--               service_role key is set on remote via vault.create_secret and is
--               NEVER committed (migration 17 header).
--
--    Placed at the END of seed (after transform/detect above): on `db reset`
--    those calls run BEFORE these secrets exist, so the notify_review trigger
--    fail-soft skips during seeding — db reset performs no network I/O and the
--    net queue / pipeline_events stay clean. The secrets are then available for
--    the app and for manual round-trip testing.
--
--    Idempotent: create only if absent, so a re-seed without a reset won't error.
-- ----------------------------------------------------------------------------
select vault.create_secret(
  'http://kong:8000/functions/v1/notify-review',
  'edge_notify_review_url',
  'LOCAL notify-review endpoint (internal Kong gateway)'
)
where not exists (select 1 from vault.secrets where name = 'edge_notify_review_url');

select vault.create_secret(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  'edge_service_role_key',
  'LOCAL demo service_role JWT (public, fixed, NOT the remote key)'
)
where not exists (select 1 from vault.secrets where name = 'edge_service_role_key');
