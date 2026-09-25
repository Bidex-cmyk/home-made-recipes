const CACHE_NAME = 'home-made-recipe-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

// Only cacheable static assets are intercepted. Everything else passes through untouched.
const CACHEABLE_CDN_HOSTS = ['cdnjs.cloudflare.com'];

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  let url;
  try { url = new URL(event.request.url); } catch (e) { return; }

  const sameOrigin = url.origin === self.location.origin;
  const isCdnAsset = CACHEABLE_CDN_HOSTS.includes(url.hostname);

  // All cross-origin API traffic (Firestore WebChannel, Auth/identitytoolkit,
  // firebaseinstallations, etc.) MUST hit the network directly — serving it from
  // cache corrupts the Firebase SDK channels (INTERNAL ASSERTION failures).
  if (!sameOrigin && !isCdnAsset) return;

  // Hosting-reserved paths (including /__/firebase/init.json) must always be fresh.
  if (sameOrigin && (url.pathname.startsWith('/__/') || url.pathname === '/sw.js')) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && (sameOrigin || isCdnAsset)) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
