/*
  M27 v2 - (LOGIN DEBUGGER)
  -----------------------------------------------------
  Updates:
  1. DEBUG: Added console logs to track execution flow.
  2. ROBUSTNESS: Added checks to ensure Firebase Auth is ready.
*/

document.addEventListener('DOMContentLoaded', () => {
    console.log("Login Page: DOM Content Loaded");

    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    // NOTE: In index.html, the button ID is 'login-button', but in previous JS it was 'submit-button'.
    // I will check for both to be safe.
    const submitButton = document.getElementById('login-button') || document.getElementById('submit-button');
    const errorMessage = document.getElementById('error-message');

    if (!loginForm) {
        console.error("CRITICAL ERROR: Login Form not found in DOM!");
        return;
    }
    
    if (!submitButton) {
        console.error("CRITICAL ERROR: Submit Button not found in DOM!");
        return;
    }

    // Initialize Firebase
    const auth = firebase.auth();
    const db = firebase.firestore();
    console.log("Firebase initialized in Login.js");

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("Login: Submit button clicked.");

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            showError('Please enter both email and password.');
            return;
        }

        // UI Loading State
        submitButton.disabled = true;
        const originalText = submitButton.innerText; // Use innerText to preserve formatting if simple
        submitButton.querySelector('.truncate').innerText = 'Signing In...'; // Target the span text
        errorMessage.classList.add('hidden');

        try {
            console.log("Login: Attempting Firebase Auth...");
            // 1. Standard Firebase Auth Login
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;
            console.log("Login: Auth Success. User:", user.uid);

            // 2. Role Detection (The "Gatekeeper")
            console.log("Login: Checking Coordinator Role...");
            const coordSnapshot = await db.collection('coordinators')
                .where('uid', '==', user.uid)
                .limit(1)
                .get();

            if (!coordSnapshot.empty) {
                // --- IS COORDINATOR ---
                const coordDoc = coordSnapshot.docs[0];
                sessionStorage.setItem('userRole', 'coordinator');
                sessionStorage.setItem('coordDocId', coordDoc.id);
                console.log("Login: User identified as Coordinator.");
            } else {
                // --- IS ADMIN ---
                sessionStorage.setItem('userRole', 'admin');
                sessionStorage.removeItem('coordDocId');
                console.log("Login: User identified as Admin.");
            }

            // 3. Redirect
            console.log("Login: Redirecting to Dashboard...");
            window.location.href = 'dashboard.html';

        } catch (error) {
            console.error("Login Error:", error);
            let msg = "Failed to sign in.";
            
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                msg = "Invalid email or password.";
            } else if (error.code === 'auth/too-many-requests') {
                msg = "Too many failed attempts. Please try again later.";
            } else {
                msg = "Error: " + error.message;
            }
            
            showError(msg);
            
            // Reset Button
            submitButton.disabled = false;
            submitButton.querySelector('.truncate').innerText = 'Login'; // Reset text
        }
    });

    function showError(msg) {
        console.warn("Login UI Error:", msg);
        // Target the span inside the error div if it exists, or just set text
        const errorSpan = errorMessage.querySelector('span') || errorMessage;
        errorSpan.textContent = msg;
        errorMessage.classList.remove('hidden');
    }

});