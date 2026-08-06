import { panelClient } from "@/lib/supabase/panel";
import type { Json } from "@/lib/supabase/types";

/**
 * PWA push subscriptions — turning "Activar notificaciones" on and off.
 *
 * Client-side only: the browser is the one holding the PushManager and the
 * service worker registration. The database side (`save_push_subscription` /
 * `delete_push_subscription`) is what makes a device reachable later, from
 * the `notify-new-order` Edge Function. Missing browser capability, denied
 * permission, or a failed RPC are all legitimate quiet states, not crashes —
 * same rule the rest of the panel follows.
 */

export type PushResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "no_soportado"
        | "permiso_denegado"
        | "no_autorizado"
        | "datos_invalidos"
        | "error";
    };

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

/** True when this browser is even capable of Web Push. */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function subscribeToPush(): Promise<PushResult> {
  if (!isPushSupported()) return { ok: false, error: "no_soportado" };

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return { ok: false, error: "error" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "permiso_denegado" };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  const { data, error } = await panelClient().rpc("save_push_subscription", {
    p_subscription: subscription.toJSON() as unknown as Json,
  });

  if (error) return { ok: false, error: "error" };

  const result = data as { ok: boolean; error?: string };
  if (!result?.ok) {
    if (result?.error === "no_autorizado")
      return { ok: false, error: "no_autorizado" };
    if (result?.error === "datos_invalidos")
      return { ok: false, error: "datos_invalidos" };
    return { ok: false, error: "error" };
  }

  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<PushResult> {
  if (!isPushSupported()) return { ok: false, error: "no_soportado" };

  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) return { ok: true };

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  const { data, error } = await panelClient().rpc("delete_push_subscription", {
    p_endpoint: endpoint,
  });

  if (error) return { ok: false, error: "error" };

  const result = data as { ok: boolean; error?: string };
  if (!result?.ok) {
    if (result?.error === "no_autorizado")
      return { ok: false, error: "no_autorizado" };
    return { ok: false, error: "error" };
  }

  return { ok: true };
}
