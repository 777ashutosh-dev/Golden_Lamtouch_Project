/*
  M16 - The Public-Facing Form (Baby Step 71c)
  -----------------------------
  This file implements our new, "smarter" logic.
  It does NOT require a formId in the URL.
  It finds the formId *from* the OTP code.
  
  Our 4-Part Plan:
  - Part 1 (Baby Step 71): Make the "OTP Gate" work. (IN PROGRESS)
  - Part 2 (Baby Step 72): Build the "Basic Form" (text, dropdowns).
  - Part 3 (Baby Step 73): Build the "Smart Image Upload" (cropper).
  - Part 4 (Baby Step 74): Build the "Submit" logic.
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();
    const storage = firebase.storage();

    // --- Page-level "memory" ---
    let currentFormId = null; // We will discover this *after* OTP check
    let validOtpCode = null;
    let validOtpDocId = null;
    let formFields = [];
    let formData = {};

    // --- Find all our "targets" in the HTML ---
    
    // Page Titles
    const formTitle = document.getElementById('form-title');
    const formOrgName = document.getElementById('form-org-name');

    // Part 1: "OTP Gate" Targets
    const otpGateContainer = document.getElementById('otp-gate-container');
    const otpInput = document.getElementById('otp-input');
    const verifyOtpButton = document.getElementById('verify-otp-button');
    const otpErrorMessage = document.getElementById('otp-error-message');

    // Part 2: "Form Content" Targets
    const formContentContainer = document.getElementById('form-content-container');
    const proPhotoWarning = document.getElementById('pro-photo-warning');
    const dynamicFormFields = document.getElementById('dynamic-form-fields');
    const submitFormButton = document.getElementById('submit-form-button');

    // =================================================================
    // START: M16 - PART 1 (Baby Step 71) - The "Gate"
    // =================================================================

    // --- 1. Initialization: Set default text ---
    function initializeForm() {
        // This is now much simpler. We don't check the URL.
        formTitle.textContent = 'Form Submission';
        formOrgName.textContent = 'Please enter your code to begin.';
    }

    // --- 2. "Verify OTP" Button Click Logic (NEW "Smarter" Version) ---
    if (verifyOtpButton) {
        verifyOtpButton.addEventListener('click', async () => {
            const otpValue = otpInput.value.trim().toLowerCase();

            // Reset UI
            otpErrorMessage.textContent = '';
            if (otpValue.length !== 6) {
                showError('Code must be 6 characters long.');
                return;
            }

            // Set "Loading" state
            verifyOtpButton.disabled = true;
            verifyOtpButton.querySelector('.truncate').textContent = 'Verifying...';

            try {
                // --- THIS IS THE NEW LOGIC ---
                // We search *only* by the code, not the formId.
                const snapshot = await db.collection('otps')
                    .where('code', '==', otpValue)
                    .limit(1)
                    .get();

                if (snapshot.empty) {
                    // --- Case 1: No match found ---
                    showError('This code is not valid or does not exist.');
                    resetVerifyButton();
                    return;
                }

                const otpDoc = snapshot.docs[0];
                const otpData = otpDoc.data();

                if (otpData.isUsed === true) {
                    // --- Case 2: Code has already been used ---
                    showError('This code has already been used and is no longer valid.');
                    resetVerifyButton();
                    return;
                }

                // --- Case 3: SUCCESS! ---
                // We found a valid, unused code.
                
                // 3a. Save our OTP info
                validOtpCode = otpData.code;
                validOtpDocId = otpDoc.id;
                currentFormId = otpData.formId; // <-- We just *discovered* the formId!

                // 3b. (NEW) Now that we have the formId, load the form info
                const formDoc = await db.collection('forms').doc(currentFormId).get();
                
                if (formDoc.exists) {
                    const formData = formDoc.data();
                    // Update titles
                    formTitle.textContent = formData.formName || 'Form Submission';
                    formOrgName.textContent = formData.orgName || 'Please fill out the form.';
                    // Save fields for Part 2
                    formFields = formData.fields || [];

                    // 3c. Trigger the "Unlock"
                    unlockForm();

                } else {
                    // This is a rare error, but good to catch.
                    // The OTP is valid, but the form it points to was deleted.
                    showError('Error: This code is for a form that no longer exists.');
                    resetVerifyButton();
                }

            } catch (err) {
                console.error("Error verifying OTP: ", err);
                showError('An error occurred. Please try again.');
                resetVerifyButton();
            }
        });
    }
    
    // --- 3. Helper Functions for "The Gate" ---
    
    function showError(message) {
        otpErrorMessage.textContent = message;
    }
    
    function resetVerifyButton() {
        verifyOtpButton.disabled = false;
        verifyOtpButton.querySelector('.truncate').textContent = 'Verify Code';
    }

    function unlockForm() {
        // This is the "magic" step.
        
        // 1. Hide the "Gate"
        otpGateContainer.classList.add('hidden');
        
        // 2. Show the "Form Content"
        formContentContainer.classList.remove('hidden');

        // 3. (Future) Trigger Part 2:
        // buildDynamicForm(); // We will uncomment this in Baby Step 72
    }

    // =================================================================
    // START: M16 - PART 2 (Baby Step 72) - The "Basic Form"
    // =================================================================
    
    // We will write the dynamic form-building logic here
    
    // =================================================================
    // START: M16 - PART 3 (Baby Step 73) - The "Smart Image"
    // =================================================================
    
    // We will write the "Cropper.js" logic here
    
    // =================================================================
    // START: M16 - PART 4 (Baby Step 74) - The "Submit"
    // =================================================================
    
    // We will write the final submit logic here
    
    
    // --- This starts the entire page ---
    initializeForm();

});