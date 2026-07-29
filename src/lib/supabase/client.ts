import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * The public Supabase client.
 *
 * Uses the publishable key, which is safe to ship to the browser — row-level
 * security is what actually protects the data, not the secrecy of this key.
 *
 * Anonymous callers can read published, priced catalog entries and insert a
 * reservation request. Nothing else. See the RLS migration.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set. See .env.example.",
  );
}

export const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false },
});
