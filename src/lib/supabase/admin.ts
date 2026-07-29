import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * The service-role Supabase client. BYPASSES ROW-LEVEL SECURITY ENTIRELY.
 *
 * IMPORT SCRIPTS ONLY. Never import this from anything under src/app or
 * src/components — the key must never reach the browser.
 *
 * It reads a non-NEXT_PUBLIC_ variable, so Next.js will not inline it into a
 * client bundle even by accident; a client component importing this file fails
 * at build time rather than leaking the key.
 */

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to run import scripts. See .env.example.",
    );
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
