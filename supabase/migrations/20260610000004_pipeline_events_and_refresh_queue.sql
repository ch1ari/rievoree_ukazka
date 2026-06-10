-- ============================================================================
-- Migration 13 — Observability + report-refresh infra (the trigger chain)
--
-- Makes the otherwise-invisible async machinery VISIBLE (the project's whole
-- point) and wires the real trigger chain:
--   journal_entries write → (trigger) enqueue (entity, period) for refresh
--                          + emit a pipeline_events row → X-ray panel (Realtime)
--   [pg_cron, migration 15] consumes the queue → REFRESH MV → emits mv_refreshed
--   [approve_batch, migration 14] emits approved
--
-- pipeline_events is a NEW RLS surface — locked down deliberately:
--   * reads: managers of the entity + admin (machinery, like journal_staging);
--     entity-scoped so a manager never sees another tenant's events.
--   * writes: NONE from API roles — no insert/update/delete policy exists, so a
--     client cannot forge an event onto the X-ray timeline. Only the
--     SECURITY DEFINER trigger / functions / cron (owner or service_role) write.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. pipeline_events — the visible backstage timeline.
-- ----------------------------------------------------------------------------
create table public.pipeline_events (
  id          bigint generated always as identity primary key,
  entity_id   uuid not null references public.entities (id) on delete cascade,
  batch_id    uuid references public.ingest_batches (id) on delete set null,
  stage       text not null,            -- approved | loaded | refresh_enqueued | mv_refreshed | review_notified | …
  detail      jsonb not null default '{}'::jsonb,
  duration_ms integer,
  actor       uuid references public.profiles (id),  -- auth.uid() when user-initiated
  created_at  timestamptz not null default now()
);

-- X-ray panel query: "recent events for this entity, newest first".
create index pipeline_events_entity_idx on public.pipeline_events (entity_id, created_at desc);

alter table public.pipeline_events enable row level security;

-- Read: admin+ see all; managers see their assigned entities. (Viewers do not
-- see the machinery — same stance as journal_staging.) Wrapped in (select …)
-- for the InitPlan optimization.
create policy pipeline_events_select on public.pipeline_events
  for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.user_role()) = 'manager'
      and entity_id in (select private.my_entity_ids())
    )
  );

-- No INSERT/UPDATE/DELETE policies → API roles cannot write (RLS deny-by-absence).
-- Belt-and-suspenders at the grant layer too (migration 12 already makes new
-- tables SELECT-only for authenticated / nothing for anon, but be explicit on a
-- table whose integrity feeds a security-facing X-ray view):
revoke insert, update, delete on public.pipeline_events from authenticated, anon;

-- Live updates for the X-ray panel.
alter publication supabase_realtime add table public.pipeline_events;

-- ----------------------------------------------------------------------------
-- 2. report_refresh_queue — coalesced "dirty (entity, period)" signal.
--    Deny-all for API roles (same stance as ingest_queue); only the trigger and
--    pg_cron (owner / service_role, which bypass RLS) touch it.
-- ----------------------------------------------------------------------------
create table public.report_refresh_queue (
  entity_id   uuid not null references public.entities (id) on delete cascade,
  period      date not null,
  enqueued_at timestamptz not null default now(),
  primary key (entity_id, period)  -- dedup: at most one pending refresh per slot
);

alter table public.report_refresh_queue enable row level security;
-- RLS on, no policies = deny all for API roles.
revoke all on public.report_refresh_queue from authenticated, anon;

-- ----------------------------------------------------------------------------
-- 3. The trigger chain — a journal_entries write cascades a refresh request.
--    Statement-level + transition table: fires once per load_batch insert/
--    delete statement (not per row). SECURITY DEFINER so it can write the queue
--    and events regardless of the firing context.
--
--    Postgres forbids transition tables on a multi-event trigger, so we use two
--    single-event triggers that BOTH alias their transition table to the same
--    name `changed` — the function reads only `changed` and works for either.
-- ----------------------------------------------------------------------------
create or replace function private.enqueue_report_refresh()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  with affected as (
    select distinct entity_id, period from changed
  ),
  enqueue as (
    insert into public.report_refresh_queue (entity_id, period)
    select entity_id, period from affected
    on conflict (entity_id, period) do nothing
  )
  insert into public.pipeline_events (entity_id, stage, detail)
  select entity_id, 'refresh_enqueued',
         jsonb_build_object('periods', array_agg(distinct period order by period))
  from affected
  group by entity_id;

  return null; -- AFTER STATEMENT trigger
end;
$$;

create trigger journal_entries_enqueue_refresh_ins
after insert on public.journal_entries
referencing new table as changed
for each statement execute function private.enqueue_report_refresh();

create trigger journal_entries_enqueue_refresh_del
after delete on public.journal_entries
referencing old table as changed
for each statement execute function private.enqueue_report_refresh();
