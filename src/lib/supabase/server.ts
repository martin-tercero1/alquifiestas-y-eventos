import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

/**
 * The panel's server client, for Server Components and Server Actions.
 *
 * Reads the session out of the request cookies, so a page can render already
 * knowing who is asking and row-level security applies to it. Never used by
 * the public site, which has no session at all.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function serverClient() {
  const store = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            store.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. The session refresh that
          // matters happens in proxy.ts, which can — so this is safe to
          // swallow rather than crash a page render over.
        }
      },
    },
  });
}

/**
 * The signed-in staff member, or null.
 *
 * Uses getUser(), not getSession(): getSession() trusts whatever the cookie
 * says, while getUser() verifies it with Supabase. On a page that decides
 * whether to show the business's orders, that difference is the whole point.
 */
export async function currentStaff() {
  const supabase = await serverClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("staff")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? "",
    name: profile?.display_name ?? user.email?.split("@")[0] ?? "",
  };
}
