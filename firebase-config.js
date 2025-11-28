/*
  M39 v4 - (LIVE KEYS) CENTRAL FIREBASE CONFIGURATION
  ---------------------------------------------------
  Updates:
  1. KEYS: Inserted valid reCAPTCHA v3 Site Key.
  2. SHIELD: App Check is now active and protecting the DB.
*/

const firebaseConfig = {
    apiKey: "AIzaSyAJ-xyOPmJXmhe9PUCa1BU75fWJ_MWsHA0",
    authDomain: "golden-lamtouch-project.firebaseapp.com",
    projectId: "golden-lamtouch-project",
    storageBucket: "golden-lamtouch-project.firebasestorage.app",
    messagingSenderId: "528955254323",
    appId: "1:528955254323:web:e71517dab7fcb78b842546"
};

// 1. Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

// 2. Initialize Services (Global access)
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Initialize Cloud Functions with correct region logic
// Note: This relies on the 'firebase-functions-compat.js' library being loaded in HTML
const functions = firebase.app().functions('asia-south1');

// 3. Initialize App Check (The Shield)
if (firebase.appCheck) {
    console.log("🛡️ Shield: Initializing App Check...");
    
    try {
        const appCheck = firebase.appCheck();
        
        // Activate with your specific Site Key
        appCheck.activate(
            '6LeIlhosAAAAAAgFyOOn954lnMfEIc_ZwMi4NJU8', 
            true 
        );
        console.log("✅ Shield: App Check Activated.");
    } catch (e) {
        console.error("❌ Shield Error:", e);
    }
} else {
    console.warn("⚠️ Shield: App Check library not loaded.");
}