-- ============================================================================
-- Migration 8 — Ingest submit (storage bucket + atomic submit_batch RPC)
--
-- Creates:
--   * the private `ingest` storage bucket (locked down: no object policies —
--     writes happen only through server-issued signed upload URLs, reads only
--     through the edge function's service-role client)
--   * public.submit_batch(...) — the atomic core of the upload finalize step:
--     in ONE transaction it re-checks permission, inserts the ingest_batches
--     row and the ingest_queue job, and reports duplicates.
--
-- IMPORTANT — submit_batch is authenticated-EXECUTABLE (the edge function calls
-- it with the caller's JWT). Because it is SECURITY DEFINER, RLS on the two
-- tables it writes is bypassed inside, so its internal permission predicate is
-- the ONLY authorization barrier — there is no service_role layer behind it.
-- The predicate therefore mirrors the ingest_batches_insert RLS policy exactly,
-- and uploaded_by is forced to auth.uid() (never a parameter).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The `ingest` storage bucket
--
--    Private, 10 MB cap. Deliberately NO storage.objects policies for this
--    bucket: clients never read/write it directly. Uploads go through a signed
--    upload URL (token-authorized, bypasses RLS); the edge function downloads
--    for hashing with the service role (bypasses RLS). Same "deny by absence"
--    stance as ingest_queue — do not "fix" this by adding a policy.
--    mime allow-list is intentionally left NULL: the edge function sniffs the
--    real content (magic bytes), which we trust over a client-set MIME type.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('ingest', 'ingest', false, 10485760)
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- 2. public.submit_batch — atomic batch + queue insert
--
--    Called by the ingest-submit edge function (finalize action) with the
--    caller's JWT, AFTER the function has verified the storage object, sniffed
--    its content, and computed the SHA-256 file_hash server-side.
--
--    Returns: {"status":"created","batch_id":...} on success,
--             {"status":"duplicate","batch_id":...} if the same file is already
--             imported for this entity (partial unique index on entity+hash).
-- ----------------------------------------------------------------------------
create or replace function public.submit_batch(
  p_entity_id    uuid,
  p_storage_path text,
  p_file_name    text,
  p_file_hash    text,
  p_period       date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_batch_id uuid;
  v_existing uuid;
begin
  -- --- authentication ---
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- --- input validation (cheap, before the privilege gate) ---
  if p_entity_id is null then
    raise exception 'entity_id is required' using errcode = '22023';
  end if;
  if coalesce(p_file_name, '') = '' then
    raise exception 'file_name is required' using errcode = '22023';
  end if;
  -- file_hash must be a SHA-256 hex digest (server-computed, never trusted raw).
  if p_file_hash is null or p_file_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'file_hash must be a sha-256 hex digest' using errcode = '22023';
  end if;
  -- The object must live under this entity's own prefix — a caller cannot
  -- register a path belonging to another tenant.
  if p_storage_path is null
     or p_storage_path not like ('ingest/' || p_entity_id::text || '/%') then
    raise exception 'storage_path must be under ingest/%/', p_entity_id
      using errcode = '22023';
  end if;
  if p_period is null then
    raise exception 'period is required' using errcode = '22023';
  end if;

  -- ===========================================================================
  -- PERMISSION GATE — the ONLY authorization barrier (RLS is bypassed inside a
  -- SECURITY DEFINER function). Mirrors the ingest_batches_insert RLS policy:
  --   admin/super_admin may upload for ANY entity;
  --   a manager may upload ONLY for entities they are assigned to;
  --   everyone else (viewer, unassigned, deactivated) is rejected.
  -- private.user_role() returns NULL for deactivated/unknown users. The
  -- coalesce(..., false) is load-bearing: for such a user '= manager' is NULL,
  -- so the whole OR is NULL, and `if not (NULL)` would SKIP the raise (NULL is
  -- not true) — letting a deactivated user through. coalesce forces three-
  -- valued logic to two-valued: anything not provably true is denied.
  -- ===========================================================================
  if not coalesce(
    (select private.is_admin())
    or (
      (select private.user_role()) = 'manager'
      and p_entity_id in (select private.my_entity_ids())
    ),
    false
  ) then
    raise exception 'not authorized to submit a batch for entity %', p_entity_id
      using errcode = '42501'; -- insufficient_privilege
  end if;

  -- --- atomic insert: batch + its queue job, one transaction ---
  begin
    insert into public.ingest_batches
      (entity_id, uploaded_by, source, file_name, storage_path, file_hash, period, status)
    values
      (p_entity_id,
       v_uid,                                  -- forced to the caller; never a param
       'manual',
       p_file_name,
       p_storage_path,
       p_file_hash,
       date_trunc('month', p_period::timestamp)::date,  -- normalize to month start
       'queued')
    returning id into v_batch_id;
  exception
    when unique_violation then
      -- A non-rejected/failed batch with the same (entity, file_hash) exists.
      -- The whole insert is rolled back to the subtransaction; report the
      -- existing batch so the edge function can answer 409.
      select id into v_existing
      from public.ingest_batches
      where entity_id = p_entity_id
        and file_hash = p_file_hash
        and status not in ('rejected', 'failed')
      limit 1;
      return jsonb_build_object('status', 'duplicate', 'batch_id', v_existing);
  end;

  insert into public.ingest_queue (batch_id, job_type, payload)
  values (v_batch_id, 'process_batch', '{}'::jsonb);

  return jsonb_build_object('status', 'created', 'batch_id', v_batch_id);
end;
$$;

comment on function public.submit_batch(uuid, text, text, text, date) is
  'Atomic finalize of an upload: re-checks permission (sole barrier), inserts ingest_batches + ingest_queue job, reports duplicates. Authenticated-callable via the ingest-submit edge function.';


-- ----------------------------------------------------------------------------
-- 3. Grants — authenticated only (the edge function calls it with the user JWT)
--    (functions default to EXECUTE for PUBLIC on creation; revoke that, and do
--    not grant anon.)
-- ----------------------------------------------------------------------------
revoke all on function public.submit_batch(uuid, text, text, text, date) from public;
grant execute on function public.submit_batch(uuid, text, text, text, date) to authenticated;
