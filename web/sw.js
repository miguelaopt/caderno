const CACHE = 'caderno-static-v4';
const STATIC = new Set(['/product.css', '/product.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']);
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...STATIC])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('caderno-static-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !STATIC.has(url.pathname)) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request)));
});
