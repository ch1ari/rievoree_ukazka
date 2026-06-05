/**
 * ETL / metrics worker — Phase 1 placeholder.
 *
 * What it does today: connects to Postgres, reports the ingest queue depth
 * on a heartbeat. What it becomes (Phase 3): the queue consumer — claim one
 * job via FOR UPDATE SKIP LOCKED + advisory lock, run the ETL step, repeat.
 *
 * Deliberately resilient at startup: if the database is not up yet
 * (`supabase start` still booting), it logs and retries instead of
 * crash-looping the container.
 */
import postgres from "postgres"

const DATABASE_URL = Deno.env.get("DATABASE_URL") ??
  "postgresql://postgres:postgres@host.docker.internal:54322/postgres"
const HEARTBEAT_MS = Number(Deno.env.get("HEARTBEAT_INTERVAL_MS") ?? 30_000)

const sql = postgres(DATABASE_URL, {
  max: 2,
  connect_timeout: 5,
  onnotice: () => {},
})

function log(level: "info" | "warn", msg: string, extra?: unknown) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component: "worker",
    msg,
    ...(extra ? { extra } : {}),
  }))
}

log("info", `worker starting, heartbeat every ${HEARTBEAT_MS}ms`)

while (true) {
  try {
    const [row] = await sql<{ pending: string }[]>`
      select count(*) as pending
      from public.ingest_queue
      where status = 'pending'
    `
    log("info", "heartbeat", { pendingJobs: Number(row.pending) })
    // TODO Phase 3: claim one job (FOR UPDATE SKIP LOCKED + advisory lock)
    // and run the ETL step instead of just counting.
  } catch (error) {
    log("warn", "db not reachable yet, will retry", {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  await new Promise((resolve) => setTimeout(resolve, HEARTBEAT_MS))
}
