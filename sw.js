const CACHE='pesagem-v8';
const ASSETS=['/pesagem.v1/','/pesagem.v1/index.html','/pesagem.v1/manifest.json'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS).catch(()=>{})).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(k=>Promise.all(k.map(x=>caches.delete(x)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const u=e.request.url;
  if(u.includes('script.google.com')||u.includes('googleapis.com')||u.includes('fonts.g')||u.includes('api.anthropic.com'))return;
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)||new Response('',{status:404})));
});
