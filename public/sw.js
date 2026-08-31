// CamDetec service worker.
//
// Its only job is to exist. Android Chrome forbids `new Notification()` and
// serves notifications exclusively through a service worker registration, so
// this is registered lazily the first time notifications are turned on.
//
// Deliberately no `fetch` handler: intercepting requests would put a cache
// between the app and its 12MB of model weights, and CamDetec is a live camera
// console, not an offline app.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Focus an existing tab when an alert is tapped, rather than opening a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const tab = clients.find((c) => "focus" in c);
      return tab ? tab.focus() : self.clients.openWindow("/");
    }),
  );
});
