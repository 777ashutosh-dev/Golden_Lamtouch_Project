/*
  M27 v2 - (AGGRESSIVE BLINDFOLD) Auth & Role Guard
  -----------------------------------------------------
  Updates:
  1. INSTANT CHECK: Checks sessionStorage immediately (before Firebase loads).
  2. REDIRECT: Bounces Coordinators off restricted pages instantly.
  3. UI HIDING: Aggressively hides sidebar links using multiple selectors.
*/

// --- 1. INSTANT ROLE CHECK (Run immediately) ---
(function() {
    const role = sessionStorage.getItem('userRole');
    const path = window.location.pathname;
    const pageName = path.split('/').pop();

    // Restricted Pages for Coordinators
    const forbiddenPages = [
        'settings.html',
        'form-creation.html',
        'form-management.html',
        'system-logs.html'
    ];

    if (role === 'coordinator' && forbiddenPages.includes(pageName)) {
        console.warn("AuthGuard: Access Denied. Redirecting...");
        window.location.replace('dashboard.html'); // Use replace to prevent 'Back' button loop
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
            const isPublicPage = currentPath.endsWith('form.html');
            if (!isLoginPage && !isPublicPage) {
                window.location.href = 'login.html';
            }
        }
    });

    // --- UI HIDING LOGIC ---
    function applyCoordinatorRestrictions() {
        console.log("AuthGuard: Hiding Admin Links...");

        // 1. Hide by Text Content (Broadest Net)
        const sidebarLinks = document.querySelectorAll('aside nav a');
        const forbiddenKeywords = ['Settings', 'Form Creation', 'Form Management', 'System Logs'];

        sidebarLinks.forEach(link => {
            const text = link.textContent.trim();
            if (forbiddenKeywords.some(keyword => text.includes(keyword))) {
                link.style.display = 'none'; // Force hide
                link.classList.add('hidden'); // Tailwind hide
            }
        });

        // 2. Hide by HREF (Specific Net)
        const forbiddenHrefs = ['settings.html', 'form-creation.html', 'form-management.html'];
        forbiddenHrefs.forEach(href => {
            const link = document.querySelector(`a[href*="${href}"]`);
            if (link) {
                link.style.display = 'none';
                link.classList.add('hidden');
            }
        });
        
        // 3. Special Case: "Form Management" button on Dashboard
        const manageBtn = document.querySelector('a[href="form-management.html"]');
        if (manageBtn) manageBtn.parentElement.style.display = 'none';
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