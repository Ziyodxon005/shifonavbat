// ====================================================
// ADMIN.JS — Admin Panel Logikasi
// ShifoNavbat — Real-time Queue System
// ====================================================

import { firebaseConfig, VAPID_KEY } from './firebase-config.js';

// === FIREBASE INIT ===
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const messaging = firebase.messaging();

// === CONSTANTS ===
const SPECIALTIES = [
  { name: 'Nevropatolog', icon: '🧠' },
  { name: 'Stomatolog', icon: '🦷' },
  { name: 'Terapevt', icon: '🩺' },
  { name: 'Kardiolog', icon: '❤️' },
  { name: 'Pediatr', icon: '👶' },
  { name: 'Oftalmolog', icon: '👁️' },
  { name: 'Ortoped', icon: '🦴' },
  { name: 'Xirurg', icon: '🔬' },
  { name: 'Umumiy', icon: '👨‍⚕️' },
];

const SPECIALTY_GRADIENTS = {
  'Nevropatolog': 'linear-gradient(135deg, rgba(108,99,255,0.4), rgba(6,182,212,0.4))',
  'Stomatolog': 'linear-gradient(135deg, rgba(244,114,182,0.4), rgba(139,92,246,0.4))',
  'Terapevt': 'linear-gradient(135deg, rgba(16,185,129,0.4), rgba(6,182,212,0.4))',
  'Kardiolog': 'linear-gradient(135deg, rgba(239,68,68,0.4),   rgba(245,158,11,0.4))',
  'Pediatr': 'linear-gradient(135deg, rgba(6,182,212,0.4),   rgba(59,130,246,0.4))',
  'Oftalmolog': 'linear-gradient(135deg, rgba(245,158,11,0.4),  rgba(16,185,129,0.4))',
  'Ortoped': 'linear-gradient(135deg, rgba(139,92,246,0.4),  rgba(244,114,182,0.4))',
  'Xirurg': 'linear-gradient(135deg, rgba(59,130,246,0.4),  rgba(108,99,255,0.4))',
  'Umumiy': 'linear-gradient(135deg, rgba(107,114,128,0.4), rgba(75,85,99,0.4))',
};

// === GLOBAL STATE ===
let selectedSpecialty = '';
let confirmCallback = null;
let allDoctors = {};
let allQueues = {};

// ====================================================
// FCM SERVER KEY — Firebase Console dan oling:
// Project Settings → Cloud Messaging →
// "Cloud Messaging API (Legacy)" → Server key
// ====================================================
const FCM_SERVER_KEY = 'SIZNING_SERVER_KEYINGIZ_BU_YERGA';


// ====================================================
// ISHGA TUSHIRISH
// ====================================================
window.addEventListener('DOMContentLoaded', async () => {
  startClock();
  buildSpecialtyGrid();
  initFirebaseListeners();
  await requestAdminNotification();
});

// ====================================================
// SOAT
// ====================================================
function startClock() {
  function update() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('headerTime').textContent = `${h}:${m}`;
  }
  update();
  setInterval(update, 1000);
}

window.switchSec = function (sectionId, el) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(i => i.classList.remove('active'));
  document.getElementById(`sec-${sectionId}`)?.classList.add('active');
  el?.classList.add('active');
};

// ====================================================
// MUTAXASSISLIK GRID
// ====================================================
function buildSpecialtyGrid() {
  const grid = document.getElementById('specialtyGrid');
  grid.innerHTML = '';
  SPECIALTIES.forEach(({ name, icon }) => {
    const chip = document.createElement('div');
    chip.className = 'spec-chip';
    chip.innerHTML = `${icon} ${name}`;
    chip.onclick = () => {
      document.querySelectorAll('.spec-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      selectedSpecialty = name;
      document.getElementById('selectedSpecialty').value = name;
    };
    grid.appendChild(chip);
  });
}

// ====================================================
// FIREBASE LISTENERS
// ====================================================
function initFirebaseListeners() {
  // Shifokorlar
  db.ref('doctors').on('value', snap => {
    allDoctors = snap.val() || {};
    renderDashboard();
    renderAdminDoctors();
    renderQueuesSection();
  });

  // Navbatlar
  db.ref('queues').on('value', snap => {
    allQueues = snap.val() || {};
    renderDashboard();
    renderQueuesSection();
  });
}

// ====================================================
// DASHBOARD
// ====================================================
function renderDashboard() {
  const doctorList = Object.values(allDoctors);
  const activeDoctors = doctorList.filter(d => d.isActive);

  let totalQ = 0, waitingQ = 0, doneQ = 0;

  Object.entries(allQueues).forEach(([docId, queues]) => {
    Object.values(queues).forEach(q => {
      totalQ++;
      if (q.status === 'done') doneQ++;
      else waitingQ++;
    });
  });

  document.getElementById('dashDoctors').textContent = activeDoctors.length;
  document.getElementById('dashTotal').textContent = totalQ;
  document.getElementById('dashWaiting').textContent = waitingQ;
  document.getElementById('dashDone').textContent = doneQ;

  const statusEl = document.getElementById('realtimeStatus');
  if (activeDoctors.length === 0) {
    statusEl.innerHTML = `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">Hozircha ma'lumot yo'q</div>`;
    return;
  }

  statusEl.innerHTML = activeDoctors.map(doc => {
    const icon = SPECIALTIES.find(s => s.name === doc.specialty)?.icon || '👨‍⚕️';
    const waiting = Math.max(0, (doc.totalQueues || 0) - (doc.currentQueue || 0));
    const percent = doc.totalQueues > 0 ? ((doc.currentQueue || 0) / doc.totalQueues * 100).toFixed(0) : 0;
    return `
      <div class="rt-item">
        <div class="rt-icon">${icon}</div>
        <div class="rt-info">
          <div class="rt-name">Dr. ${doc.name} <span style="font-size:11px;color:var(--text-4);font-weight:400;">${doc.specialty}</span></div>
          <div class="rt-bar-bg"><div class="rt-bar" style="width:${percent}%;"></div></div>
        </div>
        <div class="rt-nums">
          <div class="rt-main">${doc.currentQueue || 0} / ${doc.totalQueues || 0}</div>
          <div class="rt-sub">${waiting} kutayotgan</div>
        </div>
      </div>`;
  }).join('');
}

// ====================================================
// SHIFOKORLAR RO'YXATI (Admin)
// ====================================================
function renderAdminDoctors() {
  const list = document.getElementById('adminDoctorsList');
  const doctors = Object.entries(allDoctors);

  if (doctors.length === 0) {
    list.innerHTML = `
      <div style="text-align:center; padding:60px 20px;">
        <div style="font-size:48px; margin-bottom:12px;">👨‍⚕️</div>
        <p style="color:var(--text-muted);">Hali shifokor qo'shilmagan</p>
        <button class="btn btn-primary" style="margin-top:16px;"
          onclick="switchSection('addDoctor', document.querySelector('[data-section=addDoctor]'))">
          ➕ Shifokor Qo'shish
        </button>
      </div>`;
    return;
  }

  list.innerHTML = doctors.map(([id, doc]) => {
    const icon = SPECIALTIES.find(s => s.name === doc.specialty)?.icon || '👨‍⚕️';
    const waiting = Math.max(0, (doc.totalQueues || 0) - (doc.currentQueue || 0));
    return `
      <div class="doctor-row">
        <div class="dr-icon">${icon}</div>
        <div class="dr-info">
          <div class="dr-name">Dr. ${doc.name}</div>
          <div class="dr-spec">${doc.specialty}${doc.room ? ' · Kab: ' + doc.room : ''}${doc.hours ? ' · ' + doc.hours : ''}</div>
        </div>
        <div class="dr-stats">
          <div class="drs-item"><div class="drs-val">${doc.currentQueue || 0}</div><div class="drs-lbl">Joriy</div></div>
          <div class="drs-item"><div class="drs-val">${doc.totalQueues || 0}</div><div class="drs-lbl">Jami</div></div>
          <div class="drs-item"><div class="drs-val">${waiting}</div><div class="drs-lbl">Kutayotgan</div></div>
        </div>
        <div class="dr-actions">
          <label class="toggle-switch">
            <input type="checkbox" ${doc.isActive ? 'checked' : ''} onchange="toggleDoctorActive('${id}',this.checked)"/>
            <span class="toggle-slider"></span>
          </label>
          <button class="btn btn-danger btn-sm" onclick="confirmDelete('${id}','Dr. ${doc.name}')">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

// ====================================================
// NAVBATLAR BO'LIMI
// ====================================================
function renderQueuesSection() {
  const container = document.getElementById('queuesContainer');
  const doctors = Object.entries(allDoctors);

  if (doctors.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px;">
        <div style="font-size:48px; margin-bottom:12px;">🎫</div>
        <p style="color:var(--text-muted);">Hali navbat mavjud emas</p>
      </div>`;
    return;
  }

  container.innerHTML = doctors.map(([docId, doc]) => {
    const icon = SPECIALTIES.find(s => s.name === doc.specialty)?.icon || '👨‍⚕️';
    const docQueues = allQueues[docId] ? Object.entries(allQueues[docId]) : [];
    const sortedQueues = docQueues.sort((a, b) => a[1].queueNumber - b[1].queueNumber);
    const current = doc.currentQueue || 0;
    const waiting = sortedQueues.filter(([, q]) => q.queueNumber > current).length;

    const tableRows = sortedQueues.map(([qId, q]) => {
      const isCurrent = q.queueNumber === current;
      const isDone = q.queueNumber < current || q.status === 'done';
      const rowClass = isCurrent ? 'current-row' : isDone ? 'done-row' : '';

      return `
        <tr class="${rowClass}">
          <td class="q-num-cell">№${q.queueNumber}${isCurrent ? '<span class="badge badge-green" style="margin-left:6px;font-size:9px;">Joriy</span>' : ''}</td>
          <td style="font-weight:600;color:var(--text-1);">${q.name}</td>
          <td>${q.phone || '—'}</td>
          <td>${q.time || '—'}</td>
          <td><span class="badge ${isCurrent ? 'badge-green' : isDone ? 'badge-default' : 'badge-yellow'}">${isCurrent ? '✅ Kiribdi' : isDone ? '✓ Tugadi' : '⏳ Kutmoqda'}</span></td>
          <td><button class="btn btn-danger btn-sm" style="padding:5px 8px;" onclick="removeQueue('${docId}','${qId}','${doc.name}')">🗑️</button></td>
        </tr>`;
    }).join('');

    const nextNum = current + 1;
    const nextPatient = sortedQueues.find(([, q]) => q.queueNumber === nextNum)?.[1];

    return `
      <div class="queue-panel">
        <div class="qp-head" onclick="togglePanel('panel-${docId}')">
          <div class="qp-title">
            <span style="font-size:20px;">${icon}</span>
            <span>Dr. ${doc.name}</span>
            <span class="badge badge-accent" style="font-size:10px;">${doc.specialty}</span>
          </div>
          <div class="qp-meta">
            <span>Joriy: <strong style="color:var(--text-1);">№${current}</strong></span>
            <span class="badge badge-yellow">${waiting} kutayotgan</span>
            <span id="toggle-${docId}">▼</span>
          </div>
        </div>
        <div class="qp-body" id="panel-${docId}">
          ${sortedQueues.length > 0 ? `
            <div class="table-wrap">
              <table class="q-table">
                <thead><tr>
                  <th>Navbat №</th><th>Ism Familya</th>
                  <th>Telefon</th><th>Vaqt</th><th>Holat</th><th></th>
                </tr></thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>` : `<div style="padding:28px;text-align:center;color:var(--text-4);font-size:13px;">Hali navbat yo'q</div>`}
          <div class="next-bar">
            <div>
              <div class="nb-label">Navbatga chaqirish</div>
              <div class="nb-val">№${nextNum}${nextPatient ? ' — <span style="color:var(--text-3);font-size:14px;font-weight:500;">' + nextPatient.name + '</span>' : ''}</div>
            </div>
            <button class="btn btn-success" onclick="callNextQueue('${docId}',${nextNum},${JSON.stringify(nextPatient || null).replace(/"/g, '&quot;')})">
              📢 Keyingi №${nextNum}
            </button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ====================================================
// PANEL TOGGLE
// ====================================================
window.togglePanel = function (panelId) {
  const panel = document.getElementById(panelId);
  const docId = panelId.replace('panel-', '');
  const icon = document.getElementById(`toggle-${docId}`);
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    icon.textContent = '▼';
  } else {
    panel.style.display = 'none';
    icon.textContent = '▶';
  }
};

// ====================================================
// KEYINGI NAVBATNI CHAQIRISH
// ====================================================
window.callNextQueue = async function (doctorId, nextNum, nextPatient) {
  const doc = allDoctors[doctorId];
  if (!doc) return;

  const total = doc.totalQueues || 0;
  if (nextNum > total) {
    showToast('ℹ️', 'Navbat tugadi', 'Barcha bemorlar qabul qilindi', 'info');
    return;
  }

  try {
    // Joriy navbatni yangilash
    await db.ref(`doctors/${doctorId}/currentQueue`).set(nextNum);

    // Navbat statusini yangilash
    if (nextPatient) {
      const docQueues = allQueues[doctorId] || {};
      const qEntry = Object.entries(docQueues).find(([, q]) => q.queueNumber === nextNum);
      if (qEntry) {
        await db.ref(`queues/${doctorId}/${qEntry[0]}/status`).set('done');
      }
    }

    showToast('📢', `№${nextNum} Chaqirildi!`,
      nextPatient ? `${nextPatient.name} — kiring!` : 'Keyingi bemor', 'success', 4000);

    // FCM xabarlar yuborish
    await sendQueueNotifications(doctorId, nextNum, doc);

  } catch (err) {
    console.error('Navbat o\'zgartirishda xato:', err);
    showToast('❌', 'Xato', err.message, 'error');
  }
};

// ====================================================
// FCM BILDIRISHNOMALAR YUBORISH
// ====================================================
async function sendQueueNotifications(doctorId, currentNum, doc) {
  const docQueues = allQueues[doctorId] || {};

  for (const [qId, q] of Object.entries(docQueues)) {
    if (!q.fcmToken) continue;

    const remaining = q.queueNumber - currentNum;

    // 3 ta qolganda bildirishnoma
    if (remaining === 3 && !q.notified3) {
      await sendFCMToToken(q.fcmToken, {
        title: '⏰ Navbatingiz Yaqinlashdi!',
        body: `Dr. ${doc.name} qabuli. Sizdan oldin ${remaining} kishi qoldi.`,
        type: 'approaching',
        queueNumber: String(q.queueNumber),
        doctorName: doc.name,
        url: `${window.location.origin}/index.html?doctor=${doctorId}&queue=${qId}`
      });
      await db.ref(`queues/${doctorId}/${qId}/notified3`).set(true);
    }

    // Navbat kelganda — joriy navbat shu bemor bo'lganda
    if (remaining === 0 && !q.notifiedTurn) {
      await sendFCMToToken(q.fcmToken, {
        title: '🔔 NAVBATINGIZ KELDI!',
        body: `Dr. ${doc.name} qabuliga kiring. Navbat: №${q.queueNumber}`,
        type: 'turn',
        queueNumber: String(q.queueNumber),
        doctorName: doc.name,
        url: `${window.location.origin}/index.html?doctor=${doctorId}&queue=${qId}`
      });
      await db.ref(`queues/${doctorId}/${qId}/notifiedTurn`).set(true);
    }
  }
}

// ====================================================
// FCM LEGACY HTTP API — Haqiqiy Push Notification
// Sayt yopiq bo'lsa ham ishlaydi!
// ====================================================
async function sendFCMToToken(token, data) {
  // Agar server key yo'q bo'lsa — DB yozib qo'yamiz (fallback)
  if (!FCM_SERVER_KEY || FCM_SERVER_KEY.includes('SIZNING')) {
    console.warn('FCM Server Key kiritilmagan! DB fallback ishlatilmoqda.');
    await db.ref('notifications').push({
      token, title: data.title, body: data.body,
      type: data.type, data: data,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    return;
  }

  try {
    // FCM Legacy HTTP API — to'g'ridan push yuborish
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${FCM_SERVER_KEY}`
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title: data.title,
          body: data.body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-72.png',
          click_action: data.url || '/'
        },
        data: {
          type: data.type,
          url: data.url || '/',
          queueNumber: data.queueNumber,
          doctorName: data.doctorName
        },
        priority: 'high'
      })
    });

    const result = await response.json();
    if (result.success === 1) {
      console.log('✅ FCM yuborildi:', data.title);
    } else {
      console.warn('FCM xatosi:', result);
    }
  } catch (err) {
    console.error('FCM yuborishda xato:', err);
    // Fallback: DB ga yozish
    await db.ref('notifications').push({
      token, title: data.title, body: data.body,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  }
}

// ====================================================
// SHIFOKOR QO'SHISH
// ====================================================
window.addDoctor = async function () {
  const firstName = document.getElementById('docFirstName').value.trim();
  const lastName = document.getElementById('docLastName').value.trim();
  const specialty = document.getElementById('selectedSpecialty').value;
  const room = document.getElementById('docRoom').value.trim();
  const hours = document.getElementById('docHours').value.trim();
  const note = document.getElementById('docNote').value.trim();

  if (!firstName || !lastName) {
    showToast('⚠️', 'To\'ldiring', 'Ism va familya majburiy', 'warning');
    return;
  }

  if (!specialty) {
    showToast('⚠️', 'Mutaxassislik', 'Mutaxassislikni tanlang', 'warning');
    return;
  }

  try {
    const docData = {
      name: `${firstName} ${lastName}`,
      firstName, lastName, specialty,
      room: room || null,
      hours: hours || null,
      note: note || null,
      currentQueue: 0,
      totalQueues: 0,
      isActive: true,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    await db.ref('doctors').push(docData);

    showToast('✅', 'Qo\'shildi!', `Dr. ${firstName} ${lastName} ro'yxatga qo'shildi`, 'success');

    // Formni tozalash
    document.getElementById('docFirstName').value = '';
    document.getElementById('docLastName').value = '';
    document.getElementById('docRoom').value = '';
    document.getElementById('docHours').value = '';
    document.getElementById('selectedSpecialty').value = '';
    document.querySelectorAll('.spec-chip').forEach(c => c.classList.remove('selected'));
    selectedSpecialty = '';

    // Shifokorlar bo'limiga o'tish
    setTimeout(() => {
      switchSec('doctors', document.querySelector('[data-sec="doctors"]'));
    }, 1000);

  } catch (err) {
    console.error('Shifokor qo\'shishda xato:', err);
    showToast('❌', 'Xato', err.message, 'error');
  }
};

// ====================================================
// SHIFOKORNI FAOL/NOFAOL QILISH
// ====================================================
window.toggleDoctorActive = async function (doctorId, isActive) {
  try {
    await db.ref(`doctors/${doctorId}/isActive`).set(isActive);
    showToast(isActive ? '✅' : '⏸️', isActive ? 'Faollashtirildi' : 'To\'xtatildi',
      `Shifokor holati o'zgardi`, 'info');
  } catch (err) {
    showToast('❌', 'Xato', err.message, 'error');
  }
};

// ====================================================
// NAVBATNI O'CHIRISH
// ====================================================
window.removeQueue = function (doctorId, queueId, doctorName) {
  showConfirmModal(
    `Navbatni o'chirish`,
    `Dr. ${doctorName} navbatidagi bu yozuvni o'chirasizmi?`,
    async () => {
      try {
        await db.ref(`queues/${doctorId}/${queueId}`).remove();
        // Total navbatni kamaytirish
        const snap = await db.ref(`doctors/${doctorId}/totalQueues`).once('value');
        const val = snap.val() || 0;
        if (val > 0) await db.ref(`doctors/${doctorId}/totalQueues`).set(val - 1);
        showToast('✅', 'O\'chirildi', 'Navbat o\'chirildi', 'success');
      } catch (err) {
        showToast('❌', 'Xato', err.message, 'error');
      }
    }
  );
};

// ====================================================
// SHIFOKORNI O'CHIRISH
// ====================================================
window.confirmDelete = function (doctorId, name) {
  showConfirmModal(
    `${name} o'chirilsinmi?`,
    `Bu shifokor va uning barcha navbatlari o'chib ketadi.`,
    async () => {
      try {
        await Promise.all([
          db.ref(`doctors/${doctorId}`).remove(),
          db.ref(`queues/${doctorId}`).remove()
        ]);
        showToast('✅', 'O\'chirildi', `${name} o'chirildi`, 'success');
      } catch (err) {
        showToast('❌', 'Xato', err.message, 'error');
      }
    }
  );
};

// ====================================================
// BARCHA NAVBATLARNI TOZALASH
// ====================================================
window.clearAllQueues = function () {
  showConfirmModal(
    'Barcha navbatlarni tozalash',
    'Bu amal barcha shifokorlarning navbatlarini noldan boshlaydi. Davom etilsinmi?',
    async () => {
      try {
        const doctorIds = Object.keys(allDoctors);
        const promises = doctorIds.map(id =>
          Promise.all([
            db.ref(`queues/${id}`).remove(),
            db.ref(`doctors/${id}/currentQueue`).set(0),
            db.ref(`doctors/${id}/totalQueues`).set(0),
          ])
        );
        await Promise.all(promises);
        showToast('✅', 'Tozalandi', 'Barcha navbatlar tozalandi', 'success');
      } catch (err) {
        showToast('❌', 'Xato', err.message, 'error');
      }
    }
  );
};

// ====================================================
// CONFIRM MODAL
// ====================================================
function showConfirmModal(title, text, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmText').textContent = text;
  confirmCallback = callback;
  document.getElementById('confirmModal').classList.add('active');
  document.getElementById('confirmBtn').onclick = async () => {
    closeConfirmModal();
    await callback();
  };
}

window.closeConfirmModal = function () {
  document.getElementById('confirmModal').classList.remove('active');
  confirmCallback = null;
};

// ====================================================
// ADMIN PUSH NOTIFICATION RUXSATI
// ====================================================
async function requestAdminNotification() {
  try {
    await Notification.requestPermission();
    const token = await messaging.getToken({ vapidKey: VAPID_KEY });
    console.log('Admin FCM Token:', token);
  } catch (err) {
    console.warn('Admin notification ruxsati:', err);
  }
}

// Foreground xabarlar
messaging.onMessage((payload) => {
  const { title, body } = payload.notification || {};
  showToast('📢', title || 'Xabar', body || '', 'info', 6000);
});

// ====================================================
// ESC TUGMASI
// ====================================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeConfirmModal();
});

// ====================================================
// TOAST
// ====================================================
function showToast(icon, title, message, type = 'info', duration = 5000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
  `;
  container.appendChild(toast);
  toast.addEventListener('click', () => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  });
  if (duration > 0) {
    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}
