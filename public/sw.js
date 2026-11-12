// Service worker: caches the static shell only (hashed build assets, icons, manifest, offline page).
// Never caches API responses, pages, or anything containing settings data.
const VERSION = 'ghsv-shell-v1';
const SHELL = ['/offline.html', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isShellAsset = (url) => url.pathname.startsWith('/_next/static/') || SHELL.includes(url.pathname);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // settings data: always network, never cached

  if (req.mode === 'navigate') {
    // Pages carry settings data, so they are not cached. Offline, show the offline page.
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  if (isShellAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && url.pathname.startsWith('/_next/static/')) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
