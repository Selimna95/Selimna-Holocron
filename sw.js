// Retired cache identifier: holocron-static-v4.0.19-padawan-seasonal-defense
// Older retired cache identifier: holocron-static-v4.0.8-gac-parameters
// Previous cache: holocron-static-v4.3.6-seigneur-slot-comparison
const CACHE_NAME = 'holocron-static-v4.4.29-kyber-slug-fallback';
const STATIC_ASSETS = [
  './',
  './index.html',
  './blue-gac/index.html',
  './blue-gac/blue-gac.css?v=4.1.4',
  './blue-gac/blue-gac.js?v=4.1.4',
  './blue-gac/gac-audit.js?v=4.1.4',
  './blue-gac/gac-catalog.json?v=4.1.2',
  './assets/image/padawan.png',
  './assets/image/jpeg.jpg',
  './app.css?v=4.1.3-visionnaire-cleanup',
  './visionnaire.css?v=4.1.45-kyber-slug-fallback',
  './holocron-system.css?v=4.0.0-disciple-clarity',
  './entrance.css?v=4.0.46-crawl-restart',
  './holocron-static.css?v=4.0.45',
  './interface-adapter.js?v=4.0.47-crawl-restart-v2',
  './gac-usage.js?v=3.5.0-browser-import',
  './modules/seigneur-gac.js?v=1.1.0-history-fallback',
  './modules/core.js?v=4.2.14-kyber-slug-fallback',
  './modules/acolyte.js?v=3.4.5-candidate-score',
  './modules/disciple.js?v=3.5.2-ranked-candidates',
  './modules/seigneur.js?v=3.9.4-slot-comparison',
  './modules/seigneur-impact.js?v=1.0.0-roster-impact',
  './modules/visionnaire.js?v=4.1.45-kyber-slug-fallback',
  './modules/runtime.js?v=3.7.1-visionnaire-page',
  './optimizer-worker.mjs?v=3.5.3-seigneur-speed-floor',
  './python/optimizer.py?v=3.5.1-seigneur-speed-floor',
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
  if (request.method !== 'GET') return;

  // Le catalogue Raw est cross-origin : traiter ce cas avant le filtre same-origin.
  if (url.hostname === 'raw.githubusercontent.com' &&
      url.pathname.endsWith('/Selimna-Holocron/main/blue-gac/gac-catalog.json')) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }).catch(async () => (await caches.match(request)) ||
      (await caches.match(new URL('./blue-gac/gac-catalog.json?v=4.1.2', self.registration.scope)))));
    return;
  }

  if (url.origin !== self.location.origin || url.searchParams.has('ally')) return;

  if (url.pathname.endsWith('/blue-gac/gac-catalog.json')) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }).catch(async () => (await caches.match(request)) ||
      (await caches.match(new URL('./blue-gac/gac-catalog.json?v=4.1.2', self.registration.scope)))));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const fallbackUrl = url.pathname.includes('/blue-gac')
        ? new URL('./blue-gac/index.html', self.registration.scope)
        : new URL('./index.html', self.registration.scope);
      return (await caches.match(fallbackUrl)) || Response.error();
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
