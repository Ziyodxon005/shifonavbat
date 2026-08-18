// ====================================================
// SERVICE WORKER — ShifoNavbat
// Background bildirishnomalar + Offline cache
// ====================================================

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyABW-mB-k74CJNUnsPdy39VUUnPy2RZluE",
  authDomain:        "shifo-uz.firebaseapp.com",
  databaseURL:       "https://shifo-uz-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "shifo-uz",
  storageBucket:     "shifo-uz.firebasestorage.app",
  messagingSenderId: "873985603518",
  appId:             "1:873985603518:web:729eb4f7199e89bf456bef"
});

const messaging = firebase.messaging();

// Firebase Realtime DB REST URL (auth shart emas, agar rules "read: true" bo'lsa)
const DB_URL = 'https://shifo-uz-default-rtdb.europe-west1.firebasedatabase.app';

// ====================================================
// INSTALL & ACTIVATE
// ====================================================
self.addEventListener('install', () => {
  console.log('[SW] O\'rnatildi');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Faollashdi');
  event.waitUntil(clients.claim());
});

// ====================================================
// INDEXEDDB — Navbat ma'lumotini saqlash
// (SW da localStorage yo'q, IndexedDB ishlatamiz)
// ====================================================
const IDB_NAME  = 'shifonavbat-db';
const IDB_STORE = 'queue';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbDelete(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ====================================================
// APP.JS DAN XABAR QABUL QILISH
// (Navbat olinganida app.js SW ga xabar yuboradi)
// ====================================================
self.addEventListener('message', async (event) => {
  const { type, payload } = event.data || {};

  // Navbat ma'lumotini saqlash
  if (type === 'SAVE_QUEUE') {
    await idbSet('myQueue', payload);
    console.log('[SW] Navbat saqlandi:', payload);
    try {
      if (self.registration.periodicSync) {
        await self.registration.periodicSync.register('check-queue', {
          minInterval: 60 * 1000
        });
      }
    } catch(e) {}
  }

  if (type === 'CLEAR_QUEUE') {
    await idbDelete('myQueue');
  }

  // ✅ Sahifadan bildirishnoma so'rovi — SW o'zi chiqaradi
  // Chrome Android da sahifadan showNotification() = "kontent berkitildi"
  // SW kontekstidan chaqirilsa = to'g'ri ishlaydi
  if (type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, badge } = event.data;
    await self.registration.showNotification(title || 'ShifoNavbat', {
      body:               body || '',
      icon:               icon  || `${self.location.origin}/icons/icon-192.png`,
      badge:              badge || `${self.location.origin}/icons/icon-72.png`,
      requireInteraction: true,
      vibrate:            [400, 100, 400, 100, 600],
      tag:                'shifo-queue',
      renotify:           true,
      data:               { url: self.location.origin }
    });
  }
});

// ====================================================
// PERIODIC BACKGROUND SYNC
// Android Chrome — sayt yopiq bo'lganda ishlaydi!
// ====================================================
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-queue') {
    event.waitUntil(checkAndNotify());
  }
});

// ====================================================
// NAVBAT TEKSHIRISH + BILDIRISHNOMA
// ====================================================
async function checkAndNotify() {
  try {
    const saved = await idbGet('myQueue');
    if (!saved || !saved.doctorId || !saved.queueNum) return;

    const { doctorId, queueNum, notified3, notifiedTurn } = saved;

    // Firebase REST API orqali joriy navbatni olish
    const res = await fetch(`${DB_URL}/doctors/${doctorId}/currentQueue.json`);
    if (!res.ok) return;

    const currentQueue = await res.json();
    if (currentQueue === null || currentQueue === undefined) return;

    const remaining = queueNum - currentQueue;

    console.log(`[SW] Navbat: sizniki №${queueNum}, hozir №${currentQueue}, qoldi: ${remaining}`);

    // 3 ta qolganda
    if (remaining === 3 && !notified3) {
      await showQueueNotification(
        '⏰ Navbatingiz Yaqinlashdi!',
        `Sizdan oldin ${remaining} kishi qoldi. Tayyor bo'ling!`,
        'approaching'
      );
      await idbSet('myQueue', { ...saved, notified3: true });
    }

    // Keyingi navbat sizda
    if (remaining === 1 && !notifiedTurn) {
      await showQueueNotification(
        '🔔 KEYINGI NAVBAT SIZDA!',
        'Hoziroq kirish xonasiga keling!',
        'turn'
      );
      await idbSet('myQueue', { ...saved, notifiedTurn: true });
    }

    // Navbat allaqachon o'tgan
    if (remaining <= 0) {
      await idbDelete('myQueue');
    }

  } catch(err) {
    console.error('[SW] checkAndNotify xatosi:', err);
  }
}

async function showQueueNotification(title, body, type) {
  return self.registration.showNotification(title, {
    body,
    icon:     '/icons/icon-192.png',
    badge:    '/icons/icon-72.png',
    tag:      `queue-${type}`,
    renotify: true,
    requireInteraction: true,
    vibrate:  [300, 100, 300, 100, 300],
    data:     { type, url: '/' },
    actions: [
      { action: 'open',    title: '🏥 Sahifani ochish' },
      { action: 'dismiss', title: '✕ Yopish' }
    ]
  });
}

// ====================================================
// FCM BACKGROUND MESSAGE (FCM server key bo'lganda)
// ====================================================
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] FCM xabar:', payload);
  const { title, body } = payload.notification || {};
  const type = payload.data?.type || 'info';
  return showQueueNotification(
    title || 'ShifoNavbat',
    body  || 'Navbat haqida yangilik',
    type
  );
});

// ====================================================
// NOTIFICATION CLICK
// ====================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ====================================================
// OFFLINE CACHE
// ====================================================
const CACHE = 'shifonavbat-v3';
const CACHE_FILES = ['/', '/index.html', '/style.css', '/app.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CACHE_FILES).catch(() => {}))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
