import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Panel", template: "%s · Panel" },
  // The panel must never appear in a search result, and it holds customer
  // names and phone numbers, so it is excluded explicitly rather than left to
  // the fact that it needs a login.
  robots: { index: false, follow: false },
};

/**
 * Metadata only, deliberately.
 *
 * The signed-in shell — the auth check and the bottom bar — lives one level
 * down in `(sesion)/layout.tsx`. It has to: the login page is under /panel
 * too, and when the auth check lived here it redirected `/panel/entrar` to
 * `/panel/entrar`, which is a redirect loop and a login page nobody can
 * reach. A route group is what keeps the login outside the guarded area
 * while leaving the URL alone.
 */
export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
