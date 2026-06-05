-- ============================================================================
-- Migration 4 — Grant hardening (least privilege for API roles)
--
-- Why: Supabase's default privileges grant ALL on every new table in public
-- to anon/authenticated (the platform leans on RLS alone). Our model treats
-- grants as the FIRST defense layer and RLS as the second, so the API roles
-- must not keep privileges they can never legitimately use:
--
--   * TRUNCATE   — the dangerous one: RLS does NOT apply to TRUNCATE, so the
--                  privilege alone would empty a whole table. Not reachable
--                  through PostgREST today, but no client role should hold it.
--   * REFERENCES — clients never create FKs pointing at our tables (DDL).
--   * TRIGGER    — clients never create triggers on our tables (DDL).
--
-- Two parts: fix every EXISTING table, then change the DEFAULT privileges so
-- every FUTURE table created by migrations (role: postgres) is born correct.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Existing tables — strip the unused privileges in one sweep
-- ----------------------------------------------------------------------------
revoke truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2. Future tables — migrations run as postgres, so altering postgres's
--    default privileges covers everything created by `supabase db push`.
--    (service_role keeps full access — the worker and ETL need it.)
-- ----------------------------------------------------------------------------
alter default privileges in schema public
  revoke truncate, references, trigger
  on tables
  from anon, authenticated;
