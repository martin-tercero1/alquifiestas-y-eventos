/**
 * Service-role Supabase client for import scripts.
 *
 * This key bypasses row-level security. It lives only in .env.local and is only
 * ever imported by files under scripts/ — never by anything that ships to the
 * browser.
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

loadEnv();

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.\n" +
        "Supabase dashboard > Project Settings > API > service_role key.",
    );
    process.exit(1);
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
