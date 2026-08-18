// ====================================================
// SERVICE WORKER — Push Notifications
// ShifoNavbat Shifoxona Navbat Tizimi
// ====================================================

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Firebase ni service worker ichida ishga tushirish
firebase.initializeApp({
  apiKey: "AIzaSyABW-mB-k74CJNUnsPdy39VUUnPy2RZluE",
  authDomain: "shifo-uz.firebaseapp.com",
  databaseURL: "https://shifo-uz-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "shifo-uz",
  storageBucket: "shifo-uz.firebasestorage.app",
  messagingSenderId: "873985603518",
  appId: "1:873985603518:web:729eb4f7199e89bf456bef",
  measurementId: "G-VK3WXGY918"
});

const messaging = firebase.messaging();

// Background push notification handler
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background xabar keldi:', payload);

  const { title, body, icon, data } = payload.notification || {};

  const notificationOptions = {
    body: body || 'Navbat haqida yangilik bor',
    icon: icon || '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: data?.type || 'queue-notification',
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    data: {
      url: data?.url || '/',
      queueNumber: data?.queueNumber,
      doctorName: data?.doctorName,
      type: data?.type
    },
    actions: [
      {
        action: 'open',
        title: '🏥 Sahifani ochish',
      },
      {
        action: 'dismiss',
        title: '✕ Yopish'
      }
    ]
  };

  // Notification turini aniqlash va maxsus rang berish
  let notifTitle = title || 'ShifoNavbat';
  if (data?.type === 'turn') {
    notifTitle = '🔔 NAVBATINGIZ KELDI!';
  } else if (data?.type === 'approaching') {
    notifTitle = '⏰ Navbatingiz Yaqinlashdi!';
  }

  return self.registration.showNotification(notifTitle, notificationOptions);
});

// Notification bosilganda
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data;
  const url = data?.url || '/';

  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // Mavjud tab topilsa, uni fokusga olamiz
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Yangi tab ochamiz
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  }
});

// Service Worker install va activate
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker o\'rnatildi');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker faollashdi');
  event.waitUntil(clients.claim());
});

// Offline cache (asosiy fayllar)
const CACHE_NAME = 'shifonavbat-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/icons/icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) return response;
      return fetch(event.request);
    })
  );
});
