// Minimal offline shell cache. A new worker waits and activates on the next launch. Bump CACHE when shipped files change.
const CACHE = 'shell-v26';
const SHELL = [
  './', 'index.html', 'about.html', 'src/about.js', 'src/render/about.js', 'design/tokens.css', 'src/styles.css',
  'src/styles/search.css', 'src/styles/settings.css', 'src/styles/banners.css', 'src/styles/about.css', 'src/styles/install.css', 'src/styles/footer.css',
  'src/theme-boot.js', 'src/theme.js', 'src/main.js', 'src/app.js', 'src/compose.js', 'src/state.js',
  'manifest.webmanifest', 'src/api/cache.js', 'src/api/diagnostics.js', 'src/api/http.js', 'src/api/keycheck.js', 'src/api/quota.js',
  'src/api/sources.js', 'src/config.js', 'src/settings/keys.js', 'src/core/images.js', 'src/core/typeahead.js', 'src/core/url.js', 'src/api/tmdb.js',
  'src/core/normalize.js', 'src/data/services.js',
  'src/render/dom.js', 'src/render/banners.js', 'src/render/header.js', 'src/render/attribution.js', 'src/render/search.js', 'src/render/settings.js', 'src/render/welcome.js',
  'src/render/install.js', 'src/core/platform.js',
  'src/styles/not-found.css', 'icon.svg', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'src/i18n/strings.js', 'src/i18n/en/common.js', 'src/i18n/en/search.js', 'src/i18n/en/title.js',
  'src/i18n/en/verdict.js', 'src/i18n/en/settings.js', 'src/i18n/en/banners.js', 'src/i18n/en/about.js',
  'src/i18n/en/install.js',
];
// Loaded on demand (title page, country selector). Cached with the shell so a fresh offline launch finds them,
// but kept out of the first-load budget, which only counts what the first paint needs.
const LAZY = [
  'src/title-page.js', 'src/render/title.js', 'src/render/languages.js', 'src/render/service-picker.js', 'src/render/all-services.js', 'src/render/service-logo.js', 'src/render/country.js', 'src/i18n/en/country.js', 'src/render/diagnostics.js', 'src/i18n/en/diagnostics.js',
  'src/styles/title.css', 'src/core/reconcile.js', 'src/core/verdict.js', 'src/api/availability.js', 'src/api/streaming.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([...SHELL, ...LAZY])));
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
