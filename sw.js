/* Service worker: offline shell caching + push notifications */
const CACHE_VERSION = 'ts-cache-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './calendar.html',
  './events.html',
  './tasks.html',
  './reminders.html',
  './settings.html',
  './manifest.json',
  './assets/app.css',
  './assets/app.js',
  './utils.js',
  './events-view.js',
  './daily-view.js',
  './tasks.js',
  './notifications.js',
  './push.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isHtmlNav = req.mode === 'navigate';
  const isStaticAsset = /\.(?:html|css|js|json|png|jpg|jpeg|webp|gif|svg|ico)$/i.test(path);

  if (isHtmlNav) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('./index.html')))
    );
    return;
  }

  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        fetch(req)
          .then((res) => {
            if (!res || !res.ok) return;
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => undefined);
          })
          .catch(() => undefined);
        return cached;
      }
      return fetch(req)
        .then((res) => {
          if (!res || !res.ok) return res;
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => new Response('Network error', { status: 503, statusText: 'Service Unavailable' }));
    })
  );
});

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
