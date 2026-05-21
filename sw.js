// SERVICE WORKER v5 — Pesagem PWA
const CACHE = 'pesagem-v5';
const ASSETS = ['/pesagem/', '/pesagem/index.html', '/pesagem/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})).then(()=>self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Nunca interceptar chamadas externas
  if (url.includes('script.google.com') || url.includes('googleapis.com')) return;
  if (url.includes('favicon') || url.includes('icon-')) return;
  if (!url.includes('favbalanca-ai.github.io')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match('/pesagem/index.html')))
  );
});
