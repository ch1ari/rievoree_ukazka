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
  ('d0000000-0000-4000-8000-000000000004'::uuid, 'viewer@demo.local',  'Vera Viewer'),
  -- The anonymous "Explore demo" identity: VIEWER role (server-side read-only —
  -- submit_batch/approve_batch reject non-managers), but member of all 4 entities
  -- so the demo shows rich data. Read-only is enforced by role, not by the UI.
  ('d0000000-0000-4000-8000-000000000005'::uuid, 'demo@demo.local',    'Dana Demo')
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
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001'),
  -- demo (read-only explorer) → all four entities, so anon sees rich data
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001');

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
-- 5. History — realistic, BALANCED double-entry: 18 months (2024-11 … 2026-04)
--    of revenue/cost activity per entity, posted as paired entries so the books
--    TIE (trial balance nets to zero → balance sheet + cash flow reconcile with
--    no plug). Entities differ by SCALE (factor), not noise; revenue carries a
--    +0.8%/mo trend, ±15% seasonality (Q4 high) and ±4% noise; costs are sized
--    for a ~15% operating margin. Deterministic (hashtext, no random()).
--    Also seeds budgets + AR/AP invoices (schemas from migrations 21/22) and
--    flags every demo entity as the shared sample sandbox.
-- ----------------------------------------------------------------------------

-- All four demo entities ARE the shared read-only sample sandbox (new registrants
-- get membership to is_sample entities via the migration-20 trigger).
update public.entities set is_sample = true;

-- One 'loaded' provenance batch per entity (the history batch_id).
insert into public.ingest_batches
  (entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
select e.id, 'd0000000-0000-4000-8000-000000000003', 'manual', 'seed-history.csv',
       'ingest/' || e.id::text || '/seed-history.csv',
       'seedhistory-' || e.slug, '2026-04-01', 'loaded'
from public.entities e;

-- Per-(entity, month) financial model: actual revenue/costs, the no-noise plan
-- (for budgets), opening capital/inventory, and prior-month figures (cash
-- collections/payments lag one month → realistic A/R and A/P balances).
create table seed_calc as
with ent(id, slug, f) as (
  select id, slug, (case slug when 'acme' then 1.6 when 'globex' then 1.0
                              when 'initech' then 0.7 else 0.45 end)::numeric
  from public.entities
),
raw as (
  select e.id as entity_id, e.f, g.m,
    (date '2024-11-01' + (g.m || ' months')::interval)::date as period,
    (100000 * e.f)::numeric as base,
    (1 + (((abs(hashtext(e.id::text||'rev'||g.m::text)) % 1000)::numeric/1000) - 0.5)*0.08) as rev_noise,
    (1 + (((abs(hashtext(e.id::text||'sal'||g.m::text)) % 1000)::numeric/1000) - 0.5)*0.04) as sal_noise,
    (1 + (((abs(hashtext(e.id::text||'utl'||g.m::text)) % 1000)::numeric/1000) - 0.5)*0.10) as utl_noise
  from ent e cross join generate_series(0,17) as g(m)
),
plan as (
  -- power()/sin() return double precision; round(numeric,int) needs a numeric cast.
  select *, round((base * power(1.008, m) * (1 + 0.15*sin(2*pi()*m/12.0)))::numeric, 2) as plan_rev
  from raw
),
calc as ( select *, round(plan_rev * rev_noise, 2) as rev from plan ),
calc2 as (
  select entity_id, m, period, base, plan_rev, rev,
    round(rev*0.70,2) as prod, round(rev*0.30,2) as svc, round(rev*0.38,2) as cogs,
    round(base*0.32*sal_noise,2) as sal, round(base*0.07,2) as rent,
    round(base*0.03*utl_noise,2) as util, round(rev*0.075,2) as mktg,
    round(plan_rev*0.70,2) as plan_prod, round(plan_rev*0.30,2) as plan_svc,
    round(plan_rev*0.38,2) as plan_cogs, round(base*0.32,2) as plan_sal,
    round(base*0.07,2) as plan_rent, round(base*0.03,2) as plan_util,
    round(plan_rev*0.075,2) as plan_mktg, round(base*0.60,2) as cap, round(base*0.30,2) as inv
  from calc
)
select *,
  (prod+svc) as billed,
  (cogs+sal+rent+util+mktg) as etot,
  coalesce(lag(prod+svc) over w, 0) as billed_prev,
  coalesce(lag(cogs+sal+rent+util+mktg) over w, 0) as etot_prev
from calc2
window w as (partition by entity_id order by m);

-- Balanced entries (each pair debit=credit). All-zero rows (m=0 lagged
-- collections/payments) are filtered to satisfy the debit-XOR-credit check.
insert into public.journal_entries
  (entity_id, account_id, batch_id, txn_date, description, debit, credit, currency)
select t.entity_id, a.id, hb.id,
  (t.period + ((1 + (abs(hashtext(t.code||t.descr||t.entity_id::text||t.period::text)) % 26)) || ' days')::interval)::date,
  t.descr || ' ' || to_char(t.period, 'YYYY-MM'),
  t.debit, t.credit, 'EUR'
from (
  select entity_id, period, '1100' as code, billed as debit, 0::numeric as credit, 'A/R — revenue billed' as descr from seed_calc
  union all select entity_id, period, '4000', 0, prod, 'Product sales' from seed_calc
  union all select entity_id, period, '4100', 0, svc,  'Service revenue' from seed_calc
  union all select entity_id, period, '5000', cogs, 0, 'Cost of goods sold' from seed_calc
  union all select entity_id, period, '6000', sal,  0, 'Salaries' from seed_calc
  union all select entity_id, period, '6100', rent, 0, 'Rent' from seed_calc
  union all select entity_id, period, '6200', util, 0, 'Utilities' from seed_calc
  union all select entity_id, period, '6300', mktg, 0, 'Marketing' from seed_calc
  union all select entity_id, period, '2000', 0, etot, 'A/P — costs accrued' from seed_calc
  union all select entity_id, period, '1000', billed_prev, 0, 'Cash — collections' from seed_calc
  union all select entity_id, period, '1100', 0, billed_prev, 'A/R — collected' from seed_calc
  union all select entity_id, period, '2000', etot_prev, 0, 'A/P — paid' from seed_calc
  union all select entity_id, period, '1000', 0, etot_prev, 'Cash — payments' from seed_calc
  union all select entity_id, period, '3000', 0, cap, 'Owner capital' from seed_calc where m = 0
  union all select entity_id, period, '1000', cap, 0, 'Cash — capital in' from seed_calc where m = 0
  union all select entity_id, period, '1200', inv, 0, 'Inventory — opening' from seed_calc where m = 0
  union all select entity_id, period, '1000', 0, inv, 'Cash — inventory buy' from seed_calc where m = 0
) t
join public.accounts a on a.entity_id = t.entity_id and a.code = t.code
join public.ingest_batches hb on hb.entity_id = t.entity_id and hb.file_name = 'seed-history.csv'
where t.debit <> 0 or t.credit <> 0;

-- Budget (demo): the no-noise plan, shifted per line so some lines beat and some
-- miss vs actual (meaningful favourable/unfavourable variance).
insert into public.budgets (entity_id, period, account_code, amount)
select entity_id, period, code, amt from (
  select entity_id, period, '4000' as code, round(plan_prod*0.97,2) as amt from seed_calc
  union all select entity_id, period, '4100', round(plan_svc *1.02,2) from seed_calc
  union all select entity_id, period, '5000', round(plan_cogs*1.04,2) from seed_calc
  union all select entity_id, period, '6000', round(plan_sal *1.00,2) from seed_calc
  union all select entity_id, period, '6100', round(plan_rent*1.00,2) from seed_calc
  union all select entity_id, period, '6200', round(plan_util*0.90,2) from seed_calc
  union all select entity_id, period, '6300', round(plan_mktg*1.05,2) from seed_calc
) b
on conflict (entity_id, period, account_code) do nothing;

-- Open AR/AP invoices (demo) — due dates across all aging buckets, scaled by entity.
insert into public.invoices (entity_id, kind, counterparty, issued_date, due_date, amount)
select e.id, k.kind,
  (case k.kind when 'ar' then 'Customer ' else 'Vendor ' end) || upper(left(e.slug,3)) || '-' || g.i,
  (date '2026-05-31' - (a.age + 30)), (date '2026-05-31' - a.age),
  round((100000 * (case e.slug when 'acme' then 1.6 when 'globex' then 1.0 when 'initech' then 0.7 else 0.45 end))
        * (0.03 + g.i*0.015)
        * (1 + (((abs(hashtext(e.slug||k.kind||g.i::text)) % 1000)::numeric/1000) - 0.5)*0.2), 2)
from public.entities e
cross join (values ('ar'),('ap')) as k(kind)
cross join generate_series(1,6) as g(i)
cross join lateral (select (array[8,26,44,67,88,119])[g.i] as age) a;

drop table seed_calc;

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
