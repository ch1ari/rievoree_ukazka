-- pgTAP: private.load_batch — promotes only valid & non-anomaly rows,
-- idempotent delete-and-reload, supersedes a prior load of the same
-- (entity, period, source). Self-contained; rolled back.
begin;
create extension if not exists pgtap;
select plan(7);

-- --- fixture --------------------------------------------------------------
insert into auth.users (id, email)
values ('11111111-cccc-4ccc-8ccc-000000000001', 'tap-load@test.local');

insert into public.entities (id, name, slug)
values ('22222222-cccc-4ccc-8ccc-000000000001', 'TAP Load', 'tap-load');

insert into public.accounts (id, entity_id, code, name, type)
values ('aaaaaaaa-cccc-4ccc-8ccc-000000001000', '22222222-cccc-4ccc-8ccc-000000000001', '1000', 'Cash', 'asset');

-- Batch A: one promotable, one anomaly, one invalid row.
insert into public.ingest_batches
  (id, entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
values
  ('33333333-cccc-4ccc-8ccc-0000000000a1', '22222222-cccc-4ccc-8ccc-000000000001',
   '11111111-cccc-4ccc-8ccc-000000000001', 'manual', 'a.csv',
   'ingest/22222222-cccc-4ccc-8ccc-000000000001/a.csv', repeat('e', 64), '2026-06-01', 'queued');

insert into public.journal_staging
  (batch_id, entity_id, row_num, account_code, txn_date, description, debit, credit, currency, raw)
values
  ('33333333-cccc-4ccc-8ccc-0000000000a1', '22222222-cccc-4ccc-8ccc-000000000001', 1, '1000', '2026-06-10', 'promote', 100, 0, 'EUR', '{}'),
  ('33333333-cccc-4ccc-8ccc-0000000000a1', '22222222-cccc-4ccc-8ccc-000000000001', 2, '1000', '2026-06-11', 'anomaly', 200, 0, 'EUR', '{}'),
  ('33333333-cccc-4ccc-8ccc-0000000000a1', '22222222-cccc-4ccc-8ccc-000000000001', 3, '9999', '2026-06-12', 'invalid',  50, 0, 'EUR', '{}');

select private.transform_batch('33333333-cccc-4ccc-8ccc-0000000000a1');
-- Simulate the anomaly detector flagging row 2 (isolates load_batch's filter
-- from the z-score machinery, which has its own test).
update public.journal_staging set is_anomaly = true
  where batch_id = '33333333-cccc-4ccc-8ccc-0000000000a1' and row_num = 2;

select private.load_batch('33333333-cccc-4ccc-8ccc-0000000000a1');

-- --- assertions: only the valid, non-anomaly row promoted -----------------
select is(
  (select count(*) from public.journal_entries where batch_id = '33333333-cccc-4ccc-8ccc-0000000000a1'),
  1::bigint, 'exactly one row promoted (valid & non-anomaly)');

select is(
  (select debit from public.journal_entries where batch_id = '33333333-cccc-4ccc-8ccc-0000000000a1'),
  100::numeric, 'the promoted row is the valid one (debit 100)');

select is(
  (select status::text from public.ingest_batches where id = '33333333-cccc-4ccc-8ccc-0000000000a1'),
  'loaded', 'batch moved to loaded');

select is(
  (select (stats ->> 'rows_loaded')::int from public.ingest_batches where id = '33333333-cccc-4ccc-8ccc-0000000000a1'),
  1, 'stats.rows_loaded = 1');

-- --- idempotency: a second load does not duplicate ------------------------
select private.load_batch('33333333-cccc-4ccc-8ccc-0000000000a1');
select is(
  (select count(*) from public.journal_entries where batch_id = '33333333-cccc-4ccc-8ccc-0000000000a1'),
  1::bigint, 're-load is idempotent (still one row)');

-- --- supersede: a new batch for the same (entity, period, source) replaces -
insert into public.ingest_batches
  (id, entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
values
  ('33333333-cccc-4ccc-8ccc-0000000000b1', '22222222-cccc-4ccc-8ccc-000000000001',
   '11111111-cccc-4ccc-8ccc-000000000001', 'manual', 'b.csv',
   'ingest/22222222-cccc-4ccc-8ccc-000000000001/b.csv', repeat('f', 64), '2026-06-01', 'queued');

insert into public.journal_staging
  (batch_id, entity_id, row_num, account_code, txn_date, description, debit, credit, currency, raw)
values
  ('33333333-cccc-4ccc-8ccc-0000000000b1', '22222222-cccc-4ccc-8ccc-000000000001', 1, '1000', '2026-06-15', 'reload', 777, 0, 'EUR', '{}');

select private.transform_batch('33333333-cccc-4ccc-8ccc-0000000000b1');
select private.load_batch('33333333-cccc-4ccc-8ccc-0000000000b1');

select is(
  (select count(*) from public.journal_entries
   where entity_id = '22222222-cccc-4ccc-8ccc-000000000001' and period = '2026-06-01'),
  1::bigint, 'supersede: only the new batch''s rows remain for (entity, period)');

select is(
  (select batch_id from public.journal_entries
   where entity_id = '22222222-cccc-4ccc-8ccc-000000000001' and period = '2026-06-01'),
  '33333333-cccc-4ccc-8ccc-0000000000b1'::uuid, 'supersede: remaining row belongs to the new batch');

select * from finish();
rollback;
