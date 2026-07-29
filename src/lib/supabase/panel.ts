import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * The panel's browser client.
 *
 * Separate from the public site's client for one reason: sessions. The public
 * client sets `persistSession: false` because a visitor has no session and we
 * do not want one written to their browser. The panel needs the opposite —
 * a session stored in COOKIES rather than localStorage, so the server can read
 * it too and a page can be rendered already knowing who is asking.
 *
 * Same publishable key, same row-level security. What changes is that requests
 * now carry a logged-in user, and the staff policies apply.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set. See .env.example.",
  );
}

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** One client per browser tab; calling this repeatedly is cheap. */
export function panelClient() {
  client ??= createBrowserClient<Database>(url!, key!);
  return client;
}
