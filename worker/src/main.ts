/**
 * ETL worker — the ingest_queue consumer (Phase 2/3).
 *
 * Loop: claim one job (FOR UPDATE SKIP LOCKED, with stale-lease reclaim), fetch
 * + parse + sanitize the file, then run staging-insert → transform_batch →
 * detect_anomalies in ONE transaction. load_batch is NOT run here — the batch
 * stops at 'awaiting_review' for the manager-approval step (auth phase).
 *
 * Resilient at startup: if the DB is not up yet it logs and retries instead of
 * crash-looping the container.
 */
import postgres from "postgres";
import {
  claimJob,
  completeJob,
  failJob,
  makeWorkerId,
  processJob,
} from "./db.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL") ??
  "postgresql://postgres:postgres@host.docker.internal:54322/postgres";
const POLL_MS = Number(Deno.env.get("WORKER_POLL_MS") ?? 2000);

const sql = postgres(DATABASE_URL, {
  max: 4,
  connect_timeout: 5,
  onnotice: () => {},
});
const workerId = makeWorkerId();

function log(level: "info" | "warn" | "error", msg: string, extra?: unknown) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component: "worker",
    workerId,
    msg,
    ...(extra ? { extra } : {}),
  }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

log("info", `worker starting, poll every ${POLL_MS}ms`);

while (true) {
  let job;
  try {
    job = await claimJob(sql, workerId);
  } catch (error) {
    log("warn", "claim failed (db not reachable yet?), will retry", {
      error: error instanceof Error ? error.message : String(error),
    });
    await sleep(POLL_MS);
    continue;
  }

  if (!job) {
    await sleep(POLL_MS); // idle: nothing ready
    continue;
  }

  log("info", "job claimed", {
    jobId: job.id,
    batchId: job.batch_id,
    attempt: job.attempts,
  });
  try {
    const result = await processJob(sql, job);
    await completeJob(sql, job);
    log("info", "job done → awaiting_review", {
      jobId: job.id,
      batchId: job.batch_id,
      stagedRows: result.rows,
    });
  } catch (error) {
    log("error", "job failed", {
      jobId: job.id,
      batchId: job.batch_id,
      attempt: job.attempts,
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      await failJob(sql, job, error);
    } catch (failErr) {
      log("error", "failJob errored", {
        jobId: job.id,
        error: failErr instanceof Error ? failErr.message : String(failErr),
      });
    }
  }
  // Loop straight back to drain the queue; only sleep when idle.
}
