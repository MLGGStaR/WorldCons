// WorldCons service worker. Network-first for the app and data (always fresh online,
// still works offline); stale-while-revalidate for images. VERSION is stamped by
// pipeline/stamp.mjs on every release.
const VERSION = '2026.10.04-2304';
const SHELL = `wc-shell-${VERSION}`;
const IMAGES = 'wc-img-v1';
const PRECACHE = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/model.js',
  'js/geo.js',
  'js/icons.js',
  'js/version.js',
  'fonts/archivo-latin.woff2',
  'manifest.webmanifest',
  'icons/icon.svg',
  'data/cons.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'no-cache' }))))
      .catch(() => {}),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('wc-shell-') && k !== SHELL).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) return; // always straight to the network
  if (url.pathname.includes('/img/')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const fresh = await fetch(req, { cache: 'no-cache' });
    if (fresh && fresh.ok && fresh.type === 'basic') {
      cache.put(req.mode === 'navigate' ? 'index.html' : stripSearch(req.url), fresh.clone());
    }
    return fresh;
  } catch {
    const hit =
      (req.mode === 'navigate' && (await cache.match('index.html'))) || (await cache.match(stripSearch(req.url))) || (await cache.match(req, { ignoreSearch: true }));
    return hit || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(IMAGES);
  const hit = await cache.match(req);
  const net = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await net) || Response.error();
}

function stripSearch(u) {
  const url = new URL(u);
  url.search = '';
  return url.href;
}
