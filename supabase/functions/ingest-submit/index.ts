// ============================================================================
// Edge function: ingest-submit
//
// The server-side bracket around the hybrid upload flow. Two actions:
//
//   create   — verify the caller may upload for the entity (coarse RLS check),
//              mint a path under ingest/{entity_id}/ and return a signed upload
//              URL. The client PUTs the file straight to Storage (bypassing the
//              edge body-size / time limits). The server owns the path, so a
//              client can never place an object outside its tenant's prefix.
//
//   finalize — download the just-uploaded object with the service role, sniff
//              its real content (magic bytes — we trust this over a client-set
//              MIME type), compute the SHA-256 server-side, then call
//              public.submit_batch WITH THE CALLER'S JWT. submit_batch re-checks
//              permission (the sole authoritative barrier) and atomically writes
//              the batch + queue job, reporting duplicates.
//
// Auth: verify_jwt is on (see config.toml), so the platform rejects anonymous
// callers before this code runs. We still build a user-scoped client from the
// caller's JWT so RLS / auth.uid() apply, and a separate service-role client
// for Storage I/O only.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const BUCKET = "ingest"
const PREFIX = `${BUCKET}/` // storage_path is bucket-qualified; object keys are not
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CORS = {
  // JWT-authorized API (no cookies), so a wildcard origin is safe here; tighten
  // to the deployed frontend origin at deploy time if desired.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function log(level: "info" | "warn" | "error", msg: string, extra?: unknown) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component: "ingest-submit",
    msg,
    ...(extra ? { extra } : {}),
  }))
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

// Last path segment, stripped to a safe, bounded charset. Defends the object
// key against traversal ("../") and odd characters in user-supplied names.
function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "upload"
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120)
  return cleaned.length ? cleaned : "upload"
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// Content sniff — trust real bytes over the client-declared MIME type.
//   xlsx (and any OOXML) is a ZIP container: PK\x03\x04.
//   csv has no signature, so we require valid UTF-8 text with no NUL and no
//   disallowed C0 control bytes (only TAB/LF/CR allowed) — this rejects binary
//   masquerading as text/csv. Anything else is unsupported.
function sniff(bytes: Uint8Array): "xlsx" | "csv" | null {
  if (bytes.length === 0) return null

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 && bytes[1] === 0x4b &&
    bytes[2] === 0x03 && bytes[3] === 0x04
  ) {
    return "xlsx"
  }

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return null // not valid UTF-8 → not a text CSV
  }
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b === 0x09 || b === 0x0a || b === 0x0d) continue // TAB, LF, CR
    if (b < 0x20) return null // NUL + other C0 control bytes (UTF-8 multibyte is ≥ 0x80, never trips this)
  }
  return "csv"
}

// Map a PostgREST/Postgres error from submit_batch to an HTTP status. The
// SQLSTATEs come straight from the RAISEs in the function.
function rpcErrorStatus(code: string | undefined): number {
  if (code === "42501") return 403 // insufficient_privilege
  if (code === "28000") return 401 // authentication required
  if (code && code.startsWith("22")) return 400 // invalid input (22023 etc.)
  return 500
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json(405, { error: "method not allowed" })

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return json(401, { error: "missing authorization header" })
  const token = authHeader.replace(/^Bearer\s+/i, "")

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return json(400, { error: "invalid json body" })
  }
  const action = (body as Record<string, unknown>).action

  // User-scoped client: carries the caller's JWT, so RLS and auth.uid() apply.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // Service-role client: used ONLY for Storage I/O (mint signed URL, download
  // for hashing). It bypasses RLS, so it never touches application tables here.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: { user } } = await userClient.auth.getUser(token)
  if (!user) return json(401, { error: "unauthorized" })

  try {
    if (action === "create") {
      return await handleCreate(body as Record<string, unknown>, userClient, adminClient, user.id)
    }
    if (action === "finalize") {
      return await handleFinalize(body as Record<string, unknown>, userClient, adminClient, user.id)
    }
    return json(400, { error: "unknown action; expected 'create' or 'finalize'" })
  } catch (err) {
    log("error", "unhandled error", {
      action,
      uid: user.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return json(500, { error: "internal error" })
  }
})

async function handleCreate(
  body: Record<string, unknown>,
  userClient: ReturnType<typeof createClient>,
  adminClient: ReturnType<typeof createClient>,
  uid: string,
): Promise<Response> {
  const entityId = body.entity_id
  const fileName = body.file_name
  if (typeof entityId !== "string" || !UUID_RE.test(entityId)) {
    return json(400, { error: "entity_id must be a uuid" })
  }
  if (typeof fileName !== "string" || fileName.trim() === "") {
    return json(400, { error: "file_name is required" })
  }

  // Coarse permission gate, delegated to RLS (entities_select): "can the caller
  // even see this entity?" This is intentionally NOT the full upload predicate
  // — a viewer assigned to the entity passes here but is rejected later by
  // submit_batch (the authoritative barrier). It exists to stop unrelated users
  // from minting signed upload URLs against arbitrary tenant prefixes.
  const { data: entity, error: entityErr } = await userClient
    .from("entities").select("id").eq("id", entityId).maybeSingle()
  if (entityErr) {
    log("error", "entity visibility check failed", { uid, entityId, error: entityErr.message })
    return json(500, { error: "internal error" })
  }
  if (!entity) {
    return json(403, { error: "not authorized to upload for this entity" })
  }

  const objectKey = `${entityId}/${crypto.randomUUID()}-${safeFileName(fileName)}`
  const { data, error } = await adminClient
    .storage.from(BUCKET).createSignedUploadUrl(objectKey)
  if (error || !data) {
    log("error", "createSignedUploadUrl failed", { uid, entityId, error: error?.message })
    return json(500, { error: "could not create upload url" })
  }

  log("info", "upload url issued", { uid, entityId, objectKey })
  return json(200, {
    bucket: BUCKET,
    object_key: objectKey,
    // Bucket-qualified path the client echoes back at finalize; matches the
    // ingest/{entity_id}/% shape submit_batch validates.
    storage_path: `${PREFIX}${objectKey}`,
    token: data.token,
    signed_url: data.signedUrl,
  })
}

async function handleFinalize(
  body: Record<string, unknown>,
  userClient: ReturnType<typeof createClient>,
  adminClient: ReturnType<typeof createClient>,
  uid: string,
): Promise<Response> {
  const entityId = body.entity_id
  const storagePath = body.storage_path
  const fileName = body.file_name
  const period = body.period
  if (typeof entityId !== "string" || !UUID_RE.test(entityId)) {
    return json(400, { error: "entity_id must be a uuid" })
  }
  if (typeof fileName !== "string" || fileName.trim() === "") {
    return json(400, { error: "file_name is required" })
  }
  if (typeof period !== "string" || period.trim() === "") {
    return json(400, { error: "period is required" })
  }
  // Fail fast on a mismatched prefix before spending a Storage download;
  // submit_batch enforces the same shape as its own last line of defense.
  const expectedPrefix = `${PREFIX}${entityId}/`
  if (typeof storagePath !== "string" || !storagePath.startsWith(expectedPrefix)) {
    return json(400, { error: `storage_path must start with ${expectedPrefix}` })
  }
  const objectKey = storagePath.slice(PREFIX.length)

  // Download with the service role (the bucket is private and has no object
  // policies). Bounded by the bucket's 10 MB cap, so reading fully is safe.
  const { data: blob, error: dlErr } = await adminClient
    .storage.from(BUCKET).download(objectKey)
  if (dlErr || !blob) {
    log("warn", "object not found at finalize", { uid, entityId, objectKey, error: dlErr?.message })
    return json(404, { error: "uploaded object not found" })
  }
  const bytes = new Uint8Array(await blob.arrayBuffer())

  const kind = sniff(bytes)
  if (!kind) {
    log("warn", "unsupported content rejected", { uid, entityId, objectKey })
    return json(415, { error: "unsupported file content; expected XLSX or CSV" })
  }

  const fileHash = await sha256Hex(bytes)

  // submit_batch is the authoritative gate: it re-checks permission, forces
  // uploaded_by = auth.uid(), and inserts the batch + queue job atomically.
  const { data, error } = await userClient.rpc("submit_batch", {
    p_entity_id: entityId,
    p_storage_path: storagePath,
    p_file_name: fileName,
    p_file_hash: fileHash,
    p_period: period,
  })
  if (error) {
    const status = rpcErrorStatus(error.code)
    log(status >= 500 ? "error" : "warn", "submit_batch rejected", {
      uid, entityId, objectKey, kind, code: error.code, error: error.message,
    })
    return json(status, { error: error.message })
  }

  const result = data as { status?: string; batch_id?: string }
  log("info", "batch finalized", { uid, entityId, kind, status: result?.status, batchId: result?.batch_id })
  if (result?.status === "duplicate") {
    return json(409, { status: "duplicate", batch_id: result.batch_id })
  }
  return json(201, { status: "created", batch_id: result?.batch_id })
}
