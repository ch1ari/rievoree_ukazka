-- ============================================================================
-- Migration 33 — Review actions: reject a batch + re-check after fixes
--
-- Two client-facing SECURITY DEFINER RPCs used from the batch review screen:
--   * reject_batch(id)  — mark an awaiting_review/failed batch as rejected (its
--                         hash frees up, so the same file can be re-sent later).
--   * recheck_batch(id) — re-run the REAL transform + z-score on the existing
--                         staging rows (no re-stage). Used after the reviewer
--                         adds the missing accounts to the chart during approval,
--                         so account_code resolves and the errors clear.
--
-- Permission mirrors approve_batch: manager/admin of the entity (private.
-- can_manage_entity). Never touches a 'loaded' batch.
-- ============================================================================

create or replace function public.reject_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.ingest_batches;
begin
  select * into v_batch from public.ingest_batches where id = p_batch_id for update;
  if not found then
    raise exception 'batch % not found', p_batch_id using errcode = 'P0002';
  end if;
  if not (select private.can_manage_entity(v_batch.entity_id)) then
    raise exception 'not authorized to reject batches for entity %', v_batch.entity_id
      using errcode = '42501';
  end if;
  if v_batch.status = 'loaded' then
    raise exception 'batch % is already loaded and cannot be rejected', p_batch_id
      using errcode = '22023';
  end if;

  update public.ingest_batches
    set status = 'rejected', updated_at = now()
  where id = p_batch_id;

  insert into public.pipeline_events (entity_id, batch_id, stage, actor, detail)
  values (v_batch.entity_id, p_batch_id, 'rejected', (select auth.uid()), '{}'::jsonb);

  return jsonb_build_object('status', 'rejected', 'batch_id', p_batch_id);
end;
$$;

create or replace function public.recheck_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch     public.ingest_batches;
  v_transform jsonb;
  v_detect    jsonb;
begin
  select * into v_batch from public.ingest_batches where id = p_batch_id for update;
  if not found then
    raise exception 'batch % not found', p_batch_id using errcode = 'P0002';
  end if;
  if not (select private.can_manage_entity(v_batch.entity_id)) then
    raise exception 'not authorized to process batches for entity %', v_batch.entity_id
      using errcode = '42501';
  end if;
  if v_batch.status = 'loaded' then
    raise exception 'batch % is already loaded', p_batch_id using errcode = '22023';
  end if;

  -- Re-resolve account_id against the (now updated) chart + re-score anomalies.
  v_transform := private.transform_batch(p_batch_id);
  v_detect    := private.detect_anomalies(p_batch_id);

  return coalesce(v_transform, '{}'::jsonb) || coalesce(v_detect, '{}'::jsonb);
end;
$$;

revoke all on function public.reject_batch(uuid)  from public, anon;
revoke all on function public.recheck_batch(uuid) from public, anon;
grant execute on function public.reject_batch(uuid)  to authenticated;
grant execute on function public.recheck_batch(uuid) to authenticated;
