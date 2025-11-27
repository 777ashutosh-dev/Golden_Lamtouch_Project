/*
  M32 v1 - (WHITELIST LOCKDOWN) Auth & Role Guard
  -----------------------------------------------------
  Updates:
  1. SECURITY: Switched from Blacklist to Whitelist. 
     - Coordinators are now blocked from EVERYTHING except 'dashboard.html'.
  2. UI: Sidebar now hides ALL links except Dashboard.
*/

// --- 1. INSTANT ROLE CHECK (Run immediately) ---
(function() {
    const role = sessionStorage.getItem('userRole');
    const path = window.location.pathname;
    const pageName = path.split('/').pop();

    // STRICT WHITELIST for Coordinators
    // If it's NOT dashboard.html (and we are on a protected page), kick them out.
    // Note: auth-guard.js is not loaded on login.html/index.html, so we don't need to whitelist those here.
    if (role === 'coordinator' && pageName !== 'dashboard.html') {
        console.warn("AuthGuard: Strict Access Denied. Redirecting to Dashboard...");
        window.location.replace('dashboard.html'); 
    }
})();

document.addEventListener('DOMContentLoaded', () => {
    
    // Initialize Firebase Auth Listener
    const auth = firebase.auth();

    auth.onAuthStateChanged(user => {
        const currentPath = window.location.pathname;
        const isLoginPage = currentPath.endsWith('login.html') || currentPath.endsWith('/');

        if (user) {
            // --- User is Logged In ---
            if (isLoginPage) {
                window.location.href = 'dashboard.html';
                return;
            }

            // Check Role again (Double Security)
            const userRole = sessionStorage.getItem('userRole'); 
            if (userRole === 'coordinator') {
                applyCoordinatorRestrictions();
            }

        } else {
            // --- User is NOT Logged In ---
            // Allow public form access (form.html)
            const isPublicPage = currentPath.endsWith('form.html');
            if (!isLoginPage && !isPublicPage) {
                window.location.href = 'login.html';
            }
        }
    });

    // --- UI HIDING LOGIC (WHITELIST MODE) ---
    function applyCoordinatorRestrictions() {
        console.log("AuthGuard: Enforcing Coordinator Whitelist...");

        // Target all navigation links in the sidebar
        const sidebarLinks = document.querySelectorAll('aside nav a');

        sidebarLinks.forEach(link => {
            const href = link.getAttribute('href');
            
            // If the link is NOT dashboard.html, hide it.
            if (href && !href.includes('dashboard.html')) {
                link.style.display = 'none'; // Force hide
                link.classList.add('hidden'); // Tailwind hide
            }
        });
        
        // Extra Safety: Hide any "Manage" buttons on the dashboard itself if they exist
        const manageBtn = document.querySelector('a[href="form-management.html"]');
        if (manageBtn) {
            // Hide the parent container if it's a standalone button wrapper
            if(manageBtn.parentElement.classList.contains('flex')) {
                 manageBtn.parentElement.style.display = 'none';
            } else {
                 manageBtn.style.display = 'none';
            }
        }
    }

    // --- Sign Out Logic ---
    const signOutButton = document.getElementById('sign-out-button');
    if (signOutButton) {
        signOutButton.addEventListener('click', (e) => {
            e.preventDefault();
            auth.signOut().then(() => {
                sessionStorage.clear();
                window.location.href = 'login.html';
            });
        });
    }
});