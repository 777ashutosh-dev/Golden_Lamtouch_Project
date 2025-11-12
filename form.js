/*
  M16 - The Public-Facing Form (Baby Step 72)
  -----------------------------
  This file now adds the logic for Part 2.
  It dynamically builds the form fields (except images).
  
  Our 4-Part Plan:
  - Part 1 (Baby Step 71): "OTP Gate" is COMPLETE.
  - Part 2 (Baby Step 72): Build the "Basic Form". (IN PROGRESS)
  - Part 3 (Baby Step 73): Build the "Smart Image Upload" (cropper).
  - Part 4 (Baby Step 74): Build the "Submit" logic.
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();
    const storage = firebase.storage();

    // --- Page-level "memory" ---
    let currentFormId = null; 
    let validOtpCode = null;
    let validOtpDocId = null;
    let formFields = [];
    let formData = {}; // We will use this in Part 4

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
    // START: M16 - PART 1 (Baby Step 71) - The "Gate" (Complete)
    // =================================================================

    function initializeForm() {
        formTitle.textContent = 'Form Submission';
        formOrgName.textContent = 'Please enter your code to begin.';
    }

    if (verifyOtpButton) {
        verifyOtpButton.addEventListener('click', async () => {
            const otpValue = otpInput.value.trim().toLowerCase();
            otpErrorMessage.textContent = '';

            if (otpValue.length !== 6) {
                showError('Code must be 6 characters long.');
                return;
            }

            verifyOtpButton.disabled = true;
            verifyOtpButton.querySelector('.truncate').textContent = 'Verifying...';

            try {
                const snapshot = await db.collection('otps')
                    .where('code', '==', otpValue)
                    .limit(1)
                    .get();

                if (snapshot.empty) {
                    showError('This code is not valid or does not exist.');
                    resetVerifyButton();
                    return;
                }

                const otpDoc = snapshot.docs[0];
                const otpData = otpDoc.data();

                if (otpData.isUsed === true) {
                    showError('This code has already been used and is no longer valid.');
                    resetVerifyButton();
                    return;
                }

                // --- SUCCESS! ---
                validOtpCode = otpData.code;
                validOtpDocId = otpDoc.id;
                currentFormId = otpData.formId;

                const formDoc = await db.collection('forms').doc(currentFormId).get();
                
                if (formDoc.exists) {
                    const formData = formDoc.data();
                    formTitle.textContent = formData.formName || 'Form Submission';
                    formOrgName.textContent = formData.orgName || 'Please fill out the form.';
                    formFields = formData.fields || [];

                    // --- Trigger the "Unlock" ---
                    unlockForm();

                } else {
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
    
    function showError(message) {
        otpErrorMessage.textContent = message;
    }
    
    function resetVerifyButton() {
        verifyOtpButton.disabled = false;
        verifyOtpButton.querySelector('.truncate').textContent = 'Verify Code';
    }

    function unlockForm() {
        otpGateContainer.classList.add('hidden');
        formContentContainer.classList.remove('hidden');

        // --- (NEW) Trigger for Part 2 ---
        buildDynamicForm();
    }

    // =================================================================
    // START: M16 - PART 2 (Baby Step 72) - The "Basic Form"
    // =================================================================
    
    function buildDynamicForm() {
        if (!formFields || formFields.length === 0) {
            dynamicFormFields.innerHTML = '<p class="text-gray-400">This form has no fields.</p>';
            return;
        }

        let hasImageField = false;

        formFields.forEach(field => {
            // Create a new div container for the field
            const fieldWrapper = document.createElement('div');
            fieldWrapper.className = 'flex flex-col gap-2';
            
            let fieldHTML = '';

            // --- This is the "Factory" ---
            // It builds the correct HTML for each data type
            switch (field.dataType) {
                
                case 'string':
                case 'email':
                case 'numeric':
                    fieldHTML = `
                        <label class="text-sm font-medium text-gray-300">${field.fieldName}</label>
                        <input
                            type="${field.dataType === 'string' ? 'text' : field.dataType}"
                            placeholder="Enter ${field.fieldName.toLowerCase()}"
                            class="w-full h-10 px-4 rounded-lg bg-background-dark border border-border-dark text-white placeholder-gray-500 focus:ring-primary focus:border-primary text-sm"
                            data-field-name="${field.fieldName}"
                            ${field.maxLength ? `maxlength="${field.maxLength}"` : ''}
                        >
                    `;
                    break;

                case 'textarea':
                    fieldHTML = `
                        <label class="text-sm font-medium text-gray-300">${field.fieldName}</label>
                        <textarea
                            rows="4"
                            placeholder="Enter ${field.fieldName.toLowerCase()}"
                            class="w-full p-4 rounded-lg bg-background-dark border border-border-dark text-white placeholder-gray-500 focus:ring-primary focus:border-primary text-sm"
                            data-field-name="${field.fieldName}"
                            ${field.maxLength ? `maxlength="${field.maxLength}"` : ''}
                        ></textarea>
                    `;
                    break;
                
                case 'dropdown':
                    const options = field.dropdownOptions.split('\n').map(opt => opt.trim()).filter(opt => opt);
                    const dropdownOptionsHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
                    fieldHTML = `
                        <label class="text-sm font-medium text-gray-300">${field.fieldName}</label>
                        <select
                            class="w-full h-10 px-4 rounded-lg bg-background-dark border border-border-dark text-white focus:ring-primary focus:border-primary text-sm"
                            data-field-name="${field.fieldName}"
                        >
                            <option value="">Select an option...</option>
                            ${dropdownOptionsHTML}
                        </select>
                    `;
                    break;
                
                case 'radio':
                    const radioOptions = field.dropdownOptions.split('\n').map(opt => opt.trim()).filter(opt => opt);
                    const radioOptionsHTML = radioOptions.map((opt, index) => `
                        <label class="flex items-center gap-3">
                            <input
                                type="radio"
                                name="${field.fieldName}"
                                value="${opt}"
                                class="h-4 w-4 bg-background-dark border-border-dark text-primary focus:ring-primary"
                            >
                            <span class="text-sm text-gray-300">${opt}</span>
                        </label>
                    `).join('');
                    fieldHTML = `
                        <label class="text-sm font-medium text-gray-300">${field.fieldName}</label>
                        <div class="flex flex-col gap-2 mt-2">
                            ${radioOptionsHTML}
                        </div>
                    `;
                    break;
                
                case 'checkbox':
                    fieldHTML = `
                        <label class="flex items-center gap-3">
                            <input
                                type="checkbox"
                                data-field-name="${field.fieldName}"
                                class="h-5 w-5 rounded bg-background-dark border-border-dark text-primary focus:ring-primary"
                            >
                            <span class="text-sm font-medium text-gray-300">${field.fieldName}</span>
                        </label>
                    `;
                    break;
                
                // --- This is Part 3 (our next step) ---
                case 'image':
                case 'signature':
                    hasImageField = true;
                    // We will build the "Smart Image" widget here in Baby Step 73
                    fieldHTML = `
                        <label class="text-sm font-medium text-gray-300">${field.fieldName}</label>
                        <div class="w-full h-32 p-4 text-center rounded-lg border-2 border-dashed border-border-dark text-gray-500">
                            Image uploader for "${field.fieldName}" will be here.
                            (This is Baby Step 73)
                        </div>
                    `;
                    break;
                
                case 'header':
                    fieldHTML = `<h3 class="text-lg font-semibold text-primary pt-4 border-b border-border-dark">${field.fieldName}</h3>`;
                    // Headers don't use the standard fieldWrapper
                    fieldWrapper.className = ''; 
                    break;

                // We ignore 'hidden' fields
                case 'hidden':
                    break;
            }

            fieldWrapper.innerHTML = fieldHTML;
            dynamicFormFields.appendChild(fieldWrapper);
        });

        // --- Show the "Pro Photo" warning if we found any image fields ---
        if (hasImageField) {
            proPhotoWarning.classList.remove('hidden');
        }
    }
    
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