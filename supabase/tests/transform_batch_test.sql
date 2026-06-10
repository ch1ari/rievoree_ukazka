-- pgTAP: private.transform_batch — account resolution, validation_errors,
-- ruleset stamping, status transition, idempotency. Self-contained fixture
-- (does not depend on seed.sql); the whole file runs in a rolled-back txn.
begin;
create extension if not exists pgtap;
select plan(11);

-- --- fixture --------------------------------------------------------------
-- A throwaway auth user (the trigger creates its profile) to satisfy the
-- ingest_batches.uploaded_by FK.
insert into auth.users (id, email)
values ('11111111-aaaa-4aaa-8aaa-000000000001', 'tap-xform@test.local');

insert into public.entities (id, name, slug)
values ('22222222-aaaa-4aaa-8aaa-000000000001', 'TAP Xform', 'tap-xform');

insert into public.accounts (entity_id, code, name, type)
values ('22222222-aaaa-4aaa-8aaa-000000000001', '1000', 'Cash', 'asset');

-- Uses the global default ruleset seeded in migration 6 (EUR/USD/GBP, split).
insert into public.ingest_batches
  (id, entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
values
  ('33333333-aaaa-4aaa-8aaa-000000000001', '22222222-aaaa-4aaa-8aaa-000000000001',
   '11111111-aaaa-4aaa-8aaa-000000000001', 'manual', 't.csv',
   'ingest/22222222-aaaa-4aaa-8aaa-000000000001/t.csv', repeat('b', 64), '2026-03-01', 'queued');

-- One valid row + one per validation_error kind.
insert into public.journal_staging
  (batch_id, entity_id, row_num, account_code, txn_date, description, debit, credit, currency, raw)
values
  -- 1: fully valid
  ('33333333-aaaa-4aaa-8aaa-000000000001', '22222222-aaaa-4aaa-8aaa-000000000001', 1, '1000', '2026-03-10', 'ok',      100, 0, 'EUR', '{}'),
  -- 2: unknown account code
  ('33333333-aaaa-4aaa-8aaa-000000000001', '22222222-aaaa-4aaa-8aaa-000000000001', 2, '9999', '2026-03-10', 'unknown',  50, 0, 'EUR', '{}'),
  -- 3: missing account code
  ('33333333-aaaa-4aaa-8aaa-000000000001', '22222222-aaaa-4aaa-8aaa-000000000001', 3, null,   '2026-03-10', 'missing',  10, 0, 'EUR', '{}'),
  -- 4: txn_date outside the batch period
  ('33333333-aaaa-4aaa-8aaa-000000000001', '22222222-aaaa-4aaa-8aaa-000000000001', 4, '1000', '2026-02-10', 'outside',  10, 0, 'EUR', '{}'),
  -- 5: disallowed currency
  ('33333333-aaaa-4aaa-8aaa-000000000001', '22222222-aaaa-4aaa-8aaa-000000000001', 5, '1000', '2026-03-10', 'ccy',      10, 0, 'JPY', '{}'),
  -- 6: amount rule (both sides non-zero)
  ('33333333-aaaa-4aaa-8aaa-000000000001', '22222222-aaaa-4aaa-8aaa-000000000001', 6, '1000', '2026-03-10', 'amount',   10, 5, 'EUR', '{}');

-- --- run ------------------------------------------------------------------
select private.transform_batch('33333333-aaaa-4aaa-8aaa-000000000001');

-- --- assertions -----------------------------------------------------------
select is(
  (select validation_errors from public.journal_staging where batch_id = '33333333-aaaa-4aaa-8aaa-000000000001' and row_num = 1),
  null, 'row 1 (valid) has no validation_errors');

select isnt(
  (select account_id from public.journal_staging where batch_id = '33333333-aaaa-4aaa-8aaa-000000000001' and row_num = 1),
  null, 'row 1 account_code resolved to account_id');

select ok(
  (select validation_errors @> '[{"field":"account_code","error":"unknown account code"}]'::jsonb
   from public.journal_staging where batch_id = '33333333-aaaa-4aaa-8aaa-000000000001' and row_num = 2),
  'row 2 flagged: unknown account code');

select ok(
  (select validation_errors @> '[{"field":"account_code","error":"missing"}]'::jsonb
   from public.journal_staging where batch_id = '33333333-aaaa-4aaa-8aaa-000000000001' and row_num = 3),
  'row 3 flagged: missing account code');

select ok(
  (select validation_errors @> '[{"field":"txn_date","error":"outside batch period"}]'::jsonb
   from public.journal_staging where batch_id = '33333333-aaaa-4aaa-8aaa-000000000001' and row_num = 4),
  'row 4 flagged: txn_date outside batch period');

select ok(
  (select validation_errors @> '[{"field":"currency","error":"not allowed"}]'::jsonb
   from public.journal_staging where batch_id = '33333333-aaaa-4aaa-8aaa-000000000001' and row_num = 5),
  'row 5 flagged: disallowed currency');

select ok(
  (select validation_errors @> '[{"field":"amount"}]'::jsonb
   from public.journal_staging where batch_id = '33333333-aaaa-4aaa-8aaa-000000000001' and row_num = 6),
  'row 6 flagged: amount rule');

select is(
  (select status::text from public.ingest_batches where id = '33333333-aaaa-4aaa-8aaa-000000000001'),
  'awaiting_review', 'batch moved to awaiting_review');

select isnt(
  (select ruleset_id from public.ingest_batches where id = '33333333-aaaa-4aaa-8aaa-000000000001'),
  null, 'batch stamped with the ruleset it was validated against');

-- idempotency: a second run reproduces the same result, no duplication.
select private.transform_batch('33333333-aaaa-4aaa-8aaa-000000000001');

select is(
  (select count(*) from public.journal_staging where batch_id = '33333333-aaaa-4aaa-8aaa-000000000001'),
  6::bigint, 're-run does not duplicate staging rows');

select is(
  (select validation_errors from public.journal_staging where batch_id = '33333333-aaaa-4aaa-8aaa-000000000001' and row_num = 1),
  null, 're-run keeps row 1 valid (idempotent)');

select * from finish();
rollback;
