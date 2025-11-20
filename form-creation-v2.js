/*
  M23 v23 - (ANTI-DUPLICATION: FORMS) Form Creation Brain
  -----------------------------------------------------
  Updates:
  1. SECURITY: Added "Smart Duplicate Check" before saving.
     - Checks if 'formName' already exists in the database.
     - Smartly handles "Edit Mode" (ignores self-matches).
  2. LOGIC: Preserves all previous validation and "Hybrid" features.
*/

document.addEventListener('DOMContentLoaded', () => {

    // --- We need access to our database! ---
    const db = firebase.firestore();

    // --- Find all our "Target" elements on the page ---
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    const saveFormButton = document.getElementById('save-form-button');

    // Step 1 Targets
    const formNameInput = document.getElementById('form-name');
    const orgNameInput = document.getElementById('org-name');
    const coordinatorNameInput = document.getElementById('coordinator-name');
    const coordinatorEmailInput = document.getElementById('coordinator-email');
    
    // Step 2 Targets
    const emailToggle = document.getElementById('email-toggle');
    const emailToggleKnob = document.getElementById('email-toggle-knob');
    const paymentToggle = document.getElementById('payment-toggle');
    const paymentToggleKnob = document.getElementById('payment-toggle-knob');
    const presetAmountContainer = document.getElementById('preset-amount-container');
    const presetAmountInput = document.getElementById('preset-amount');
    
    // Step 3 Targets
    const addFieldButtonTop = document.getElementById('add-field-button-top');
    const addFieldButtonBottom = document.getElementById('add-field-button-bottom');
    const fieldsContainer = document.getElementById('fields-container');
    
    // --- Global variables to store our state ---
    let isEmailEnabled = false;
    let isPaymentEnabled = false;
    let fieldCounter = 0;
    
    // --- This is the new, CRITICAL variable ---
    let currentEditingFormId = null;

    // =================================================================
    // START: "EDIT MODE" LOGIC (Baby Step 63 - The "Smart" Version)
    // This code runs *immediately* when the page loads.
    // =================================================================

    // 1. Check the URL for a "formId"
    const urlParams = new URLSearchParams(window.location.search);
    const formIdFromUrl = urlParams.get('formId');

    if (formIdFromUrl) {
        // --- WE ARE IN "EDIT MODE" ---
        currentEditingFormId = formIdFromUrl; // Save the ID
        
        // 2. Change the UI to "Edit Mode" (Your Idea!)
        pageTitle.textContent = 'Edit Form';
        pageSubtitle.textContent = 'You are now editing an existing form.';
        saveFormButton.querySelector('.truncate').textContent = 'Update Form';
        
        // 3. --- THIS IS THE NEW "HYBRID/LOCKED" LOGIC ---
        // We will run *two* database queries at the same time.
        const getFormSubmissions = db.collection('submissions').where('formId', '==', currentEditingFormId).limit(1).get();
        const getFormDoc = db.collection('forms').doc(currentEditingFormId).get();

        // Promise.all waits for *both* queries to finish
        Promise.all([getFormSubmissions, getFormDoc])
            .then(([submissionsSnapshot, doc]) => {
                
                // This is our new "safety check" variable
                const hasSubmissions = !submissionsSnapshot.empty;

                if (doc.exists) {
                    const data = doc.data();

                    // If it has submissions, show our warning message
                    if (hasSubmissions) {
                        pageSubtitle.textContent = 'This form has live data. Destructive edits (like deleting fields) are disabled.';
                        pageSubtitle.classList.add('text-yellow-400'); // Make it stand out
                    }
                    
                    // 4. Pre-fill all the fields!
                    
                    // Step 1: Fill details
                    formNameInput.value = data.formName || '';
                    orgNameInput.value = data.orgName || '';
                    coordinatorNameInput.value = data.coordinatorName || '';
                    coordinatorEmailInput.value = data.coordinatorEmail || '';

                    // Step 2: Set toggles and payment
                    if (data.sendEmailNotification) {
                        emailToggle.click(); 
                    }
                    if (data.isPrepaid) {
                        paymentToggle.click();
                        presetAmountInput.value = data.presetAmount || '';
                    }

                    // Step 3: Re-build all the saved fields
                    if (data.fields && Array.isArray(data.fields)) {
                        data.fields.forEach(field => {
                            // We pass our new "hasSubmissions" variable to the create function
                            const newRow = createFieldRow(field, hasSubmissions);
                            fieldsContainer.insertBefore(newRow, addFieldButtonBottom);
                        });
                    }

                } else {
                    console.error("No such form found!");
                    alert("Error: Form not found.");
                    window.location.href = 'dashboard.html'; // Send them home
                }
            })
            .catch((error) => {
                console.error("Error fetching form data: ", error);
                alert("An error occurred while fetching the form.");
            });
    }
    // --- If no formIdFromUrl, we are in "Create Mode" and do nothing! ---
    

    // =================================================================
    // START: TOGGLE LOGIC (Already Working)
    // =================================================================
    
    if (emailToggle) {
        emailToggle.addEventListener('click', () => {
            isEmailEnabled = !isEmailEnabled; // Flip the value
            updateToggleUI(emailToggle, emailToggleKnob, isEmailEnabled);
        });
    }

    if (paymentToggle) {
        paymentToggle.addEventListener('click', () => {
            isPaymentEnabled = !isPaymentEnabled; // Flip the value
            updateToggleUI(paymentToggle, paymentToggleKnob, isPaymentEnabled);
            
            if (isPaymentEnabled) {
                presetAmountContainer.classList.remove('hidden');
            } else {
                presetAmountContainer.classList.add('hidden');
            }
        });
    }
    
    function updateToggleUI(toggleElement, knobElement, isEnabled) {
        knobElement.classList.toggle('translate-x-5', isEnabled);
        knobElement.classList.toggle('translate-x-0', !isEnabled);
        toggleElement.classList.toggle('bg-primary', isEnabled);
        toggleElement.classList.toggle('bg-gray-600', !isEnabled);
        toggleElement.setAttribute('aria-checked', isEnabled);
    }
    
    // =================================================================
    // START: "ADD FIELD" LOGIC (Now smarter!)
    // =================================================================

    // We add a listener to the TOP button
    if (addFieldButtonTop) {
        addFieldButtonTop.addEventListener('click', () => {
            // We pass "false" for "isLocked" because a new field is never locked.
            const newRow = createFieldRow(null, false); 
            fieldsContainer.insertBefore(newRow, addFieldButtonBottom);
        });
    }

    // We add a listener to the BOTTOM button
    if (addFieldButtonBottom) {
        addFieldButtonBottom.addEventListener('click', () => {
            const newRow = createFieldRow(null, false); 
            fieldsContainer.insertBefore(newRow, addFieldButtonBottom);
        });
    }

    // THIS IS OUR NEW, MAIN FUNCTION FOR CREATING A FIELD ROW
    // It now accepts an "isLocked" variable
    function createFieldRow(fieldData = null, isLocked = false) {
        // We re-count the fields *every time* to get the correct new number
        fieldCounter = document.querySelectorAll('.field-row').length + 1;
            
        const newFieldRow = document.createElement('div');
        newFieldRow.className = 'field-row p-4 bg-background-dark rounded-lg border border-border-dark flex flex-col gap-4';
        newFieldRow.setAttribute('data-field-number', fieldCounter);

        // Pre-fill data or use defaults
        const fieldName = fieldData ? fieldData.fieldName : '';
        const dataType = fieldData ? fieldData.dataType : 'string';
        const caseType = fieldData ? fieldData.caseType : 'as-typed';
        const maxLength = fieldData ? fieldData.maxLength : '';
        const dropdownOptions = fieldData ? fieldData.dropdownOptions : '';
        
        // This is the "future-proof" HTML we built before
        // NOW with "disabled" attributes added based on our "isLocked" logic
        const fieldHTML = `
            <!-- Top Row: Field Number, Field Name, Data Type, Case Type -->
            <div class="flex flex-wrap gap-4 items-center">
                
                <div class="field-number flex items-center justify-center h-10 w-10 bg-surface-dark border border-border-dark rounded-lg text-primary font-bold text-lg">
                    ${fieldCounter}
                </div>

                <div class="flex-1 min-w-[200px]">
                    <label class="text-xs font-medium text-gray-400">Field Name</label>
                    <input type="text" placeholder="e.g., 'Candidate Name'" class="field-name-input w-full h-10 px-4 mt-1 rounded-lg bg-surface-dark border border-border-dark text-white placeholder-gray-500 focus:ring-primary focus:border-primary text-sm ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}" 
                           value="${fieldName || ''}" ${isLocked ? 'disabled' : ''}>
                </div>

                <div class="flex-1 min-w-[150px]">
                    <label class="text-xs font-medium text-gray-400">Data Type</label>
                    <select class="data-type-select w-full h-10 px-4 mt-1 rounded-lg bg-surface-dark border border-border-dark text-white focus:ring-primary focus:border-primary text-sm ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}" 
                            ${isLocked ? 'disabled' : ''}>
                        <option value="string" ${dataType === 'string' ? 'selected' : ''}>String (Text)</option>
                        <option value="email" ${dataType === 'email' ? 'selected' : ''}>Email</option>
                        <option value="textarea" ${dataType === 'textarea' ? 'selected' : ''}>Textarea (Multi-line)</option>
                        <option value="numeric" ${dataType === 'numeric' ? 'selected' : ''}>Numeric</option>
                        <option value="date" ${dataType === 'date' ? 'selected' : ''}>Date</option>
                        <option value="datetime" ${dataType === 'datetime' ? 'selected' : ''}>Date & Time</option>
                        <option value="checkbox" ${dataType === 'checkbox' ? 'selected' : ''}>Checkbox (Yes/No)</option>
                        <option value="radio" ${dataType === 'radio' ? 'selected' : ''}>Radio Button Group</option>
                        <option value="dropdown" ${dataType === 'dropdown' ? 'selected' : ''}>Dropdown (Select Menu)</option>
                        <option value="image" ${dataType === 'image' ? 'selected' : ''}>Image</option>
                        <option value="signature" ${dataType === 'signature' ? 'selected' : ''}>Signature</option>
                        <option value="file" ${dataType === 'file' ? 'selected' : ''}>File</option>
                        <option value="header" ${dataType === 'header' ? 'selected' : ''}>Section Header</option>
                        <option value="hidden" ${dataType === 'hidden' ? 'selected' : ''}>Hidden Field</option>
                    </select>
                </div>

                <div class="case-type-container flex-1 min-w-[150px]">
                    <label class="text-xs font-medium text-gray-400">Case Type</label>
                    <select class="case-type-select w-full h-10 px-4 mt-1 rounded-lg bg-surface-dark border border-border-dark text-white focus:ring-primary focus:border-primary text-sm">
                        <option value="as-typed" ${caseType === 'as-typed' ? 'selected' : ''}>As Typed</option>
                        <option value="all-caps" ${caseType === 'all-caps' ? 'selected' : ''}>All Capitals</option>
                        <option value="sentence-case" ${caseType === 'sentence-case' ? 'selected' : ''}>Sentence Case</option>
                    </select>
                </div>

                <div class="flex items-end">
                    <!-- The Delete button is now HIDDEN if the form is locked! -->
                    <button type="button" class="delete-field-button p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg ${isLocked ? 'hidden' : ''}">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>

            <!-- Bottom Row: Max Length, Dropdown Options -->
            <div class="flex flex-wrap gap-4 items-center">
                
                <div class="max-length-container flex-none min-w-[100px] w-28">
                    <label class="text-xs font-medium text-gray-400">Max Length</label>
                    <input type="number" placeholder="e.g., 50" class="max-length-input w-full h-10 px-4 mt-1 rounded-lg bg-surface-dark border border-border-dark text-white placeholder-gray-500 focus:ring-primary focus:border-primary text-sm" value="${maxLength || ''}">
                </div>

                <div class="dropdown-options-container flex-1 min-w-[200px] hidden">
                    <label class="text-xs font-medium text-gray-400">Options (one per line)</label>
                    <textarea class="dropdown-options-input w-full p-4 mt-1 rounded-lg bg-surface-dark border border-border-dark text-white placeholder-gray-500 focus:ring-primary focus:border-primary text-sm" rows="3" placeholder="e.g.,&#10;Male&#10;Female&#10;Other">${dropdownOptions || ''}</textarea>
                </div>
            </div>
        `;
        
        newFieldRow.innerHTML = fieldHTML;

        // We must *also* run our "smart logic" on this new row
        // to hide/show the boxes correctly right from the start!
        updateFieldVisibility(newFieldRow, dataType);
        
        return newFieldRow;
    }

    // --- SMART LOGIC for Hiding/Showing Fields ---
    if (fieldsContainer) {

        // Delete Button Logic
        fieldsContainer.addEventListener('click', (e) => {
            const deleteButton = e.target.closest('.delete-field-button');
            if (deleteButton) {
                deleteButton.closest('.field-row').remove();
                updateFieldNumbers();
            }
        });

        // "Data Type" Dropdown Logic
        fieldsContainer.addEventListener('change', (e) => {
            if (e.target.classList.contains('data-type-select')) {
                const row = e.target.closest('.field-row');
                const selectedType = e.target.value;
                updateFieldVisibility(row, selectedType);
            }
        });
    }
    
    // This is our central "smart" function
    function updateFieldVisibility(row, selectedType) {
        const optionsContainer = row.querySelector('.dropdown-options-container');
        const maxLengthContainer = row.querySelector('.max-length-container');
        const caseTypeContainer = row.querySelector('.case-type-container');

        // 1. Show/Hide "Dropdown Options" Textarea
        if (selectedType === 'dropdown' || selectedType === 'radio') {
            optionsContainer.classList.remove('hidden');
        } else {
            optionsContainer.classList.add('hidden');
        }

        // 2. Show/Hide "Max Length" Box
        if (selectedType === 'string' || selectedType === 'textarea' || selectedType === 'numeric' || selectedType === 'email') {
            maxLengthContainer.classList.remove('hidden');
        } else {
            maxLengthContainer.classList.add('hidden');
        }

        // 3. Show/Hide "Case Type" Box
        if (selectedType === 'string' || selectedType === 'textarea') {
            caseTypeContainer.classList.remove('hidden');
        } else {
            caseTypeContainer.classList.add('hidden');
        }
    }

    // Function to re-number fields
    function updateFieldNumbers() {
        const allRows = document.querySelectorAll('.field-row');
        allRows.forEach((row, index) => {
            const newNumber = index + 1;
            const numberDisplay = row.querySelector('.field-number');
            if (numberDisplay) numberDisplay.textContent = newNumber;
            row.setAttribute('data-field-number', newNumber);
        });
        fieldCounter = allRows.length;
    }

    // =================================================================
    // START: "SAVE / UPDATE" LOGIC (Now with VALIDATION + DUPLICATE CHECK!)
    // =================================================================

    if (saveFormButton) {
        saveFormButton.addEventListener('click', async () => {
            
            // --- NEW VALIDATION LOGIC (Your Idea!) ---
            
            // 1. Check Step 1: Form Name
            const formName = formNameInput.value.trim();
            if (formName === '') {
                alert('Form Name is required. Please fill it out before saving.');
                formNameInput.focus(); // Puts the user's cursor in the box
                return; // Stop the function
            }

            // 2. Check Step 3: All Field Names
            const fieldRows = document.querySelectorAll('.field-row');
            let allFieldsValid = true;

            fieldRows.forEach(row => {
                const fieldNameInput = row.querySelector('.field-name-input');
                if (fieldNameInput.value.trim() === '') {
                    // This field is empty!
                    fieldNameInput.classList.add('border-red-500', 'focus:border-red-500', 'focus:ring-red-500/50'); // Add red border
                    allFieldsValid = false;
                } else {
                    // This field is valid, remove any old errors
                    fieldNameInput.classList.remove('border-red-500', 'focus:border-red-500', 'focus:ring-red-500/50');
                }
            });

            if (!allFieldsValid) {
                alert('One or more fields in Step 3 has no "Field Name". Please fill out all field names or delete the empty rows.');
                return; // Stop the function
            }
            
            // --- START: ANTI-DUPLICATION CHECK ---
            saveFormButton.disabled = true;
            saveFormButton.querySelector('.truncate').textContent = 'Checking...';

            try {
                // 3. Check if Form Name Exists
                const nameCheckSnapshot = await db.collection('forms')
                    .where('formName', '==', formName)
                    .get();

                let isDuplicate = false;
                if (!nameCheckSnapshot.empty) {
                    nameCheckSnapshot.forEach(doc => {
                        // If we found a doc with the same name...
                        // AND it is NOT the doc we are currently editing...
                        if (doc.id !== currentEditingFormId) {
                            isDuplicate = true;
                        }
                    });
                }

                if (isDuplicate) {
                    alert('Error: A form with this name already exists. Please choose a unique name.');
                    saveFormButton.disabled = false;
                    saveFormButton.querySelector('.truncate').textContent = currentEditingFormId ? 'Update Form' : 'Save Form';
                    return; // STOP EVERYTHING
                }
                
                // --- If we get here, all validation passed! ---
                saveFormButton.querySelector('.truncate').textContent = 'Saving...';

                // --- Part A: Read all the data from the form ---
                const orgName = orgNameInput.value;
                const coordinatorName = coordinatorNameInput.value;
                const coordinatorEmail = coordinatorEmailInput.value;
                const presetAmount = presetAmountInput.value;

                // Get Step 3 data
                const fields = [];
                
                fieldRows.forEach(row => {
                    const fieldObject = {
                        fieldName: row.querySelector('.field-name-input').value || null,
                        dataType: row.querySelector('.data-type-select').value,
                        caseType: row.querySelector('.case-type-select').value || null,
                        maxLength: row.querySelector('.max-length-input').value || null,
                        dropdownOptions: row.querySelector('.dropdown-options-input').value || null,
                        isMandatory: true
                    };
                    fields.push(fieldObject);
                });

                // --- Part B: Bundle all data ---
                const formDocument = {
                    formName: formName || null,
                    orgName: orgName || null,
                    coordinatorName: coordinatorName || null,
                    coordinatorEmail: coordinatorEmail || null,
                    sendEmailNotification: isEmailEnabled,
                    isPrepaid: isPaymentEnabled,
                    presetAmount: isPaymentEnabled ? presetAmount : null,
                    fields: fields,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp() // Add an "updated" timestamp
                };

                // --- Part C: Save or Update! ---
                if (currentEditingFormId) {
                    // --- WE ARE IN "EDIT MODE" ---
                    await db.collection('forms').doc(currentEditingFormId).update(formDocument);
                    alert('Success! Your form has been updated.');
                } else {
                    // --- WE ARE IN "CREATE MODE" ---
                    formDocument.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    await db.collection('forms').add(formDocument);
                    alert('Success! Your new form has been saved.');
                }
                
                // Send the user back to the management page
                window.location.href = 'form-management.html';

            } catch (error) {
                console.error("Error saving form: ", error);
                alert('An error occurred. Please try again.');
                
                // Re-enable the button
                saveFormButton.disabled = false;
                saveFormButton.querySelector('.truncate').textContent = currentEditingFormId ? 'Update Form' : 'Save Form';
            }
        });
    }

});