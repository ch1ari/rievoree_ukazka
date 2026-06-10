-- ============================================================================
-- Migration 14 — approve_batch RPC (manager/admin promotes a batch to production)
--
-- The third client-facing SECURITY DEFINER function, and the most consequential:
-- approval = promotion into the production journal. So it has the same hardened
-- shape as submit_batch:
--   * coalesce(...) fail-CLOSED permission gate (mirrors ingest_batches_insert),
--   * search_path = '' , everything schema-qualified,
--   * authenticated-EXECUTE — the predicate is the sole authorization barrier.
--
-- Concurrency (two managers click Approve at once): the batch row is taken
-- FOR UPDATE up front, so the status check and the load are atomic against a
-- concurrent approve. The second caller blocks on the row lock, then re-reads
-- status = 'loaded' and is rejected — load_batch never runs twice. (load_batch's
-- own advisory lock is a second layer for any other load path.)
--
-- AAL2/MFA enforcement on this action is deferred to the auth phase; this builds
-- the data-layer mechanism + trigger chain.
-- ============================================================================
create or replace function public.approve_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_batch  public.ingest_batches;
  v_result jsonb;
begin
  -- --- authentication ---
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- --- lock the batch row FIRST: serializes a concurrent approve here, before
  --     any load. The second caller waits, then sees the post-commit status.
  select * into v_batch from public.ingest_batches where id = p_batch_id for update;
  if not found then
    raise exception 'approve_batch: batch % not found', p_batch_id using errcode = 'P0002';
  end if;

  -- ===========================================================================
  -- PERMISSION GATE — the ONLY authorization barrier (RLS is bypassed in a
  -- SECURITY DEFINER function). Mirrors the ingest_batches_insert predicate:
  --   admin/super_admin may approve for ANY entity;
  --   a manager may approve ONLY for entities they are assigned to;
  --   everyone else (viewer, unassigned, deactivated) is rejected.
  -- coalesce(..., false) is load-bearing: private.user_role() is NULL for a
  -- deactivated/unknown user, so '= manager' is NULL and the whole OR is NULL;
  -- `if not (NULL)` would SKIP the raise (NULL is not true) and let them through.
  -- coalesce forces three-valued logic to two-valued — anything not provably
  -- true is denied. (Same fix as submit_batch.)
  -- ===========================================================================
  if not coalesce(
    (select private.is_admin())
    or (
      (select private.user_role()) = 'manager'
      and v_batch.entity_id in (select private.my_entity_ids())
    ),
    false
  ) then
    raise exception 'not authorized to approve batches for entity %', v_batch.entity_id
      using errcode = '42501'; -- insufficient_privilege
  end if;

  -- --- state gate: only an awaiting_review batch can be approved. Atomic with
  --     the load below because we hold FOR UPDATE on the row — a second approve
  --     reaches this line only after the first commits, by which point status
  --     is 'loaded' and this raises.
  if v_batch.status <> 'awaiting_review' then
    raise exception 'batch % is not awaiting_review (status=%)', p_batch_id, v_batch.status
      using errcode = '22023';
  end if;

  -- --- promote to production (advisory-locked delete-and-reload; → 'loaded') ---
  v_result := private.load_batch(p_batch_id);

  -- Stamp the rows load_batch actually promoted (valid & non-anomaly). Flagged
  -- or invalid rows keep their review_status for the record.
  update public.journal_staging
    set review_status = 'approved', reviewed_by = v_uid, reviewed_at = now()
  where batch_id = p_batch_id
    and validation_errors is null
    and is_anomaly = false;

  -- Visible on the X-ray timeline (Realtime).
  insert into public.pipeline_events (entity_id, batch_id, stage, actor, detail)
  values (v_batch.entity_id, p_batch_id, 'approved', v_uid, v_result);

  return jsonb_build_object('status', 'approved', 'batch_id', p_batch_id) || v_result;
end;
$$;

comment on function public.approve_batch(uuid) is
  'Manager/admin approval: re-checks permission (sole barrier), takes the batch row FOR UPDATE so a concurrent approve cannot double-load, promotes via load_batch, stamps approved rows, emits a pipeline_events row. Authenticated-callable.';

-- Grants — authenticated only (revoke the PUBLIC default; anon is already off
-- per migration 9's default-privilege hardening, verified separately).
revoke all on function public.approve_batch(uuid) from public;
grant execute on function public.approve_batch(uuid) to authenticated;
