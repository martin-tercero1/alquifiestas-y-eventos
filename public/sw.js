// Service worker for staff push notifications ("new order arrived").
//
// Plain static file under public/ — no build step touches it, and none of
// this runs through .next. Two jobs: show the notification the Edge Function
// pushed, and open the order when it's tapped.

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Nuevo pedido";
  const body = payload.body || title;
  const url = payload.data && payload.data.url ? payload.data.url : "/panel";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  if (!url) return;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
});
