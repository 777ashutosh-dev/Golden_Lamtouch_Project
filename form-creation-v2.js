/*
This is the *NEW, FIXED* JavaScript file for your form-creation.html page.
It includes:
1.  All our old, working toggle logic.
2.  Our "future-proof" "+ Add Field" logic.
3.  NEW: The *FIXED* logic for the "Save Form" button.
*/
document.addEventListener('DOMContentLoaded', () => {

    // --- We need access to our database! ---
    // We get these from the script block in our HTML
    const db = firebase.firestore();

    // --- START: TOGGLE LOGIC (Already Working) ---
    
    const emailToggle = document.getElementById('email-toggle');
    const emailToggleKnob = document.getElementById('email-toggle-knob');
    const paymentToggle = document.getElementById('payment-toggle');
    const paymentToggleKnob = document.getElementById('payment-toggle-knob');
    const presetAmountContainer = document.getElementById('preset-amount-container');

    let isEmailEnabled = false;
    let isPaymentEnabled = false;

    if (emailToggle) {
        emailToggle.addEventListener('click', () => {
            isEmailEnabled = !isEmailEnabled; // Flip the value
            emailToggleKnob.classList.toggle('translate-x-5', isEmailEnabled);
            emailToggleKnob.classList.toggle('translate-x-0', !isEmailEnabled);
            emailToggle.classList.toggle('bg-primary', isEmailEnabled);
            emailToggle.classList.toggle('bg-gray-600', !isEmailEnabled);
            emailToggle.setAttribute('aria-checked', isEmailEnabled);
        });
    }

    if (paymentToggle) {
        paymentToggle.addEventListener('click', () => {
            isPaymentEnabled = !isPaymentEnabled; // Flip the value
            paymentToggleKnob.classList.toggle('translate-x-5', isPaymentEnabled);
            paymentToggleKnob.classList.toggle('translate-x-0', !isPaymentEnabled);
            paymentToggle.classList.toggle('bg-primary', isPaymentEnabled);
            paymentToggle.classList.toggle('bg-gray-600', !isPaymentEnabled);
            paymentToggle.setAttribute('aria-checked', isPaymentEnabled);

            if (isPaymentEnabled) {
                presetAmountContainer.classList.remove('hidden');
            } else {
                presetAmountContainer.classList.add('hidden');
            }
        });
    }
    
    // --- END: TOGGLE LOGIC ---


    // --- START: "ADD FIELD" LOGIC (Already Working) ---

    const addFieldButton = document.getElementById('add-field-button');
    const fieldsContainer = document.getElementById('fields-container');
    
    let fieldCounter = 0;

    if (addFieldButton) {
        addFieldButton.addEventListener('click', () => {
            fieldCounter++;
            
            const newFieldRow = document.createElement('div');
            newFieldRow.className = 'field-row p-4 bg-background-dark rounded-lg border border-border-dark flex flex-col gap-4';
            newFieldRow.setAttribute('data-field-number', fieldCounter);

            const fieldHTML = `
                <!-- Top Row: Field Number, Field Name, Data Type, Case Type -->
                <div class="flex flex-wrap gap-4 items-center">
                    
                    <div class="flex items-center justify-center h-10 w-10 bg-surface-dark border border-border-dark rounded-lg text-primary font-bold text-lg">
                        ${fieldCounter}
                    </div>

                    <div class="flex-1 min-w-[200px]">
                        <label class="text-xs font-medium text-gray-400">Field Name</label>
                        <input type="text" placeholder="e.g., 'Candidate Name'" class="field-name-input w-full h-10 px-4 mt-1 rounded-lg bg-surface-dark border border-border-dark text-white placeholder-gray-500 focus:ring-primary focus:border-primary text-sm" />
                    </div>

                    <div class="flex-1 min-w-[150px]">
                        <label class="text-xs font-medium text-gray-400">Data Type</label>
                        <select class="data-type-select w-full h-10 px-4 mt-1 rounded-lg bg-surface-dark border border-border-dark text-white focus:ring-primary focus:border-primary text-sm">
                            <option value="string">String (Text)</option>
                            <option value="email">Email</option>
                            <option value="textarea">Textarea (Multi-line)</option>
                            <option value="numeric">Numeric</option>
                            <option value="date">Date</option>
                            <option value="datetime">Date & Time</option>
                            <option value="checkbox">Checkbox (Yes/No)</option>
                            <option valueD="radio">Radio Button Group</option>
                            <option value="dropdown">Dropdown (Select Menu)</option>
                            <option value="image">Image</option>
                            <option value="signature">Signature</option>
                            <option value="file">File</option>
                            <option value="header">Section Header</option>
                            <option value="hidden">Hidden Field</option>
                        </select>
                    </div>

                    <div class="case-type-container flex-1 min-w-[150px]">
                        <label class="text-xs font-medium text-gray-400">Case Type</label>
                        <select class="case-type-select w-full h-10 px-4 mt-1 rounded-lg bg-surface-dark border border-border-dark text-white focus:ring-primary focus:border-primary text-sm">
                            <option value="as-typed">As Typed</option>
                            <option value="all-caps">All Capitals</option>
                            <option value="sentence-case">Sentence Case</option>
                        </select>
                    </div>

                    <div class="flex items-end">
                        <button type="button" class="delete-field-button p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </div>
                </div>

                <!-- Bottom Row: Max Length, Dropdown Options -->
                <div class="flex flex-wrap gap-4 items-center">
                    
                    <div class="max-length-container flex-none min-w-[100px] w-28">
                        <label class="text-xs font-medium text-gray-400">Max Length</label>
                        <input type="number" placeholder="e.g., 50" class="max-length-input w-full h-10 px-4 mt-1 rounded-lg bg-surface-dark border border-border-dark text-white placeholder-gray-500 focus:ring-primary focus:border-primary text-sm" />
                    </div>

                    <div class="dropdown-options-container flex-1 min-w-[200px] hidden">
                        <label class="text-xs font-medium text-gray-400">Options (one per line)</label>
                        <textarea class="dropdown-options-input w-full p-4 mt-1 rounded-lg bg-surface-dark border border-border-dark text-white placeholder-gray-500 focus:ring-primary focus:border-primary text-sm" rows="3" placeholder="e.g.,&#10;Male&#10;Female&#10;Other"></textarea>
                    </div>
                </div>
            `;
            
            newFieldRow.innerHTML = fieldHTML;
            fieldsContainer.appendChild(newFieldRow);
        });
    }

    if (fieldsContainer) {
        fieldsContainer.addEventListener('click', (e) => {
            const deleteButton = e.target.closest('.delete-field-button');
            if (deleteButton) {
                deleteButton.closest('.field-row').remove();
                updateFieldNumbers();
            }
        });

        fieldsContainer.addEventListener('change', (e) => {
            if (e.target.classList.contains('data-type-select')) {
                
                const row = e.target.closest('.field-row');
                const optionsContainer = row.querySelector('.dropdown-options-container');
                const maxLengthContainer = row.querySelector('.max-length-container');
                const caseTypeContainer = row.querySelector('.case-type-container');
                
                const selectedType = e.target.value;

                if (selectedType === 'dropdown' || selectedType === 'radio') {
                    optionsContainer.classList.remove('hidden');
                } else {
                    optionsContainer.classList.add('hidden');
                }

                if (selectedType === 'string' || selectedType === 'textarea' || selectedType === 'numeric' || selectedType === 'email') {
                    maxLengthContainer.classList.remove('hidden');
                } else {
                    maxLengthContainer.classList.add('hidden');
                }

                if (selectedType === 'string' || selectedType === 'textarea') {
                    caseTypeContainer.classList.remove('hidden');
                } else {
                    caseTypeContainer.classList.add('hidden');
                }
            }
        });
    }
    
    function updateFieldNumbers() {
        const allRows = document.querySelectorAll('.field-row');
        allRows.forEach((row, index) => {
            const newNumber = index + 1;
            const numberDisplay = row.querySelector('.h-10.w-10');
            if (numberDisplay) {
                numberDisplay.textContent = newNumber;
            }
            row.setAttribute('data-field-number', newNumber);
        });
        fieldCounter = allRows.length;
    }

    // --- END: "ADD FIELD" LOGIC ---


    // --- START: NEW "SAVE FORM" LOGIC (Baby Step 45 - FIXED!) ---

    // 1. Find the "Save Form" button
    const saveFormButton = document.getElementById('save-form-button');

    if (saveFormButton) {
        saveFormButton.addEventListener('click', async () => {
            // Put a "loading" state on the button to prevent double-clicks
            saveFormButton.disabled = true;
            saveFormButton.textContent = 'Saving...';

            try {
                // --- Part A: Read all the data from the form ---

                // Get Step 1 data (FIXED!)
                const formName = document.getElementById('form-name').value;
                const orgName = document.getElementById('org-name').value;
                const coordinatorName = document.getElementById('coordinator-name').value;
                const coordinatorEmail = document.getElementById('coordinator-email').value;
                // isEmailEnabled (from our toggle logic) is already in memory
                
                // Get Step 2 data
                // isPaymentEnabled (from our toggle logic) is already in memory
                const presetAmount = document.getElementById('preset-amount').value;

                // Get Step 3 data (the hard part)
                const fields = []; // We will fill this array
                const fieldRows = document.querySelectorAll('.field-row');

                fieldRows.forEach(row => {
                    const fieldName = row.querySelector('.field-name-input').value;
                    const dataType = row.querySelector('.data-type-select').value;
                    const caseType = row.querySelector('.case-type-select').value;
                    const maxLength = row.querySelector('.max-length-input').value;
                    const dropdownOptions = row.querySelector('.dropdown-options-input').value;
                    const isMandatory = true; // We hard-coded this per your request!

                    const fieldObject = {
                        fieldName: fieldName || null, // Save null if empty
                        dataType: dataType,
                        caseType: caseType || null,
                        maxLength: maxLength || null,
                        dropdownOptions: dropdownOptions || null,
                        isMandatory: isMandatory
                    };

                    fields.push(fieldObject);
                });

                // --- Part B: Bundle all data into one main object (FIXED!) ---
                
                const newFormDocument = {
                    formName: formName || null, // Save null if empty
                    orgName: orgName || null,
                    coordinatorName: coordinatorName || null,
                    coordinatorEmail: coordinatorEmail || null,
                    sendEmailNotification: isEmailEnabled,
                    isPrepaid: isPaymentEnabled,
                    presetAmount: isPaymentEnabled ? presetAmount : null,
                    fields: fields, // This is our array of field objects
                    createdAt: firebase.firestore.FieldValue.serverTimestamp() // Add a timestamp
                };

                // --- Part C: Save it to Firestore! ---
                
                // We will create a *new* collection called "forms"
                await db.collection('forms').add(newFormDocument);

                // If it worked, show a success message!
                alert('Success! Your new form has been saved.');
                
                // Send the user back to the dashboard
                window.location.href = 'dashboard.html';

            } catch (error) {
                // If something went wrong, log it and show an error
                console.error("Error saving form: ", error);
                alert('An error occurred. Please try again.');
                
                // Re-enable the button so the user can try again
                saveFormButton.disabled = false;
                saveFormButton.textContent = 'Save Form';
            }
        });
    }

});