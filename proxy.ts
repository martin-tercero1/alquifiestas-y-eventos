import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh and an optimistic gate on /panel.
 *
 * In Next.js 16 this file is `proxy.ts`, not `middleware.ts` — same feature,
 * renamed. It has two jobs:
 *
 *   1. Refresh the Supabase session cookie on every panel request. This is
 *      what keeps her logged in for weeks. A phone that asks for a password
 *      every morning gets abandoned, and that is the whole reason this runs.
 *
 *   2. Bounce an obviously-signed-out request to the login page, so a cold
 *      visit does not flash an empty panel first.
 *
 * The Next docs are explicit that this is NOT the authorization boundary — it
 * is an optimistic check. The real one is `currentStaff()` in the panel
 * layout, plus row-level security in Postgres, which is the only guard that
 * holds even if both of the others are wrong.
 */

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLogin = pathname.startsWith("/panel/entrar");

  /**
   * Redirecting has to carry the session cookies with it.
   *
   * getUser() may have just refreshed an expired access token and written new
   * cookies onto `response`. A fresh NextResponse.redirect() does not inherit
   * them, so returning one throws the refresh away — the browser keeps sending
   * the stale token, the next request fails the same check, and she is bounced
   * to the login screen mid-order roughly once an hour. Which is exactly the
   * "logs me out constantly" behaviour that gets a tool abandoned.
   */
  const redirectTo = (pathname: string, search?: string) => {
    const target = request.nextUrl.clone();
    target.pathname = pathname;
    if (search !== undefined) target.search = search;

    const redirect = NextResponse.redirect(target);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  };

  if (!user && !isLogin) {
    // So she lands where she was headed once she signs in, rather than at a
    // generic home screen she then has to navigate away from.
    return redirectTo("/panel/entrar", `?volver=${encodeURIComponent(pathname)}`);
  }

  if (user && isLogin) {
    return redirectTo("/panel", "");
  }

  return response;
}

export const config = {
  matcher: ["/panel/:path*"],
};
