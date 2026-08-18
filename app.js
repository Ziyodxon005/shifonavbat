// ====================================================
// APP.JS — Bemor Sahifasi
// ShifoNavbat — Real-time Queue System
// ====================================================

import { firebaseConfig, VAPID_KEY } from './firebase-config.js';

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let messaging = null;
try { messaging = firebase.messaging(); } catch(e) {}

let selectedDoctor   = null;
let selectedDoctorId = null;
let currentFCMToken  = null;
let myQueueNumber    = null;  // Bemorning o'z navbat raqami
let myDoctorId       = null;  // Bemorning shifokor ID si

// DOM
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
  try { await initServiceWorker(); } catch(e) {}
  try { await requestNotificationPermission(); } catch(e) {}
  loadDoctors();

  // QR scan orqali
  const params = new URLSearchParams(window.location.search);
  if (params.get('queue') && params.get('doctor')) {
    try { await showQueueFromUrl(params.get('doctor'), params.get('queue')); } catch(e) {}
  }

  // localStorage dan navbat ma'lumoti (sayt qayta ochilsa)
  restoreMyQueue();

  setTimeout(() => {
    loadingOverlay?.classList.add('hidden');
  }, 900);
});

// ====================================================
// SOAT
// ====================================================
function startClock() {
  const update = () => {
    const now = new Date();
    if (headerTime) headerTime.textContent =
      `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  };
  update(); setInterval(update, 1000);
}

// ====================================================
// SERVICE WORKER
// ====================================================
async function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.register('/sw.js');
    console.log('✅ SW ro\'yxatdan o\'tdi');
    return reg;
  }
}

// ====================================================
// BILDIRISHNOMA RUXSATI
// ====================================================
async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return;

  if (messaging) {
    try {
      const token = await messaging.getToken({ vapidKey: VAPID_KEY });
      currentFCMToken = token;
      console.log('📱 FCM Token olindi');
    } catch(e) {
      console.warn('FCM token xatosi:', e.message);
    }
  }
}

// Foreground xabarlar
if (messaging) {
  messaging.onMessage(payload => {
    const { title, body } = payload.notification || {};
    const type = payload.data?.type;
    showToast(
      type === 'turn' ? '🔔' : '⏰',
      title || 'ShifoNavbat',
      body || '',
      type === 'turn' ? 'warning' : 'info',
      8000
    );
  });
}

// ====================================================
// DB-BASED BILDIRISHNOMALAR (FCM server key shart emas)
// ====================================================
function watchMyQueue(doctorId, queueNum) {
  myQueueNumber = queueNum;
  myDoctorId    = doctorId;

  // localStorage ga saqlash
  localStorage.setItem('myQueue', JSON.stringify({ doctorId, queueNum }));

  // Shifokorning joriy navbatini kuzatish
  db.ref(`doctors/${doctorId}/currentQueue`).on('value', snap => {
    const current = snap.val() || 0;
    const remaining = queueNum - current;

    if (remaining <= 0) return; // Allaqachon o'tgan

    // 3 ta qolganda
    if (remaining === 3) {
      showNativeNotification('⏰ Navbatingiz Yaqinlashdi!',
        `Sizdan oldin ${remaining} kishi qoldi. Tayyor bo'ling!`);
      showToast('⏰', 'Navbatingiz Yaqinlashdi!',
        `Sizdan oldin ${remaining} kishi qoldi`, 'warning', 8000);
    }

    // Navbat kelganda
    if (remaining === 1) {
      showNativeNotification('🔔 KEYINGI NAVBAT SIZDA!',
        `Dr. ${selectedDoctor?.name || ''}. Hoziroq kiring!`);
      showToast('🔔', 'Navbatingiz keldi!',
        'Hoziroq kirish xonasiga keling!', 'warning', 12000);
    }
  });
}

function restoreMyQueue() {
  try {
    const saved = localStorage.getItem('myQueue');
    if (saved) {
      const { doctorId, queueNum } = JSON.parse(saved);
      watchMyQueue(doctorId, queueNum);
    }
  } catch(e) {}
}

function showNativeNotification(title, body) {
  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      requireInteraction: true,
      vibrate: [200, 100, 200]
    });
  }
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
// SHIFOKOR KARTASI
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
  document.querySelectorAll('.doc-card').forEach(c => c.classList.remove('selected'));
  document.getElementById(`doctor-${id}`)?.classList.add('selected');

  selectedDoctor   = doc;
  selectedDoctorId = id;

  const tag   = document.getElementById('selectedSpecTag');
  const title = document.getElementById('selectedDoctorTitle');
  if (tag)   tag.textContent   = doc.specialty;
  if (title) title.textContent = `Dr. ${doc.name}`;

  queueSection?.classList.add('visible');
  setTimeout(() => queueSection?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  loadQueueData(id);
}

// ====================================================
// NAVBAT MA'LUMOTLARI
// ====================================================
function loadQueueData(doctorId) {
  db.ref(`doctors/${doctorId}`).on('value', snap => {
    const doc = snap.val(); if (!doc) return;
    const current = doc.currentQueue || 0;
    const total   = doc.totalQueues  || 0;
    const waiting = Math.max(0, total - current);

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('currentQueueDisplay', current > 0 ? current : '—');
    set('totalQueueCount',  total);
    set('waitingCount',     waiting);
    set('queueDoctorName',  `DR. ${doc.name?.toUpperCase()}`);
  });

  db.ref(`queues/${doctorId}`).on('value', snap => {
    const q = snap.val() || {};
    const el = document.getElementById('nextQueueNum');
    if (el) el.textContent = Object.keys(q).length + 1;
  });
}

// ====================================================
// NAVBAT OLISH — MODAL
// ====================================================
window.openNameModal = function () {
  if (!selectedDoctor) {
    showToast('⚠️', 'Tanlang', 'Avval shifokor tanlang!', 'warning');
    return;
  }
  nameModal?.classList.add('active');
  setTimeout(() => document.getElementById('patientFirstName')?.focus(), 300);
};

window.closeNameModal = function () {
  nameModal?.classList.remove('active');
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    window.closeNameModal?.();
    window.closeTicketModal?.();
  }
});

// ====================================================
// NAVBAT TASDIQLASH
// ====================================================
window.confirmQueue = async function () {
  const first  = document.getElementById('patientFirstName')?.value.trim();
  const last   = document.getElementById('patientLastName')?.value.trim();
  const phone  = document.getElementById('patientPhone')?.value.trim();

  if (!first || !last) {
    showToast('⚠️', 'To\'ldiring', 'Ism va familya majburiy!', 'warning'); return;
  }
  if (!selectedDoctorId) {
    showToast('⚠️', 'Tanlang', 'Avval shifokor tanlang!', 'warning'); return;
  }

  const btn = document.getElementById('confirmQueueBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Saqlanmoqda...'; }

  try {
    const fullName = `${first} ${last}`;
    const now      = new Date();
    const date     = now.toLocaleDateString('uz-UZ');
    const time     = now.toLocaleTimeString('uz-UZ', { hour:'2-digit', minute:'2-digit' });

    // Navbat raqami
    const snap = await db.ref(`queues/${selectedDoctorId}`).once('value');
    const queueNum = Object.keys(snap.val() || {}).length + 1;

    // Firebase ga yozish
    const newRef = db.ref(`queues/${selectedDoctorId}`).push();
    await newRef.set({
      name: fullName, phone: phone || '',
      queueNumber: queueNum, date, time,
      fcmToken: currentFCMToken || '',
      status: 'waiting',
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });

    await db.ref(`doctors/${selectedDoctorId}/totalQueues`).set(queueNum);

    window.closeNameModal();

    // Navbatni kuzatishni boshlash (DB-based notification)
    watchMyQueue(selectedDoctorId, queueNum);

    showTicket({
      queueNumber: queueNum,
      name:       fullName,
      doctorName: selectedDoctor.name,
      specialty:  selectedDoctor.specialty,
      date, time,
      doctorId:   selectedDoctorId,
      queueId:    newRef.key
    });

    showToast('🎉', 'Navbat Olindi!', `Siz №${queueNum} navbatdasiz`, 'success', 5000);

  } catch (err) {
    showToast('❌', 'Xato', err.message || 'Qaytadan urinib ko\'ring', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Navbat Olish'; }
  }
};

// ====================================================
// TICKET KO'RSATISH
// ====================================================
let currentTicketData = null;

function showTicket(data) {
  currentTicketData = data;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('ticketNumber', `№${data.queueNumber}`);
  set('ticketName',   data.name);
  set('ticketDoctor', `${data.specialty} — Dr. ${data.doctorName}`);
  set('ticketDate',   data.date);
  set('ticketTime',   data.time);

  // QR Code
  const qrUrl = `${window.location.origin}${window.location.pathname}?doctor=${data.doctorId}&queue=${data.queueId}`;
  const qrWrapper = document.getElementById('qrWrapper');
  if (qrWrapper) {
    qrWrapper.innerHTML = '';
    new QRCode(qrWrapper, {
      text: qrUrl, width: 88, height: 88,
      colorDark: '#111827', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  ticketModal?.classList.add('active');
}

window.closeTicketModal = function () {
  ticketModal?.classList.remove('active');
};

// ====================================================
// TICKET PNG — Canvas API bilan chiroyli chizish
// ====================================================
window.downloadTicket = async function () {
  if (!currentTicketData) return;
  const data = currentTicketData;

  const W = 420, H = 600;
  const canvas = document.createElement('canvas');
  canvas.width  = W * 2;  // Retina
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // — Soya —
  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur  = 24;
  ctx.shadowOffsetY = 4;

  // — Oq karta fon —
  roundRect(ctx, 10, 10, W - 20, H - 20, 20);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // — Indigo header —
  const headerH = 90;
  ctx.save();
  roundRect(ctx, 10, 10, W - 20, headerH, { tl:20, tr:20, bl:0, br:0 });
  const grad = ctx.createLinearGradient(10, 10, W - 10, headerH + 10);
  grad.addColorStop(0, '#4f46e5');
  grad.addColorStop(1, '#7c3aed');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // — Logo emoji —
  ctx.font = '28px serif';
  ctx.textAlign = 'left';
  ctx.fillText('🏥', 28, 56);

  // — Brand nomi —
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = 'bold 18px Inter, Arial, sans-serif';
  ctx.fillText('ShifoNavbat', 64, 48);

  // — Quyi taglik —
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '11px Inter, Arial, sans-serif';
  ctx.fillText('Shifoxona Onlayn Navbat Tizimi', 64, 65);

  // — Navbat label —
  ctx.fillStyle = '#9ca3af';
  ctx.font = '700 10px Inter, Arial, sans-serif';
  ctx.letterSpacing = '1px';
  ctx.fillText('NAVBAT RAQAMI', 28, 122);

  // — Katta navbat raqami —
  ctx.fillStyle = '#111827';
  ctx.font = '900 72px Inter, Arial, sans-serif';
  ctx.fillText(`№${data.queueNumber}`, 28, 198);

  // — Bemor ismi —
  ctx.fillStyle = '#111827';
  ctx.font = '700 17px Inter, Arial, sans-serif';
  ctx.fillText(data.name, 28, 232);

  // — Shifokor —
  ctx.fillStyle = '#6b7280';
  ctx.font = '400 13px Inter, Arial, sans-serif';
  ctx.fillText(`${data.specialty} — Dr. ${data.doctorName}`, 28, 252);

  // — Chiziq (dashed) —
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(28, 272);
  ctx.lineTo(W - 28, 272);
  ctx.stroke();
  ctx.setLineDash([]);

  // — Sana va vaqt —
  ctx.fillStyle = '#6b7280';
  ctx.font = '500 12px Inter, Arial, sans-serif';
  ctx.fillText(`📅  ${data.date}`, 28, 296);
  ctx.fillText(`🕐  ${data.time}`, 160, 296);

  // — QR code —
  const qrCanvas = document.querySelector('#qrWrapper canvas');
  if (qrCanvas) {
    const qrSize = 110;
    const qrX = W - qrSize - 28;
    const qrY = 310;

    // QR fon
    ctx.fillStyle = '#f9fafb';
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    roundRect(ctx, qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 8);
    ctx.fill(); ctx.stroke();

    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('QR ni skanerlang', qrX + qrSize/2, qrY + qrSize + 18);
    ctx.textAlign = 'left';
  }

  // — Pastki ma'lumot —
  ctx.fillStyle = '#6b7280';
  ctx.font = '12px Inter, Arial, sans-serif';
  ctx.fillText('Navbatga kelmasa, o\'rni berilmaydi.', 28, 360);

  // — Footer bar —
  roundRect(ctx, 10, H - 54, W - 20, 44, { tl:0, tr:0, bl:20, br:20 });
  ctx.fillStyle = '#f9fafb';
  ctx.fill();

  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ShifoNavbat © 2026 — Sog\'ligingizga e\'tiborli bo\'ling!', W / 2, H - 28);
  ctx.textAlign = 'left';

  // — Yuklab olish —
  const link    = document.createElement('a');
  link.download = `navbat-${data.queueNumber}-${data.name.replace(/\s/g,'-')}.png`;
  link.href     = canvas.toDataURL('image/png');
  link.click();
};

// Canvas yordamchi — rounded rect
function roundRect(ctx, x, y, w, h, r) {
  if (typeof r === 'number') r = { tl:r, tr:r, bl:r, br:r };
  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + w - r.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
  ctx.lineTo(x + w, y + h - r.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
  ctx.lineTo(x + r.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.quadraticCurveTo(x, y, x + r.tl, y);
  ctx.closePath();
}

// ====================================================
// QR DAN NAVBAT TIKLANISH
// ====================================================
async function showQueueFromUrl(doctorId, queueId) {
  const [dSnap, qSnap] = await Promise.all([
    db.ref(`doctors/${doctorId}`).once('value'),
    db.ref(`queues/${doctorId}/${queueId}`).once('value')
  ]);
  const doc = dSnap.val(), q = qSnap.val();
  if (!doc || !q) return;

  showTicket({
    queueNumber: q.queueNumber, name: q.name,
    doctorName:  doc.name,     specialty: doc.specialty,
    date: q.date, time: q.time, doctorId, queueId
  });
}

// ====================================================
// TOAST
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
window.showToast = showToast;
