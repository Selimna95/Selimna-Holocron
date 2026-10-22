const CACHE_NAME = 'holocron-static-v3.5.0-sithari-adaptive-board';
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.css?v=3.6.7-seigneur-card-layout',
  './sithari.css?v=4.2.0-adaptive-mod-board',
  './holocron-system.css?v=4.3.0-disciple-clarity',
  './interface-adapter.js?v=3.2.3-sanctuary-speed-buckets',
  './gac-usage.js?v=3.2.1',
  './modules/core.js?v=3.4.4-cache-sync',
  './modules/acolyte.js?v=3.4.3-weak-donor-pool',
  './modules/disciple.js?v=3.5.0-disciple-clarity',
  './modules/seigneur.js?v=3.5.3-no-speed-loss',
  './modules/sithari.js?v=4.0.1-owner-cache-sync',
  './modules/runtime.js?v=3.7.0-sith-portraits',
  './optimizer-worker.mjs?v=3.4.4-cache-sync',
  './python/optimizer.py?v=3.4.4-cache-sync',
  './python/kyber_data.py?v=3.4.4-cache-sync',
  './python/optimizer_profiles.json?v=3.4.4-cache-sync',
  './python/kyber_profiles.json?v=3.4.4-cache-sync',
  './assets/backgrounds/holocron-gate.jpg',
  './assets/sith-sprite.webp',
  './assets/icons/holocron-192.png',
  './assets/icons/holocron-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('holocron-static-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Les données de profil/relais ne sont jamais mises en cache.
  if (url.searchParams.has('ally')) return;

  // Les navigations sont réseau d'abord pour éviter de servir un ancien index.
  // La copie réseau est conservée pour le mode hors ligne.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          const indexUrl = new URL('./index.html', self.registration.scope).href;
          caches.open(CACHE_NAME).then(cache => cache.put(indexUrl, copy));
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const indexUrl = new URL('./index.html', self.registration.scope).href;
        return caches.match(indexUrl);
      })
    );
    return;
  }

  // Cache-first uniquement pour les ressources statiques, dont les URLs
  // versionnées sont alignées avec index.html.
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && (
        request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'image' ||
        url.pathname.endsWith('.json') ||
        url.pathname.endsWith('.mjs') ||
        url.pathname.endsWith('.py')
      )) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
