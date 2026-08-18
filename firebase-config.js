// ====================================================
// FIREBASE KONFIGURATSIYASI
// ShifoNavbat — Shifoxona Navbat Tizimi
// ====================================================
// ESLATMA: Bu fayl compat SDK bilan ishlaydi (import yo'q!)
// ====================================================

const firebaseConfig = {
  apiKey: "AIzaSyABW-mB-k74CJNUnsPdy39VUUnPy2RZluE",
  authDomain: "shifo-uz.firebaseapp.com",
  databaseURL: "https://shifo-uz-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "shifo-uz",
  storageBucket: "shifo-uz.firebasestorage.app",
  messagingSenderId: "873985603518",
  appId: "1:873985603518:web:729eb4f7199e89bf456bef",
  measurementId: "G-VK3WXGY918"
};

// ====================================================
// FCM VAPID Key — Firebase Console dan olish:
// Project Settings → Cloud Messaging →
// Web Push certificates → Generate key pair
// Chiqadigan kalitni quyiga joylashtiring:
// ====================================================
const VAPID_KEY = "BAWsZzWJ-rc_eqtVBW6yIViwmjWeix9Bp2YYiSt_mGUs9eBsrcRTV6TTRiA6nJ9I3oXs7jn_UcWsA5scYh_6Mvc";

export { firebaseConfig, VAPID_KEY };