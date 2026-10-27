/*
 * Old News web app service worker. Generated into dist/app/sw.js at build time: the placeholders
 * below are replaced with a build version and the precache list from the Vite manifest.
 * It serves this origin's own static files and nothing else. It never contacts any other origin.
 */
const VERSION = __VERSION__;
const PRECACHE = __PRECACHE__;
const SHELL = `on-shell-${VERSION}`;
const RUNTIME = 'on-runtime-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Keep this build's shell and the one before it: a tab that opened the previous build may
      // still be loading its hashed chunks, and deleting them under it would blank the page.
      const shells = (await caches.keys()).filter((k) => k.startsWith('on-shell-'));
      const keep = new Set([SHELL, ...shells.filter((k) => k !== SHELL).slice(-1)]);
      for (const key of shells) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch other origins

  // The app shell: any navigation under /app/ gets the cached page, then the network.
  if (req.mode === 'navigate' && url.pathname.startsWith('/app')) {
    event.respondWith(
      caches
        .match('/app/')
        .then(
          (hit) =>
            hit ||
            fetch(req).catch(() => new Response('Offline', { status: 503, statusText: 'Offline' })),
        ),
    );
    return;
  }

  // Hashed assets, fonts, the optional model: cache first, then fetch once and keep a copy.
  if (
    /^\/(assets|fonts|models|ort|app-icons)\//.test(url.pathname) ||
    url.pathname === '/icon.svg'
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(RUNTIME).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
