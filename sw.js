// Retired cache identifier: holocron-static-v4.0.19-padawan-seasonal-defense
// Older retired cache identifier: holocron-static-v4.0.8-gac-parameters
const CACHE_NAME = 'holocron-static-v4.0.54-crawl-restart-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './blue-gac/index.html',
  './assets/image/jpeg.jpg',
  './app.css?v=4.0.0-seigneur-card-layout',
  './sithari.css?v=4.2.0-adaptive-mod-board',
  './holocron-system.css?v=4.0.0-disciple-clarity',
  './entrance.css?v=4.0.46-crawl-restart',
  './holocron-static.css?v=4.0.45',
  './interface-adapter.js?v=4.0.47-crawl-restart-v2',
  './gac-usage.js?v=3.2.1',
  './modules/core.js?v=3.4.4-cache-sync',
  './modules/acolyte.js?v=3.4.3-weak-donor-pool',
  './modules/disciple.js?v=3.5.0-disciple-clarity',
  './modules/seigneur.js?v=3.5.4-total-speed-guard',
  './modules/sithari.js?v=4.0.2-total-speed-guard',
  './modules/runtime.js?v=3.7.0-sith-portraits',
  './optimizer-worker.mjs?v=3.4.4-cache-sync',
  './python/optimizer.py?v=3.4.4-cache-sync',
  './python/kyber_data.py?v=3.4.4-cache-sync',
  './python/optimizer_profiles.json?v=3.4.4-cache-sync',
  './python/kyber_profiles.json?v=3.4.4-cache-sync',
  './assets/backgrounds/holocron-gate.jpg',
  './assets/backgrounds/perso.jpg',
  './assets/backgrounds/yavin-temple-entrance-v2.svg',
  './assets/holocrons/sith-holocron.svg',
  './assets/holocrons/jedi-blue-holocron.svg',
  './assets/holocrons/jedi-blue-reference.jpg',
  './assets/sith-sprite.webp',
  './assets/icons/holocron-192.png',
  './assets/icons/holocron-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('holocron-static-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.searchParams.has('ally')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        const indexUrl = new URL('./index.html', self.registration.scope).href;
        caches.open(CACHE_NAME).then(cache => cache.put(indexUrl, copy));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      return caches.match(new URL('./index.html', self.registration.scope).href);
    }));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && (request.destination === 'script' || request.destination === 'style' || request.destination === 'image' || url.pathname.endsWith('.json') || url.pathname.endsWith('.mjs') || url.pathname.endsWith('.py'))) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});
