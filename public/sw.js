// Service worker for Web Push notifications.
// Registered by `usePushSubscription`; handles `push` + `notificationclick`.

self.addEventListener("install", (event) => {
  // Skip the "waiting" phase — newer SWs activate immediately.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of any open tabs that don't yet have an SW.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Priya's Reinigungsservice",
    body: "",
    url: "/",
  };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    // Plain text fallback.
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag || undefined,
      data: { url: payload.url || "/" },
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
      // Focus an existing tab if it's already on the right URL.
      for (const client of all) {
        if (client.url.endsWith(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
