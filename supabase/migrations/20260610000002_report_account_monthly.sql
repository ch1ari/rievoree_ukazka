-- ============================================================================
-- Migration 11 — Report aggregate: private MV + tenant-safe public view
--
-- mv_account_monthly is the per-(entity, period, account) roll-up that the
-- Reports/P&L page reads. It is a MATERIALIZED view for speed and (later)
-- pg_cron CONCURRENTLY refresh.
--
-- TENANCY — read this carefully, it is the whole security argument:
--   * RLS does NOT apply to materialized views. So the MV cannot protect
--     itself. We put it in the `private` schema, which PostgREST does not
--     expose and which gets no default SELECT grant — so no API role can read
--     it directly. (Belt-and-suspenders revoke below makes that explicit.)
--   * The ONLY public door is the view public.report_account_monthly. It is a
--     plain (owner-run) view — NOT security_invoker — on purpose: the owner can
--     read the private MV, the caller cannot. The view's WHERE clause is then
--     the SOLE tenant barrier, and it mirrors the journal_entries_select RLS
--     policy exactly. The barrier works because private.is_admin() /
--     my_entity_ids() read (select auth.uid()) from the request JWT regardless
--     of which role executes the view — so they resolve to the CALLER.
--   * Trade-off accepted: an owner-run view trips the `security_definer_view`
--     advisor (WARN). That is intentional and unavoidable here — a
--     security_invoker view would require granting the MV to `authenticated`,
--     which would let them read it unfiltered (a real cross-tenant leak).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The aggregate, in `private` (not API-reachable).
-- ----------------------------------------------------------------------------
create materialized view private.mv_account_monthly as
select
  je.entity_id,
  je.period,
  je.account_id,
  a.code           as account_code,
  a.name           as account_name,
  a.type           as account_type,
  sum(je.debit)    as debit,
  sum(je.credit)   as credit,
  sum(je.debit - je.credit) as net,
  count(*)         as entry_count
from public.journal_entries je
join public.accounts a on a.id = je.account_id
group by je.entity_id, je.period, je.account_id, a.code, a.name, a.type;

-- Unique key — required for REFRESH MATERIALIZED VIEW CONCURRENTLY (pg_cron,
-- next migration) and is the natural grain of the roll-up.
create unique index mv_account_monthly_pk
  on private.mv_account_monthly (entity_id, period, account_id);

-- Belt-and-suspenders: `private` already blocks API roles (not exposed, no
-- default grant), but say it out loud — direct MV access is never allowed.
revoke all on private.mv_account_monthly from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. The only public door — tenant barrier is this view's WHERE clause.
--    Plain owner-run view (security_invoker intentionally OFF) so it can read
--    the private MV while the caller cannot.
-- ----------------------------------------------------------------------------
create view public.report_account_monthly as
select m.entity_id, m.period, m.account_id,
       m.account_code, m.account_name, m.account_type,
       m.debit, m.credit, m.net, m.entry_count
from private.mv_account_monthly m
where (select private.is_admin())
   or m.entity_id in (select private.my_entity_ids());

comment on view public.report_account_monthly is
  'Tenant-filtered window onto private.mv_account_monthly. The WHERE clause is the sole cross-tenant barrier (mirrors journal_entries_select); the underlying MV is private and never granted to API roles.';

-- anon sees nothing anyway (auth.uid() null → predicate false), but be explicit.
revoke all on public.report_account_monthly from anon;
grant select on public.report_account_monthly to authenticated;
