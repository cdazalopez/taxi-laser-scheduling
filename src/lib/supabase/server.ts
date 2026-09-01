import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service_role key.
 * NEVER import this into a Client Component. It bypasses RLS.
 *
 * Left untyped on purpose: the handwritten Database type does not model the
 * nested join / .or() responses well and infers `never`. We cast in queries.ts.
 */
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
