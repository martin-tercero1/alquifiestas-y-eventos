import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/supabase/server";
import { PanelNav } from "../PanelNav";

/**
 * The signed-in shell.
 *
 * `(sesion)` is a route group, so it adds nothing to the URL — /panel is
 * still /panel. What it does is draw a line: everything inside needs a
 * session, and the login page sits outside it.
 *
 * This is the real authorization boundary. `proxy.ts` also redirects a
 * signed-out request, but the Next docs are explicit that it is an optimistic
 * check — it trusts a cookie it has not verified. `currentStaff()` calls
 * getUser(), which verifies with Supabase. Behind both, row-level security
 * means a forged session still reads nothing.
 *
 * Navigation is a bottom bar rather than a top menu or a drawer, because the
 * brief's rule is that nothing critical hides behind a menu and the product is
 * used one-handed on a phone. A thumb reaches the bottom of a 6-inch screen;
 * it does not reach the top-left corner.
 */
export default async function SesionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await currentStaff();

  if (!staff) redirect("/panel/entrar");

  return (
    <div className="flex min-h-dvh flex-col bg-limewash">
      {/* Clears the fixed bottom bar so the last row is never trapped under it. */}
      <div className="flex-1 pb-28">{children}</div>
      <PanelNav />
    </div>
  );
}
