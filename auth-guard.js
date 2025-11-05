// This is our "Auth Guard".
// This code runs *immediately* when dashboard.html is loaded,
// *before* the user sees anything.

// We are telling Firebase:
// "Hey, as soon as your authentication state changes (someone logs in or logs out),
// please tell me who the user is."
auth.onAuthStateChanged((user) => {
    
    // Part 1: The "Guard"
    if (user) {
        // --- A user IS logged in! ---
        // This is good. We can let them stay.
        // We'll print a message to the console for debugging.
        console.log('Auth Guard: User is logged in.', user.email);
        
        // (In the future, we will load the dashboard data here)
        
    } else {
        // --- NO user is logged in! ---
        // This is bad. We must "kick them out" back to the login page.
        
        console.log('Auth Guard: No user logged in. Redirecting to login.');
        
        // This is the command to redirect the user.
        window.location.href = 'index.html';
    }
});


// Part 2: The "Sign Out" Button
// This part waits for the *whole page* to be loaded before it tries to find the button.
// This is safer than the login.js code, just a different way to do it.
document.addEventListener('DOMContentLoaded', () => {

    // Find our "Sign Out" button by the ID we gave it in the HTML
    const signOutButton = document.getElementById('sign-out-button');

    // If the button exists...
    if (signOutButton) {
        
        // ...listen for a "click" event on it.
        signOutButton.addEventListener('click', () => {
            
            // When clicked, tell Firebase to sign the user out.
            auth.signOut().then(() => {
                // SUCCESS!
                // The user is signed out. Firebase will tell our "Auth Guard" above,
                // which will then automatically redirect to index.html.
                // But we can also redirect *here* just to be fast.
                console.log('User signed out successfully.');
                window.location.href = 'index.html';
                
            }).catch((error) => {
                // An error happened.
                console.error('Sign out error:', error);
            });
            
        });
    }
});