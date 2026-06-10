import { createClient } from "@supabase/supabase-js";

// The worker talks to Postgres directly (postgres.js), but Storage objects live
// behind the Storage API — so we use a service-role supabase-js client purely
// for the download. Service role bypasses the private `ingest` bucket's lack of
// object policies (same stance as the edge function's finalize step).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ??
  "http://host.docker.internal:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "ingest";

const storage = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
}).storage;

// storage_path is bucket-qualified ("ingest/{entity}/{key}"); the Storage API
// wants the bucket-relative key.
export async function downloadObject(storagePath: string): Promise<Uint8Array> {
  const objectKey = storagePath.startsWith(`${BUCKET}/`)
    ? storagePath.slice(BUCKET.length + 1)
    : storagePath;
  const { data, error } = await storage.from(BUCKET).download(objectKey);
  if (error || !data) {
    throw new Error(
      `storage download failed for ${storagePath}: ${error?.message ?? "no data"}`,
    );
  }
  return new Uint8Array(await data.arrayBuffer());
}
