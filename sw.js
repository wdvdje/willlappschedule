/* Service worker: handles push events and notification clicks */
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { self.clients.claim(); });

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    if (event.data) payload = event.data.json();
  } catch (e) {
    try { payload = { body: event.data.text() }; } catch (e2) { payload = {}; }
  }
  const title = payload.title || 'Reminder';
  const body = payload.body || payload.message || 'You have a notification';
  const icon = payload.icon || '/icon-192.png';
  const tag = payload.tag || ('ts-' + Date.now());
  const data = payload.data || {};

  const opts = {
    body,
    icon,
    badge: payload.badge || icon,
    tag,
    data,
    renotify: !!payload.renotify,
  };

  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === target && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
