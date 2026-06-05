-- ============================================================================
-- Migration 5 — profiles grant cleanup (finish the least-privilege sweep)
--
-- Migration 1 revoked UPDATE on profiles and re-granted it column-level
-- (full_name only), but left the default INSERT/DELETE grants in place,
-- relying on RLS alone (profiles has no INSERT/DELETE policies). Consistent
-- with migration 4: API roles must not hold privileges they can never
-- legitimately use — profile rows are created by the auth signup trigger
-- and removed via the auth.users cascade, never by clients.
--
-- NOTE: the column-level UPDATE (full_name) grant from migration 1 stays
-- untouched — users still edit their own display name through the API.
-- ============================================================================

revoke insert, delete on public.profiles from anon, authenticated;
