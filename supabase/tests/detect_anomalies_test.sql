-- pgTAP: private.detect_anomalies — z-score flagging + guard rails
-- (min_history_periods, stddev=0). Self-contained; rolled back.
begin;
create extension if not exists pgtap;
select plan(7);

-- --- fixture --------------------------------------------------------------
insert into auth.users (id, email)
values ('11111111-bbbb-4bbb-8bbb-000000000001', 'tap-detect@test.local');

insert into public.entities (id, name, slug)
values ('22222222-bbbb-4bbb-8bbb-000000000001', 'TAP Detect', 'tap-detect');

-- Three expense accounts: a varied-history one (should flag), a no-history one
-- (min_history guard), and a zero-variance one (stddev guard).
insert into public.accounts (id, entity_id, code, name, type) values
  ('aaaaaaaa-bbbb-4bbb-8bbb-000000006200', '22222222-bbbb-4bbb-8bbb-000000000001', '6200', 'Utilities', 'expense'),
  ('aaaaaaaa-bbbb-4bbb-8bbb-000000006100', '22222222-bbbb-4bbb-8bbb-000000000001', '6100', 'Rent',      'expense'),
  ('aaaaaaaa-bbbb-4bbb-8bbb-000000006300', '22222222-bbbb-4bbb-8bbb-000000000001', '6300', 'Marketing', 'expense');

-- History batch (loaded) to hang trailing journal_entries off.
insert into public.ingest_batches
  (id, entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
values
  ('33333333-bbbb-4bbb-8bbb-0000000000a1', '22222222-bbbb-4bbb-8bbb-000000000001',
   '11111111-bbbb-4bbb-8bbb-000000000001', 'manual', 'hist.csv',
   'ingest/22222222-bbbb-4bbb-8bbb-000000000001/hist.csv', repeat('c', 64), '2026-04-01', 'loaded');

-- Utilities: 4 prior months with variance → mean 100, stddev ≈ 9.13.
-- Rent: 4 prior months all identical → stddev = 0 (guard must skip).
insert into public.journal_entries (entity_id, account_id, batch_id, txn_date, description, debit, credit, currency) values
  ('22222222-bbbb-4bbb-8bbb-000000000001', 'aaaaaaaa-bbbb-4bbb-8bbb-000000006200', '33333333-bbbb-4bbb-8bbb-0000000000a1', '2026-01-15', 'u', 90,  0, 'EUR'),
  ('22222222-bbbb-4bbb-8bbb-000000000001', 'aaaaaaaa-bbbb-4bbb-8bbb-000000006200', '33333333-bbbb-4bbb-8bbb-0000000000a1', '2026-02-15', 'u', 110, 0, 'EUR'),
  ('22222222-bbbb-4bbb-8bbb-000000000001', 'aaaaaaaa-bbbb-4bbb-8bbb-000000006200', '33333333-bbbb-4bbb-8bbb-0000000000a1', '2026-03-15', 'u', 95,  0, 'EUR'),
  ('22222222-bbbb-4bbb-8bbb-000000000001', 'aaaaaaaa-bbbb-4bbb-8bbb-000000006200', '33333333-bbbb-4bbb-8bbb-0000000000a1', '2026-04-15', 'u', 105, 0, 'EUR'),
  ('22222222-bbbb-4bbb-8bbb-000000000001', 'aaaaaaaa-bbbb-4bbb-8bbb-000000006100', '33333333-bbbb-4bbb-8bbb-0000000000a1', '2026-01-15', 'r', 200, 0, 'EUR'),
  ('22222222-bbbb-4bbb-8bbb-000000000001', 'aaaaaaaa-bbbb-4bbb-8bbb-000000006100', '33333333-bbbb-4bbb-8bbb-0000000000a1', '2026-02-15', 'r', 200, 0, 'EUR'),
  ('22222222-bbbb-4bbb-8bbb-000000000001', 'aaaaaaaa-bbbb-4bbb-8bbb-000000006100', '33333333-bbbb-4bbb-8bbb-0000000000a1', '2026-03-15', 'r', 200, 0, 'EUR'),
  ('22222222-bbbb-4bbb-8bbb-000000000001', 'aaaaaaaa-bbbb-4bbb-8bbb-000000006100', '33333333-bbbb-4bbb-8bbb-0000000000a1', '2026-04-15', 'r', 200, 0, 'EUR');

-- Current batch (period 2026-05): a spike on each account.
insert into public.ingest_batches
  (id, entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
values
  ('33333333-bbbb-4bbb-8bbb-0000000000c1', '22222222-bbbb-4bbb-8bbb-000000000001',
   '11111111-bbbb-4bbb-8bbb-000000000001', 'manual', 'cur.csv',
   'ingest/22222222-bbbb-4bbb-8bbb-000000000001/cur.csv', repeat('d', 64), '2026-05-01', 'queued');

insert into public.journal_staging
  (batch_id, entity_id, row_num, account_code, txn_date, description, debit, credit, currency, raw)
values
  ('33333333-bbbb-4bbb-8bbb-0000000000c1', '22222222-bbbb-4bbb-8bbb-000000000001', 1, '6200', '2026-05-10', 'spike',     5000, 0, 'EUR', '{}'),
  ('33333333-bbbb-4bbb-8bbb-0000000000c1', '22222222-bbbb-4bbb-8bbb-000000000001', 2, '6100', '2026-05-10', 'flat-hist',  999, 0, 'EUR', '{}'),
  ('33333333-bbbb-4bbb-8bbb-0000000000c1', '22222222-bbbb-4bbb-8bbb-000000000001', 3, '6300', '2026-05-10', 'no-hist',   5000, 0, 'EUR', '{}');

-- detect_anomalies reads batch.ruleset_id (set by transform) and only scores
-- validation_errors-null rows, so transform must run first.
select private.transform_batch('33333333-bbbb-4bbb-8bbb-0000000000c1');
select private.detect_anomalies('33333333-bbbb-4bbb-8bbb-0000000000c1');

-- --- assertions -----------------------------------------------------------
select ok(
  (select is_anomaly from public.journal_staging where batch_id = '33333333-bbbb-4bbb-8bbb-0000000000c1' and row_num = 1),
  'Utilities spike is flagged as an anomaly');

select ok(
  (select z_score is not null and abs(z_score) > 3
   from public.journal_staging where batch_id = '33333333-bbbb-4bbb-8bbb-0000000000c1' and row_num = 1),
  'Utilities z-score is computed and exceeds threshold');

select is(
  (select is_anomaly from public.journal_staging where batch_id = '33333333-bbbb-4bbb-8bbb-0000000000c1' and row_num = 2),
  false, 'zero-variance history is NOT flagged (stddev guard)');

select is(
  (select z_score from public.journal_staging where batch_id = '33333333-bbbb-4bbb-8bbb-0000000000c1' and row_num = 2),
  null, 'zero-variance history leaves z_score null');

select is(
  (select is_anomaly from public.journal_staging where batch_id = '33333333-bbbb-4bbb-8bbb-0000000000c1' and row_num = 3),
  false, 'no-history account is NOT flagged (min_history guard)');

select is(
  (select z_score from public.journal_staging where batch_id = '33333333-bbbb-4bbb-8bbb-0000000000c1' and row_num = 3),
  null, 'no-history account leaves z_score null');

select is(
  (select (stats ->> 'flagged_accounts')::int from public.ingest_batches where id = '33333333-bbbb-4bbb-8bbb-0000000000c1'),
  1, 'exactly one account flagged');

select * from finish();
rollback;
