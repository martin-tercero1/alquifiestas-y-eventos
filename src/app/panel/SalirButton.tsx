"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { panelClient } from "@/lib/supabase/panel";

/**
 * Signing out. Deliberately NOT in the bottom bar any more — a mis-tap there
 * logged someone out mid-proforma. It lives up here in the Hoy header, off the
 * path of the thumb, where leaving is a thing you choose, not a thing you graze.
 */
export function SalirButton() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await panelClient().auth.signOut();
    router.replace("/panel/entrar");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={signingOut}
      className="type-label shrink-0 rounded-md px-3 py-2 text-stone-text transition-colors hover:text-ink disabled:opacity-45"
    >
      {signingOut ? "Saliendo…" : "Salir"}
    </button>
  );
}
