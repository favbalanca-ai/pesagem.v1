// sw.js v3 — Background Sync + cache do app
const CACHE_VERSION = 'fav-v3';
const SYNC_TAG = 'fav-sync-pendentes';
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxvNJutHp0bVC0lZWzmYN_fm5EajV7xBZDu2MJAK_gxVvuAmGUxWx0QAx_M1PIxCRqq-Q/exec";
const TOKEN = "pesagem@fav2024";

// ── INSTALL: ativa imediatamente ─────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
});

// ── ACTIVATE: limpa caches antigos ───────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: sem cache (sempre rede) ───────────────────────────
self.addEventListener('fetch', e => { /* sem cache */ });

// ── BACKGROUND SYNC ──────────────────────────────────────────
self.addEventListener('sync', e => {
  if (e.tag === SYNC_TAG) {
    e.waitUntil(enviarPendentesBackground());
  }
});

async function enviarPendentesBackground() {
  // Ler fila do IndexedDB (salvo pelo app)
  const pend = await lerFila();
  if (!pend || !pend.length) return;

  const enviados = [];
  for (const p of pend) {
    if (p.falhou) continue; // pular os que falharam demais
    try {
      const r = await fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ acao: p.acao, ordem: p.ordem, token: TOKEN })
      });
      const j = await r.json();
      if (j.ok) {
        enviados.push(p.ordem.id);
        // Notificar o app se estiver aberto
        notificarClients(`✅ Pesagem ${p.ordem.placa || p.ordem.id} sincronizada!`, p.ordem.id);
      }
    } catch (e) {
      // Falha de rede — o sistema vai tentar de novo automaticamente
    }
  }

  if (enviados.length > 0) {
    // Remover enviados da fila
    await removerDaFila(enviados);
    // Mostrar notificação push se app estiver fechado
    await mostrarNotificacao(enviados.length);
  }
}

// ── INDEXEDDB — compartilhado entre app e sw ─────────────────
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
      const req = tx.objectStore('pendentes').getAll();
      req.onsuccess = e => res(e.target.result);
      req.onerror = e => rej(e.target.error);
    });
  } catch (e) { return []; }
}

async function removerDaFila(ids) {
  try {
    const db = await abrirDB();
    const tx = db.transaction('pendentes', 'readwrite');
    const store = tx.objectStore('pendentes');
    ids.forEach(id => store.delete(id));
    return new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = e => rej(e.target.error);
    });
  } catch (e) {}
}

// ── NOTIFICAÇÃO para o app aberto ────────────────────────────
async function notificarClients(msg, id) {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => c.postMessage({ tipo: 'sync-ok', msg, id }));
}

// ── NOTIFICAÇÃO PUSH quando app fechado ──────────────────────
async function mostrarNotificacao(qtd) {
  if (Notification.permission !== 'granted') return;
  self.registration.showNotification('Balança Água Viva', {
    body: `${qtd} pesagem(s) sincronizada(s) com a planilha ✅`,
    icon: 'https://raw.githubusercontent.com/favbalanca-ai/pesagem.v1/main/icon.png',
    badge: 'https://raw.githubusercontent.com/favbalanca-ai/pesagem.v1/main/icon.png',
    tag: 'fav-sync',
    renotify: true
  });
}

// ── CLIQUE na notificação: abrir o app ───────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length > 0) { clients[0].focus(); return; }
      self.clients.openWindow('/pesagem.v1/');
    })
  );
});
