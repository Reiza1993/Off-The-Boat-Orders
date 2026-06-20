// Service Worker for Off The Boat Pizzeria Orders
// Provides offline support via cache-first strategy

const CACHE_NAME = 'otb-orders-v5';

// Files to cache on install for offline use
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './js/app.js',
  './js/data.js',
  './js/utils.js',
  './js/catalog-defaults.js',
  './js/screens/new-order.js',
  './js/screens/output.js',
  './js/screens/history.js',
  './js/screens/tracking.js',
  './js/screens/stats.js',
  './js/screens/backup.js',
  './js/screens/catalog.js',
];

// Install: cache all app files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for app files, network-first for Tailwind CDN
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go network for the Tailwind CDN (it's external)
  if (url.hostname === 'cdn.tailwindcss.com') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else (our own files)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
