const CACHE_NAME = 'holocron-static-v3.2.1';
const IMMUTABLE_ASSETS = /\.(?:[a-f0-9]{8,}\.(?:js|css)|holocron-[0-9]+\.png)$/i;

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('holocron-static-') && key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim()),
));

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.searchParams.has('ally') || url.searchParams.has('path')) return;
  const cacheable = ['script', 'style', 'image', 'font'].includes(request.destination)
    || /\.(?:json|py|mjs|css|js|svg|webmanifest)$/i.test(url.pathname);
  if (!cacheable) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (IMMUTABLE_ASSETS.test(url.pathname)) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      throw error;
    }
  })());
});
