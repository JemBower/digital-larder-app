const CACHE_NAME = 'digital-larder-v4';
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

// App-shell files: stale-while-revalidate. Serve the cached copy instantly
// (fast, works with no signal), but always fetch a fresh copy in the
// background and update the cache — so the next launch naturally has
// whatever was last shipped, without needing a hard reinstall to see it.
// Anything else (like the on-demand OCR script) just goes to the network —
// it's only needed when scanning a receipt, which realistically happens
// when there's a connection anyway.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isShellFile = APP_SHELL.some((path) => url.pathname.endsWith(path.replace('./', '/')));
  if (!isShellFile) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => { cache.put(event.request, response.clone()); return response; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
