-- ============================================================================
-- Migration 9 — Close the anon EXECUTE gap on submit_batch (targeted + systemic)
--
-- Root cause: Supabase ships a default-privilege entry
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role
-- (verified in pg_default_acl: {postgres=X, anon=X, authenticated=X,
-- service_role=X /postgres}). Our migrations run as `postgres` and create
-- functions owned by `postgres`, so every new public function silently inherits
-- an EXECUTE grant for `anon`. Migration 8's `revoke all ... from public` only
-- stripped the PUBLIC pseudo-role grant, leaving the role-specific `anon` grant
-- intact — so submit_batch was reachable anonymously via /rest/v1/rpc.
--
-- (The internal auth.uid() check already rejects anon callers with errcode
-- 28000, so it was not exploitable — but it violates the intended authorization
-- surface and trips the anon_security_definer_function_executable advisor.)
--
-- This migration fixes it on two levels:
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Targeted — fix the function that already exists.
--    ALTER DEFAULT PRIVILEGES below only affects FUTURE objects, so the
--    already-created submit_batch still needs its anon grant stripped directly.
-- ----------------------------------------------------------------------------
revoke execute on function public.submit_batch(uuid, text, text, text, date) from anon;


-- ----------------------------------------------------------------------------
-- 2. Systemic — stop auto-granting anon EXECUTE on every FUTURE function we
--    create in public. `for role postgres` exactly matches the existing
--    pg_default_acl entry (the one that applied to postgres-owned functions),
--    so this cancels just the anon column of that default — authenticated and
--    service_role defaults are left intact, and the separate supabase_admin
--    default (Supabase-managed internals) is untouched.
--
--    This project is fully behind auth; no public function legitimately needs
--    anon execute. If one ever does, grant it explicitly per-function — that is
--    visible and intentional, unlike a blanket default.
-- ----------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
