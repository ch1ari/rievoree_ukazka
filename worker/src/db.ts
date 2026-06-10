import postgres from "postgres";
import { parseRuleset } from "./rules.ts";
import { detectKind, parseFile } from "./parse.ts";
import { downloadObject } from "./storage.ts";

// postgres@3 uses `export =`, so the row-client type is reached via the value.
type Sql = ReturnType<typeof postgres>;

export interface QueueJob {
  id: string; // bigint → string in postgres.js
  batch_id: string;
  job_type: string;
  attempts: number;
  max_attempts: number;
}

interface BatchRow {
  id: string;
  entity_id: string;
  storage_path: string;
  period: string;
}

// Stable, container-recognisable worker identity for the X-ray "who holds this
// job" view. Priority: explicit WORKER_ID (pin a human name across recreates) →
// HOSTNAME (Docker sets it to the container id; stable across in-place restarts)
// + pid (distinguishes the process instance, so a stale lock from a dead process
// is visibly different from the live one).
export function makeWorkerId(): string {
  const explicit = Deno.env.get("WORKER_ID");
  if (explicit && explicit.trim()) return explicit.trim();
  let host = Deno.env.get("HOSTNAME") ?? "";
  if (!host) {
    try {
      host = Deno.hostname();
    } catch {
      host = "worker";
    }
  }
  return `${host}#${Deno.pid}`;
}

// Atomic claim: take the oldest ready job OR reclaim one whose worker died
// mid-flight (status 'processing' past the lease). FOR UPDATE SKIP LOCKED
// guarantees two workers never grab the same row; the lease folds crash-recovery
// into the claim so no separate reaper is needed. attempts++ is committed here
// (its own short txn) so a poison job eventually exhausts max_attempts.
export async function claimJob(
  sql: Sql,
  workerId: string,
  leaseMinutes = 5,
): Promise<QueueJob | null> {
  const rows = await sql<QueueJob[]>`
    update public.ingest_queue q
       set status = 'processing',
           attempts = attempts + 1,
           locked_by = ${workerId},
           locked_at = now()
     where q.id = (
       select id from public.ingest_queue
        where (status = 'pending'    and run_after <= now())
           or (status = 'processing' and locked_at < now() - make_interval(mins => ${leaseMinutes}))
        order by run_after, id
        for update skip locked
        limit 1
     )
    returning q.id, q.batch_id, q.job_type, q.attempts, q.max_attempts
  `;
  return rows[0] ?? null;
}

// Effective ruleset for the entity: an active per-entity override wins over the
// active global default. Mirrors transform_batch's own selection so the worker
// reads headers/dates with the SAME rules the DB validates against.
async function loadActiveRules(sql: Sql, entityId: string) {
  const rows = await sql<{ rules: unknown }[]>`
    select rules
    from public.validation_rulesets
    where is_active and (entity_id = ${entityId} or entity_id is null)
    order by (entity_id is not null) desc
    limit 1
  `;
  if (!rows[0]) throw new Error(`no active ruleset for entity ${entityId}`);
  return parseRuleset(rows[0].rules);
}

// Process one process_batch job: fetch + parse the file OUTSIDE the DB, then do
// staging-insert + transform + detect in ONE transaction. A crash anywhere rolls
// the whole transaction back (clean staging); load_batch is intentionally NOT
// called — the batch ends at 'awaiting_review' for the manager-approval step.
export async function processJob(
  sql: Sql,
  job: QueueJob,
): Promise<{ rows: number }> {
  if (job.job_type !== "process_batch") {
    throw new Error(`unknown job_type '${job.job_type}'`);
  }

  const [batch] = await sql<BatchRow[]>`
    select id, entity_id, storage_path, period
    from public.ingest_batches where id = ${job.batch_id}
  `;
  if (!batch) throw new Error(`batch ${job.batch_id} not found`);

  await sql`
    update public.ingest_batches set status = 'validating', updated_at = now()
    where id = ${batch.id}
  `;

  const bytes = await downloadObject(batch.storage_path);
  const rules = await loadActiveRules(sql, batch.entity_id);
  const parsed = parseFile(bytes, detectKind(bytes), rules);

  await sql.begin(async (tx) => {
    // Idempotent re-run: clear any prior staging for this batch, then reinsert.
    await tx`delete from public.journal_staging where batch_id = ${batch.id}`;
    if (parsed.rows.length > 0) {
      const insertRows = parsed.rows.map((r) => ({
        batch_id: batch.id,
        entity_id: batch.entity_id,
        row_num: r.row_num,
        account_code: r.account_code,
        txn_date: r.txn_date,
        description: r.description,
        debit: r.debit,
        credit: r.credit,
        currency: r.currency,
        raw: r.raw,
      }));
      await tx`
        insert into public.journal_staging ${
        tx(
          insertRows,
          "batch_id",
          "entity_id",
          "row_num",
          "account_code",
          "txn_date",
          "description",
          "debit",
          "credit",
          "currency",
          "raw",
        )
      }`;
    }
    // DB owns transform + anomaly detection (set ops, history, X-ray-visible SQL).
    await tx`select private.transform_batch(${batch.id}::uuid)`;
    await tx`select private.detect_anomalies(${batch.id}::uuid)`;
  });

  return { rows: parsed.rows.length };
}

export async function completeJob(sql: Sql, job: QueueJob): Promise<void> {
  // Batch is already 'awaiting_review' (set by transform_batch); just close the job.
  await sql`update public.ingest_queue set status = 'done' where id = ${job.id}`;
}

// On failure the processing transaction has already rolled back (clean staging).
// Retry with exponential backoff until max_attempts, then mark the job and batch
// failed with the error recorded for the X-ray panel.
export async function failJob(
  sql: Sql,
  job: QueueJob,
  err: unknown,
): Promise<void> {
  const msg = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
  const willRetry = job.attempts < job.max_attempts;

  if (willRetry) {
    const backoffSec = Math.min(300, 2 ** job.attempts * 5); // 10s, 20s, 40s … capped 5m
    await sql`
      update public.ingest_queue
         set status = 'pending',
             run_after = now() + make_interval(secs => ${backoffSec}),
             last_error = ${msg}
       where id = ${job.id}
    `;
  } else {
    await sql`
      update public.ingest_queue
         set status = 'failed', last_error = ${msg}
       where id = ${job.id}
    `;
    await sql`
      update public.ingest_batches
         set status = 'failed', error_summary = ${msg}, updated_at = now()
       where id = ${job.batch_id}
    `;
  }
}
