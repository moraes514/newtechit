// ════════════════════════════════════════════════════════════════════
//  NEWTECHIT CRM — Firebase Configuration (Configurado)
// ════════════════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBKM2b4REt8gIaN_sHfXp9JvXzoc6etMXc",
  authDomain:        "crm-web-newtechit.firebaseapp.com",
  projectId:         "crm-web-newtechit",
  storageBucket:     "crm-web-newtechit.firebasestorage.app",
  messagingSenderId: "986495075816",
  appId:             "1:986495075816:web:724b198650824f54b5105d",
  measurementId:     "G-N3SS2GPMCY"
};

if (typeof window !== 'undefined') {
  window.FIREBASE_CONFIG = FIREBASE_CONFIG;
}

