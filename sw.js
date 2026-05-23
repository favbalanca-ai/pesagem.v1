// sw.js — limpa tudo e não faz cache
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(k => Promise.all(k.map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => { /* sem cache — sempre busca da rede */ });
