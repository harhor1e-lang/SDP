/* SDP offline shell. Firebase and all cross-origin requests are deliberately not cached. */
const CACHE_NAME = 'sdp-school-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('sdp-school-shell-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Do not cache Firebase, fonts, or third-party APIs.

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (_) {
        return (await cache.match(request)) ||
               (await cache.match('./index.html')) ||
               new Response('لا يوجد اتصال بالإنترنت حالياً.', {
                 status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
               });
      }
    })());
    return;
  }

  // Cache only same-origin static files; never cache API or dynamic Firebase data.
  if (/\.(?:png|jpg|jpeg|svg|webp|css|js|woff2?)$/i.test(url.pathname) ||
      url.pathname.endsWith('/manifest.webmanifest')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        fetch(request).then(response => {
          if (response && response.ok) cache.put(request, response);
        }).catch(() => {});
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
      } catch (_) {
        return new Response('', {status: 504});
      }
    })());
  }
});
