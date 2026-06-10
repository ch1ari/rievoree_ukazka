-- ============================================================================
-- Migration 12 — report view → security_invoker, + systemic grant hardening
--
-- Two things:
--   (a) Switch public.report_account_monthly to security_invoker so it stops
--       tripping the 0010_security_definer_view ERROR (which has no suppress
--       path — only this fix). The view runs as the CALLER; for that the caller
--       needs SELECT on the underlying MV, which lives in `private` and is NOT
--       reachable via the API (PostgREST/pg_graphql don't expose `private`), so
--       the grant is dormant — it only enables the view, never a direct path.
--       The WHERE predicate stays the tenant barrier and is re-verified.
--   (b) Close the recurring Supabase default-privilege trap SYSTEMICALLY (this
--       is the 3rd time: anon-functions in mig 9, now authenticated-tables).
--       This project routes ALL client writes through SECURITY DEFINER RPCs, so
--       `authenticated` never needs default table writes (reads stay, RLS gates
--       them) and `anon` needs nothing on app tables. Mirrors migration 9.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (a) Invoker view + dormant grant + targeted over-grant fix
-- ----------------------------------------------------------------------------
alter view public.report_account_monthly set (security_invoker = on);

-- The invoker view executes as the caller, so the caller needs SELECT on the
-- MV. `authenticated` already has USAGE on `private` (migration 1). Dormant:
-- `private` is not an exposed schema, so this is never an API-reachable path.
grant select on private.mv_account_monthly to authenticated;

-- The view inherited the full default grant (INSERT/UPDATE/DELETE/MAINTAIN) for
-- authenticated; a read window needs SELECT only. (Writes would fail anyway —
-- it's a view over a materialized view — but least privilege.)
revoke insert, update, delete, maintain on public.report_account_monthly from authenticated;

-- ----------------------------------------------------------------------------
-- (b) Systemic default-privilege hardening for FUTURE public objects.
--     Matches the pg_default_acl entry FOR ROLE postgres IN SCHEMA public on
--     tables (authenticated=arwdm, anon=arwdm). After this:
--       * future public tables → authenticated gets SELECT only (no writes);
--       * future public tables → anon gets nothing.
--     Any genuine exception is then an explicit, visible per-object grant.
-- ----------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke insert, update, delete, maintain on tables from authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon;
