const CACHE_NAME = 'holocron-static-v3.8.2-sanctuary-obsidian';
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.css?v=3.2.1',
  './sithari.css?v=3.6.0-pulse',
  './holocron-system.css?v=3.4.2-sanctuary-obsidian',
  './interface-adapter.js?v=3.2.1',
  './gac-usage.js?v=3.2.1',
  './modules/core.js',
  './modules/acolyte.js',
  './modules/disciple.js',
  './modules/seigneur.js',
  './modules/sithari.js?v=3.4.0-energy',
  './modules/runtime.js?v=3.4.1-native-arrow-events',
  './optimizer-worker.mjs',
  './python/optimizer.py?v=3.2.1',
  './python/kyber_data.py?v=3.2.1',
  './python/optimizer_profiles.json?v=3.2.1',
  './python/kyber_profiles.json?v=3.2.1',
  './assets/backgrounds/holocron-gate.jpg',
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
  // Never cache relay/profile responses. Only known static files are eligible.
  if (url.pathname.includes('/?ally=') || url.searchParams.has('ally')) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && (request.destination === 'script' || request.destination === 'style' || request.destination === 'image' || url.pathname.endsWith('.json') || url.pathname.endsWith('.mjs') || url.pathname.endsWith('.py'))) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});
