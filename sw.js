// sw.js v5 — Offline total: Android + iOS
const CACHE = 'fav-v6';
const SYNC_TAG = 'fav-sync-pendentes';
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxvNJutHp0bVC0lZWzmYN_fm5EajV7xBZDu2MJAK_gxVvuAmGUxWx0QAx_M1PIxCRqq-Q/exec";
const TOKEN = "pesagem@fav2024";

// Recursos essenciais para funcionar offline
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
];

// ── INSTALL: pré-cachear tudo, mas nunca falhar ───────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache =>
        // addAll falha se qualquer recurso falhar; cachear um a um
        Promise.all(
          SHELL.map(url =>
            cache.add(url).catch(() => {
              console.warn('[SW] Não cacheou:', url);
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpar versões antigas e tomar controle ─────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── FETCH: Cache First → garante abertura offline ─────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = req.url;

  // Não interceptar: API Google, wa.me, POST
  if (req.method !== 'GET') return;
  if (url.includes('script.google.com')) return;
  if (url.includes('wa.me')) return;
  if (url.includes('mailto:')) return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true })
      .then(cached => {
        // Tem cache → entregar imediatamente (offline-first)
        if (cached) {
          // Atualizar cache em background (sem bloquear)
          fetch(req).then(res => {
            if (res && res.ok) {
              caches.open(CACHE).then(c => c.put(req, res));
            }
          }).catch(() => {});
          return cached;
        }

        // Sem cache → tentar rede
        return fetch(req)
          .then(res => {
            if (!res || !res.ok) return res;
            // Cachear resposta nova
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
            return res;
          })
          .catch(() => {
            // Sem rede e sem cache → fallback para index.html
            if (req.destination === 'document' || req.mode === 'navigate') {
              return caches.match('./index.html');
            }
            // Para outros recursos (fontes, scripts), retornar 503 silencioso
            return new Response('', { status: 503, statusText: 'Offline' });
          });
      })
  );
});

// ── BACKGROUND SYNC (Android) ─────────────────────────────────
self.addEventListener('sync', e => {
  if (e.tag === SYNC_TAG) e.waitUntil(syncBackground());
});

async function syncBackground() {
  const pend = await lerFila();
  if (!pend || !pend.length) return;

  const enviados = [];
  for (const p of pend) {
    if (p.falhou) continue;
    try {
      const r = await fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ acao: p.acao, ordem: p.ordem, token: TOKEN })
      });
      const j = await r.json();
      if (j.ok) {
        enviados.push(p.ordem.id);
        notificarClients(`✅ ${p.ordem.placa || p.ordem.id} sincronizada!`, p.ordem.id);
      }
    } catch (_) {}
  }

  if (enviados.length > 0) {
    await removerDaFila(enviados);
    mostrarNotificacao(enviados.length);
  }
}

// ── INDEXEDDB ─────────────────────────────────────────────────
function abrirDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('fav-pesagem', 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('pendentes', { keyPath: 'id' });
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}
async function lerFila() {
  try {
    const db = await abrirDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('pendentes', 'readonly');
      const r = tx.objectStore('pendentes').getAll();
      r.onsuccess = e => res(e.target.result);
      r.onerror = e => rej(e.target.error);
    });
  } catch (_) { return []; }
}
async function removerDaFila(ids) {
  try {
    const db = await abrirDB();
    const tx = db.transaction('pendentes', 'readwrite');
    const s = tx.objectStore('pendentes');
    ids.forEach(id => s.delete(id));
    return new Promise(res => { tx.oncomplete = res; });
  } catch (_) {}
}

// ── NOTIFICAÇÕES ──────────────────────────────────────────────
async function notificarClients(msg, id) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(c => c.postMessage({ tipo: 'sync-ok', msg, id }));
}
async function mostrarNotificacao(qtd) {
  if (Notification.permission !== 'granted') return;
  self.registration.showNotification('Balança Água Viva', {
    body: `${qtd} pesagem(s) sincronizada(s) ✅`,
    icon: './icon.png',
    tag: 'fav-sync',
    renotify: true
  });
}
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
