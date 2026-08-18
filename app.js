// ====================================================
// APP.JS — Bemor Sahifasi (YANGI DIZAYN BILAN MOS)
// ShifoNavbat — Real-time Queue System
// ====================================================

import { firebaseConfig, VAPID_KEY } from './firebase-config.js';

// === FIREBASE INIT (xatolikni ushlash bilan) ===
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let messaging = null;
try { messaging = firebase.messaging(); } catch(e) { console.warn('FCM yo\'q:', e); }

// === GLOBAL STATE ===
let selectedDoctor   = null;
let selectedDoctorId = null;
let currentFCMToken  = null;

// === DOM ===
const doctorsGrid    = document.getElementById('doctorsGrid');
const queueSection   = document.getElementById('queueSection');
const loadingOverlay = document.getElementById('loadingOverlay');
const nameModal      = document.getElementById('nameModal');
const ticketModal    = document.getElementById('ticketModal');
const headerTime     = document.getElementById('headerTime');

// ====================================================
// ISHGA TUSHIRISH
// ====================================================
window.addEventListener('DOMContentLoaded', async () => {
  startClock();

  // SW va bildirishnoma (xato bo'lsa ham davom et)
  try { await initServiceWorker(); } catch(e) {}
  try { await requestNotificationPermission(); } catch(e) {}

  loadDoctors();
  loadStats();

  // QR scan orqali kirish
  const params   = new URLSearchParams(window.location.search);
  const queueId  = params.get('queue');
  const doctorId = params.get('doctor');
  if (queueId && doctorId) {
    try { await showQueueFromUrl(doctorId, queueId); } catch(e) {}
  }

  // Loading yopish
  setTimeout(() => {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  }, 1000);
});

// ====================================================
// SOAT
// ====================================================
function startClock() {
  function update() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    if (headerTime) headerTime.textContent = `${h}:${m}`;
  }
  update();
  setInterval(update, 1000);
}

// ====================================================
// SERVICE WORKER
// ====================================================
async function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('/sw.js');
  }
}

// ====================================================
// PUSH BILDIRISHNOMA RUXSATI
// ====================================================
async function requestNotificationPermission() {
  if (!messaging) return;
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    const token = await messaging.getToken({ vapidKey: VAPID_KEY });
    currentFCMToken = token;
    console.log('📱 FCM Token:', token?.substring(0, 20) + '...');
  }
}

// Foreground bildirishnomalar
if (messaging) {
  messaging.onMessage((payload) => {
    const { title, body } = payload.notification || {};
    const type = payload.data?.type;
    const icon = type === 'turn' ? '🔔' : type === 'approaching' ? '⏰' : 'ℹ️';
    showToast(icon, title || 'ShifoNavbat', body || '', type === 'turn' ? 'warning' : 'info', 8000);
  });
}

// ====================================================
// STATISTIKA
// ====================================================
function loadStats() {
  db.ref('doctors').on('value', snap => {
    const docs = snap.val() || {};
    const el1 = document.getElementById('totalDoctors');
    const el2 = document.getElementById('totalQueues');
    if (el1) el1.textContent = Object.keys(docs).length;
    let total = 0;
    Object.values(docs).forEach(d => { total += (d.totalQueues || 0); });
    if (el2) el2.textContent = total;
  });
}

// ====================================================
// SHIFOKORLARNI YUKLASH
// ====================================================
function loadDoctors() {
  db.ref('doctors').on('value', (snapshot) => {
    const doctors = snapshot.val();
    if (!doctorsGrid) return;
    doctorsGrid.innerHTML = '';

    if (!doctors || Object.keys(doctors).length === 0) {
      doctorsGrid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-icon">👨‍⚕️</div>
          <p class="empty-text">Hali shifokor qo'shilmagan.<br>Admin panel orqali qo'shing.</p>
          <a href="admin.html" class="btn btn-primary" style="margin-top:16px;">⚙️ Admin Panel</a>
        </div>`;
      return;
    }

    Object.entries(doctors).forEach(([id, doc]) => {
      if (!doc.isActive) return;
      doctorsGrid.appendChild(createDoctorCard(id, doc));
    });
  });
}

// ====================================================
// SHIFOKOR KARTASI (yangi CSS bilan)
// ====================================================
function createDoctorCard(id, doc) {
  const icons = {
    'Nevropatolog':'🧠','Stomatolog':'🦷','Terapevt':'🩺',
    'Kardiolog':'❤️','Pediatr':'👶','Oftalmolog':'👁️',
    'Ortoped':'🦴','Xirurg':'🔬','Umumiy':'👨‍⚕️'
  };

  const icon    = icons[doc.specialty] || '👨‍⚕️';
  const waiting = Math.max(0, (doc.totalQueues || 0) - (doc.currentQueue || 0));
  const card    = document.createElement('div');
  card.className = 'doc-card';
  card.id = `doctor-${id}`;

  card.innerHTML = `
    <div class="doc-status-dot ${doc.isActive ? '' : 'off'}"></div>
    <div class="doc-icon">${icon}</div>
    <div class="doc-name">Dr. ${doc.name}</div>
    <div class="doc-spec">${doc.specialty}${doc.room ? ' · ' + doc.room : ''}</div>
    <div class="doc-footer">
      <span class="doc-waiting">${waiting} kutayotgan</span>
      <span class="doc-num">№${doc.currentQueue || 0}</span>
    </div>`;

  card.addEventListener('click', () => selectDoctor(id, doc));
  return card;
}

// ====================================================
// SHIFOKOR TANLASH
// ====================================================
function selectDoctor(id, doc) {
  // Eski tanlashni olib tashlash
  document.querySelectorAll('.doc-card').forEach(c => c.classList.remove('selected'));
  document.getElementById(`doctor-${id}`)?.classList.add('selected');

  selectedDoctor   = doc;
  selectedDoctorId = id;

  // Section header
  const tag   = document.getElementById('selectedSpecTag');
  const title = document.getElementById('selectedDoctorTitle');
  if (tag)   tag.textContent   = `${doc.specialty}`;
  if (title) title.textContent = `Dr. ${doc.name}`;

  // Queue section ko'rsatish
  if (queueSection) {
    queueSection.classList.add('visible');
    setTimeout(() => {
      queueSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  // Real-time queue
  loadQueueData(id);
}

// ====================================================
// NAVBAT MA'LUMOTLARINI YUKLASH
// ====================================================
function loadQueueData(doctorId) {
  db.ref(`doctors/${doctorId}`).on('value', snap => {
    const doc = snap.val();
    if (!doc) return;

    const current = doc.currentQueue || 0;
    const total   = doc.totalQueues  || 0;
    const waiting = Math.max(0, total - current);

    const elCurrent  = document.getElementById('currentQueueDisplay');
    const elTotal    = document.getElementById('totalQueueCount');
    const elWaiting  = document.getElementById('waitingCount');
    const elNext     = document.getElementById('nextQueueNum');
    const elDocName  = document.getElementById('queueDoctorName');

    if (elCurrent) elCurrent.textContent = current > 0 ? current : '—';
    if (elTotal)   elTotal.textContent   = total;
    if (elWaiting) elWaiting.textContent = waiting;
    if (elNext)    elNext.textContent    = total > 0 ? total + 1 : 1;
    if (elDocName) elDocName.textContent = `DR. ${doc.name?.toUpperCase()}`;
  });

  db.ref(`queues/${doctorId}`).on('value', snap => {
    const queues = snap.val() || {};
    const total  = Object.keys(queues).length;
    const elNext = document.getElementById('nextQueueNum');
    if (elNext)   elNext.textContent = total + 1;
  });
}

// ====================================================
// ISM MODALI OCHISH / YOPISH
// ====================================================
window.openNameModal = function () {
  if (!selectedDoctor) {
    showToast('⚠️', 'Tanlang', 'Avval shifokor tanlang!', 'warning');
    return;
  }
  if (nameModal) nameModal.classList.add('active');
  setTimeout(() => document.getElementById('patientFirstName')?.focus(), 300);
};

window.closeNameModal = function () {
  if (nameModal) nameModal.classList.remove('active');
};

// ENTER bilan yuborish
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.closeNameModal?.();
    window.closeTicketModal?.();
  }
});

// ====================================================
// NAVBAT OLISH — TASDIQLASH
// ====================================================
window.confirmQueue = async function () {
  const firstName = document.getElementById('patientFirstName')?.value.trim();
  const lastName  = document.getElementById('patientLastName')?.value.trim();
  const phone     = document.getElementById('patientPhone')?.value.trim();

  if (!firstName || !lastName) {
    showToast('⚠️', 'To\'ldiring', 'Ism va familya majburiy!', 'warning');
    return;
  }
  if (!selectedDoctorId) {
    showToast('⚠️', 'Tanlang', 'Avval shifokor tanlang!', 'warning');
    return;
  }

  const btn = document.getElementById('confirmQueueBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saqlanmoqda...'; }

  try {
    const fullName = `${firstName} ${lastName}`;
    const now      = new Date();
    const date     = now.toLocaleDateString('uz-UZ');
    const time     = now.toLocaleTimeString('uz-UZ', { hour:'2-digit', minute:'2-digit' });

    // Navbat raqamini olish
    const queueSnap = await db.ref(`queues/${selectedDoctorId}`).once('value');
    const existing  = queueSnap.val() || {};
    const queueNum  = Object.keys(existing).length + 1;

    // Firebase ga yozish
    const newRef = db.ref(`queues/${selectedDoctorId}`).push();
    await newRef.set({
      name: fullName, phone: phone || '',
      queueNumber: queueNum,
      date, time,
      fcmToken: currentFCMToken || '',
      status: 'waiting',
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });

    // Doctor total ni yangilash
    await db.ref(`doctors/${selectedDoctorId}/totalQueues`).set(queueNum);

    // Modal yopish
    window.closeNameModal();

    // Ticket ko'rsatish
    showTicket({
      queueNumber: queueNum,
      name: fullName,
      doctorName: selectedDoctor.name,
      specialty:  selectedDoctor.specialty,
      date, time,
      doctorId:  selectedDoctorId,
      queueId:   newRef.key
    });

    showToast('🎉', 'Navbat Olindi!', `Siz №${queueNum} navbatdasiz`, 'success', 5000);

  } catch (err) {
    console.error('Navbat olishda xato:', err);
    showToast('❌', 'Xato', err.message || 'Qaytadan urinib ko\'ring', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Navbat Olish'; }
  }
};

// ====================================================
// TICKET KO'RSATISH
// ====================================================
function showTicket(data) {
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('ticketNumber', `№${data.queueNumber}`);
  setEl('ticketName',   data.name);
  setEl('ticketDoctor', `${data.specialty} — Dr. ${data.doctorName}`);
  setEl('ticketDate',   data.date);
  setEl('ticketTime',   data.time);

  // QR Code
  const qrUrl     = `${window.location.origin}${window.location.pathname}?doctor=${data.doctorId}&queue=${data.queueId}`;
  const qrWrapper = document.getElementById('qrWrapper');
  if (qrWrapper) {
    qrWrapper.innerHTML = '';
    new QRCode(qrWrapper, {
      text: qrUrl, width: 88, height: 88,
      colorDark: '#111827', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  if (ticketModal) ticketModal.classList.add('active');

  // PNG avtomatik yuklash (1.5 soniyadan keyin)
  setTimeout(() => autoDownload(), 1500);
}

// ====================================================
// TICKET YOPISH
// ====================================================
window.closeTicketModal = function () {
  if (ticketModal) ticketModal.classList.remove('active');
};

// ====================================================
// PNG SAQLASH
// ====================================================
window.downloadTicket = async function () {
  const card = document.getElementById('ticketCard');
  if (!card || typeof html2canvas === 'undefined') return;
  try {
    const canvas = await html2canvas(card, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff'
    });
    const link      = document.createElement('a');
    link.download   = `shifonavbat-navbat-${Date.now()}.png`;
    link.href       = canvas.toDataURL('image/png');
    link.click();
  } catch(e) { console.error('PNG saqlashda xato:', e); }
};

async function autoDownload() {
  try { await window.downloadTicket(); } catch(e) {}
}

// ====================================================
// QR DAN NAVBATNI KO'RSATISH
// ====================================================
async function showQueueFromUrl(doctorId, queueId) {
  const [docSnap, queueSnap] = await Promise.all([
    db.ref(`doctors/${doctorId}`).once('value'),
    db.ref(`queues/${doctorId}/${queueId}`).once('value')
  ]);
  const doc   = docSnap.val();
  const queue = queueSnap.val();
  if (!doc || !queue) return;

  showTicket({
    queueNumber: queue.queueNumber,
    name:        queue.name,
    doctorName:  doc.name,
    specialty:   doc.specialty,
    date:        queue.date,
    time:        queue.time,
    doctorId, queueId
  });
}

// ====================================================
// TOAST BILDIRISHNOMALAR
// ====================================================
function showToast(icon, title, message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div>
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-msg">${message}</div>` : ''}
    </div>`;

  container.appendChild(toast);
  toast.addEventListener('click', () => removeToast(toast));
  setTimeout(() => removeToast(toast), duration);
}

function removeToast(toast) {
  toast.classList.add('hiding');
  setTimeout(() => toast.remove(), 300);
}

// Global uchun
window.showToast = showToast;
