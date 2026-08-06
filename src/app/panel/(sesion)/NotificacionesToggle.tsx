"use client";

import { useEffect, useState } from "react";
import { isPushSupported, subscribeToPush } from "@/lib/admin/push";

/**
 * "Activar notificaciones" — a new order on the website pushes a real OS
 * notification to every subscribed staff device (Brief: PWA push).
 *
 * Shown to ALL staff, unlike SalirButton: both parents need to hear about a
 * new pedido, not just the technical admin. If the browser can't do Web
 * Push at all (no PushManager — e.g. iOS Safari not installed as a PWA), or
 * it's already granted, this renders nothing: missing capability and an
 * already-active subscription are both legitimate quiet states, not errors.
 */
export function NotificacionesToggle() {
  const [supported, setSupported] = useState(false);
  const [granted, setGranted] = useState(true);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(isPushSupported());
    setGranted(
      typeof Notification !== "undefined" &&
        Notification.permission === "granted",
    );
  }, []);

  if (!supported || granted) return null;

  async function activar() {
    setActivating(true);
    setError(null);
    const result = await subscribeToPush();
    setActivating(false);

    if (result.ok) {
      setGranted(true);
      return;
    }

    if (result.error === "permiso_denegado") {
      setError("Permiso denegado. Activalo desde los ajustes del navegador.");
    } else if (result.error !== "no_soportado") {
      setError("No se pudo activar. Intentá de nuevo.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={activar}
        disabled={activating}
        className="type-label shrink-0 rounded-md px-3 py-2 text-stone-text transition-colors hover:text-ink disabled:opacity-45"
      >
        {activating ? "Activando…" : "Activar notificaciones"}
      </button>
      {error && <p className="type-label text-mamey-text">{error}</p>}
    </div>
  );
}
