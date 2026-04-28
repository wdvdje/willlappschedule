/* Service worker: offline shell caching + push notifications */
const CACHE_VERSION = 'ts-cache-v10';
const CORE_ASSETS = [
  './',
  './index.html',
  './create-item.html',
  './calendar.html',
  './events.html',
  './tasks.html',
  './reminders.html',
  './settings.html',
  './manifest.json',
  './assets/icon.svg',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/shortcuts/shortcut-today.png',
  './assets/shortcuts/shortcut-calendar.png',
  './assets/shortcuts/shortcut-tasks.png',
  './assets/shortcuts/shortcut-inbox.png',
  './assets/shortcuts/shortcut-reminders.png',
  './assets/app.css',
  './assets/app.js',
  './utils.js',
  './events-view.js',
  './daily-view.js',
  './tasks.js',
  './notifications.js',
  './push.js',
  './calendar-advanced.js',
  './desktop.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
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

  // iOS 26 / web push: notification actions for quick interaction
  const actions = [];
  if (data.url || payload.url) {
    actions.push({ action: 'open', title: 'Open' });
  }
  if (payload.snoozeUrl || data.snoozeUrl) {
    actions.push({ action: 'snooze', title: 'Snooze 10m' });
  }
  actions.push({ action: 'dismiss', title: 'Dismiss' });

  const opts = {
    body,
    icon,
    badge: payload.badge || icon,
    tag,
    data: Object.assign({}, data, { url: data.url || payload.url || '/' }),
    renotify: !!payload.renotify,
    vibrate: payload.vibrate || [100, 50, 100],
    requireInteraction: !!payload.requireInteraction,
    silent: !!payload.silent,
  };

  // Only add actions if browser supports them (not iOS < 16.4)
  if (actions.length) {
    try { opts.actions = actions; } catch (_) {}
  }

  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action || 'open';
  const notifData = event.notification.data || {};
  const target = notifData.url || '/';

  // Handle snooze action: re-schedule the notification in 1 minute
  // (Service workers may be suspended; short delays are more reliable)
  if (action === 'snooze') {
    const SNOOZE_DELAY = 60 * 1000; // 1 minute — reliable within SW lifetime
    event.waitUntil(
      new Promise((resolve) => {
        setTimeout(() => {
          self.registration.showNotification(event.notification.title, {
            body: event.notification.body,
            icon: event.notification.icon,
            badge: event.notification.badge,
            tag: event.notification.tag + '-snoozed',
            data: notifData,
            vibrate: [100, 50, 100],
          }).then(resolve).catch(resolve);
        }, SNOOZE_DELAY);
      })
    );
    return;
  }

  // 'dismiss' — notification is already closed above
  if (action === 'dismiss') return;

  // 'open' or default — focus existing window or open new one
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === target && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

// ── Background Sync: iCloud data sync retry ──────────────────────────────
// Registered by icloud-sync.js when a write attempt fails because the
// device is offline.  When connectivity is restored the browser fires this
// event and we message every active client to re-attempt the sync.
// Supported on iOS 16+ standalone; silently ignored on older browsers.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'icloud-sync') return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'bg-sync:icloud' }));
    })
  );
});

// ── Periodic Background Sync: re-arm scheduled notifications ─────────────
// Registered by push.js with a 15-minute minimum interval.
// On each tick we message every active client to call rescheduleAll().
// Available on iOS 16.4+ PWA standalone; silently ignored elsewhere.
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'reminder-check') return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'periodicsync:reminders' }));
    })
  );
});
