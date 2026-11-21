// Minimal offline shell cache. A new worker waits and activates on the next launch. Bump CACHE when shipped files change.
const CACHE = 'shell-v2';
const SHELL = ['./', 'index.html', 'design/tokens.css', 'src/styles.css', 'src/main.js', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE && /^shell-v\d+$/.test(key)).map((key) => caches.delete(key))
  )));
});
self.addEventListener('fetch', (e) => {
  // Shell only: same-origin GET requests. Cross-origin requests (API calls) are never intercepted,
  // so no API response is ever stored in the cache.
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { cacheName: CACHE }).then((hit) => hit || fetch(e.request)));
});
