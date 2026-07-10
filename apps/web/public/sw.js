'use strict';

// s3vyaPOS service worker — makes the app installable (PWA) and keeps the
// shell loading through network blips. Strategy: network-first for pages and
// API-free GETs, falling back to the last cached copy. API requests are never
// cached here (the app has its own offline cache + outbox in localStorage).
const CACHE = 's3vyapos-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/waiter'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API lives behind /api on same origin…
  if (url.pathname.startsWith('/api/')) return;    // …but never cache it here

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit ?? caches.match('/'))),
  );
});
