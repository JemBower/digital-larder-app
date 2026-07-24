const CACHE_NAME = 'digital-larder-v1';
const APP_SHELL = [
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// App-shell files: cache-first, so the shopping list and larder tracker
// always open instantly with no signal. Anything else (like the on-demand
// OCR script) just goes to the network — it's only needed when scanning a
// receipt, which realistically happens when there's a connection anyway.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isShellFile = APP_SHELL.some((path) => url.pathname.endsWith(path.replace('./', '/')));

  if (isShellFile) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
