// sw.js — Service Worker for offline caching

const CACHE_NAME = 'ski-tracker-v1';
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/gps-tracker.js',
  './js/stats.js',
  './js/map.js',
  './js/lifts.js',
  './js/route.js',
  './js/notes.js',
  './js/group.js',
  './js/storage.js',
  './data/morzine-avoriaz.json',
  './manifest.json'
];

const TILE_CACHE = 'ski-tracker-tiles-v1';

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== TILE_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for app shell and tiles, network-first for data
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Map tiles: cache-first
  if (url.hostname.includes('tile.opentopomap.org') ||
      url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // App shell: cache-first
  if (APP_SHELL.some(path => url.pathname.endsWith(path.replace('./', '')))) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request);
      })
    );
    return;
  }

  // Everything else: network-first
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
