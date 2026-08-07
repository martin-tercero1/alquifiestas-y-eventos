// Edge Function: notify-new-order
//
// Called by the `orders_notify_new_order` trigger (via pg_net) whenever a
// brand-new website reservation request lands. Reads every subscribed staff
// device from `push_subscriptions` (service-role key — the table is
// RLS-locked and this function has no user session) and delivers a Web Push
// notification to each one. The trigger fires this asynchronously and
// ignores the response body, so failures here never touch the order write.
//
// Deno runtime, Supabase Edge Functions.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const NOTIFY_SHARED_SECRET = Deno.env.get("NOTIFY_SHARED_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT");

type NotifyBody = {
  order_id: string;
  order_number: number;
  customer_name: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

Deno.serve(async (req) => {
  if (req.headers.get("x-notify-secret") !== NOTIFY_SHARED_SECRET) {
    return new Response("no autorizado", { status: 401 });
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !VAPID_PUBLIC_KEY ||
    !VAPID_PRIVATE_KEY ||
    !VAPID_SUBJECT
  ) {
    // Missing config is a legitimate quiet state, not an error — same rule
    // the trigger follows for app.notify_url / app.notify_secret.
    return new Response(JSON.stringify({ sent: 0, pruned: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const body = (await req.json()) as NotifyBody;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error || !subscriptions) {
    return new Response(JSON.stringify({ sent: 0, pruned: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const payload = JSON.stringify({
    title: `Nuevo pedido de ${body.customer_name}`,
    body: `Nuevo pedido de ${body.customer_name}`,
    data: { url: `/panel/pedidos/${body.order_id}` },
  });

  let sent = 0;
  let pruned = 0;

  await Promise.all(
    (subscriptions as PushSubscriptionRow[]).map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          // High urgency so Android/FCM wakes a Doze'd device and delivers
          // promptly even when the PWA is closed; TTL caps how long the push
          // service holds it if the device is offline.
          { urgency: "high", TTL: 3600 },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          pruned++;
        } else {
          // Warn, never block — one dead or slow device must not stop the
          // others.
          console.error("push send failed", sub.endpoint, err);
        }
      }
    }),
  );

  return new Response(JSON.stringify({ sent, pruned }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
