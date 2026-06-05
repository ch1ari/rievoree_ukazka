import { createClient } from "@supabase/supabase-js"
import { createInstrumentedFetch } from "./xray/instrumentedFetch"

/**
 * The ONLY way the app talks to Supabase. Every request flows through the
 * instrumented fetch, so the X-ray panel sees all traffic from day one.
 * Import this client — never call createClient elsewhere.
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    global: { fetch: createInstrumentedFetch() },
  },
)
