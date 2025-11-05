// This is the first "baby step" in JavaScript:
// We are telling the browser: "Don't run any of this code until the *entire* HTML page is loaded and ready."
// This is super important!
document.addEventListener('DOMContentLoaded', (event) => {

    // Now that we know the page is loaded, we can "grab" our HTML elements.
    // We are finding them by the "id"s we just added in index.html.
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('error-message');

    // Make sure the form exists before we try to use it
    if (loginForm) {
        
        // This is the main "listener". We are telling the form:
        // "Listen for a 'submit' event (which happens when the user clicks the login button)."
        loginForm.addEventListener('submit', (e) => {
            
            // This is the MOST IMPORTANT line.
            // It stops the form from doing its default behavior (which is to refresh the entire page).
            // We want to stay on this page and handle the login with JavaScript.
            e.preventDefault();

            // 1. Get the values the user typed in
            const email = emailInput.value;
            const password = passwordInput.value;

            // 2. This is the "magic" Firebase command.
            // We are telling the "auth" tool (which we defined in index.html):
            // "Please try to sign in with this email and password."
            auth.signInWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    // This ".then()" part is the "SUCCESS" block.
                    // It means the login worked!
                    
                    // Let's print a success message to the browser's console (for debugging)
                    console.log('Login successful!', userCredential.user);
                    
                    // Now, send the user to the dashboard!
                    window.location.href = 'dashboard.html';
                })
                .catch((error) => {
                    // This ".catch()" part is the "ERROR" block.
                    // It means the login failed (wrong password, user doesn't exist, etc.)
                    
                    // Let's print the error to the console (for debugging)
                    console.error('Login failed:', error.message);

                    // Now, let's show our error message to the user.
                    // We find our error message div and remove the "hidden" class to make it visible.
                    errorMessage.classList.remove('hidden');
                });
        });
    }

});