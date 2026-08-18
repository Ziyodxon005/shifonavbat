// ====================================================
// SERVICE WORKER — ShifoNavbat v5
// Firebase Messaging OLIB TASHLANDI —
// u ichki push eventlar orqali "kontent berkitildi"
// chiqarardi. Endi faqat toza SW ishlatiladi.
// ====================================================

const DB_URL = 'https://shifo-uz-default-rtdb.europe-west1.firebasedatabase.app';
const CACHE = 'shifonavbat-v6';
const CACHE_FILES = ['/index.html', '/style.css', '/app.js'];

// ====================================================
// INSTALL & ACTIVATE
// ====================================================
self.addEventListener('install', (event) => {
  console.log('[SW] v5 o\'rnatildi');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CACHE_FILES).catch(() => { }))
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] v5 faollashdi');
  event.waitUntil(
    // Eski keshlarni o'chirish
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// ====================================================
// PUSH EVENT — Firebase ichki push larini ushlash
// Bu handler bo'lmasa Chrome "Kontent berkitildi" chiqaradi!
// Eski FCM subscription dan kelgan push larni ham ushlaydi.
// ====================================================
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data?.json() ?? {}; } catch (e) { }

    // Agar bizning real xabar bo'lsa — ko'rsatamiz
    if (payload?.notification?.title) {
      await self.registration.showNotification(payload.notification.title, {
        body: payload.notification.body || '',
        icon: `${self.location.origin}/icons/icon-192.png`,
        badge: `${self.location.origin}/icons/icon-72.png`,
        tag: 'push-notification'
      });
      return;
    }

    // Firebase ichki push (keepalive, token refresh) —
    // Ko'rsatmaslik, lekin Chrome fallback ni oldini olish uchun
    // showNotification chaqirib darhol yopamiz
    await self.registration.showNotification(' ', {
      tag: 'push-internal',
      silent: true,
      body: ' '
    });
    const notes = await self.registration.getNotifications({ tag: 'push-internal' });
    notes.forEach(n => n.close());
  })());
});

// sw.js ga qo'shing (fetch listener'dan oldin, istalgan joyga):

self.addEventListener('push', (event) => {
  // Agar real push kelsa ham, hech bo'lmasa to'g'ri ko'rinishda chiqsin
  let title = 'ShifoNavbat';
  let body = '';
  try {
    const data = event.data?.json();
    title = data?.notification?.title || data?.title || title;
    body = data?.notification?.body || data?.body || '';
  } catch (e) { }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: `${self.location.origin}/icons/icon-192.png`,
      badge: `${self.location.origin}/icons/icon-72.png`,
      tag: 'shifo-push'
    })
  );
});

// ====================================================
// INDEXEDDB — Navbat ma'lumotini saqlash
// ====================================================
const IDB_NAME = 'shifonavbat-db';
const IDB_STORE = 'queue';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGet(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbDelete(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ====================================================
// MESSAGE — app.js dan xabarlar
// event.waitUntil() MAJBURIY — aks holda SW o'ladi
// ====================================================
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  // Bildirishnoma chiqarish (sahifa fonda bo'lganda)
  if (type === 'SHOW_NOTIFICATION') {
    const { title, body } = event.data;
    event.waitUntil(
      self.registration.showNotification(title || 'ShifoNavbat', {
        body: body || '',
        icon: `${self.location.origin}/icons/icon-192.png`,
        badge: `${self.location.origin}/icons/icon-72.png`,
        requireInteraction: true,
        vibrate: [400, 100, 400, 100, 600],
        tag: 'shifo-queue',
        renotify: true,
        data: { url: `${self.location.origin}/index.html` }
      })
    );
  }

  if (type === 'SAVE_QUEUE') {
    event.waitUntil(
      idbSet('myQueue', payload).then(() => {
        if (self.registration.periodicSync) {
          return self.registration.periodicSync
            .register('check-queue', { minInterval: 60_000 })
            .catch(() => { });
        }
      })
    );
  }

  if (type === 'CLEAR_QUEUE') {
    event.waitUntil(idbDelete('myQueue'));
  }
});

// ====================================================
// PERIODIC BACKGROUND SYNC — Android Chrome
// Sayt yopiq bo'lganda Firebase REST API tekshiradi
// ====================================================
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-queue') {
    event.waitUntil(checkAndNotify());
  }
});

async function checkAndNotify() {
  try {
    const saved = await idbGet('myQueue');
    if (!saved?.doctorId) return;

    const { doctorId, queueNum, notified3, notifiedTurn } = saved;

    const res = await fetch(`${DB_URL}/doctors/${doctorId}/currentQueue.json`);
    if (!res.ok) return;
    const current = await res.json();
    if (current === null) return;

    const remaining = queueNum - current;

    if (remaining === 0 && !notifiedTurn) {
      await self.registration.showNotification(' NAVBATINGIZ KELDI!', {
        body: 'Hoziroq kirish xonasiga keling!',
        icon: `${self.location.origin}/icons/icon-192.png`,
        badge: `${self.location.origin}/icons/icon-72.png`,
        requireInteraction: true,
        vibrate: [400, 100, 400, 100, 600],
        tag: 'queue-turn',
        data: { url: `${self.location.origin}/index.html` }
      });
      await idbSet('myQueue', { ...saved, notifiedTurn: true });
      return;
    }

    if (remaining === 3 && !notified3) {
      await self.registration.showNotification('⏰ Navbatingiz Yaqinlashdi!', {
        body: `Sizdan oldin ${remaining} kishi qoldi`,
        icon: `${self.location.origin}/icons/icon-192.png`,
        badge: `${self.location.origin}/icons/icon-72.png`,
        requireInteraction: true,
        vibrate: [300, 100, 300],
        tag: 'queue-approaching',
        data: { url: `${self.location.origin}/index.html` }
      });
      await idbSet('myQueue', { ...saved, notified3: true });
    }

    if (remaining <= 0) await idbDelete('myQueue');

  } catch (e) {
    console.error('[SW] checkAndNotify xatosi:', e);
  }
}

// ====================================================
// NOTIFICATION CLICK
// ====================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || self.location.origin;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});

// ====================================================
// FETCH — Offline cache
// ====================================================
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(c => c || fetch(event.request))
  );
});
