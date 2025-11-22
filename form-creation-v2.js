/*
  M28 v5 - (SOLID BLOOD GROUP) Form Creation Brain
  -----------------------------------------------------
  Updates:
  1. UX: "Blood Group" options are now READ-ONLY (Solid).
     - Users cannot delete/edit the standard blood types.
  2. MEMORY: Added 'uiType' saving so Edit Mode remembers 
     if a field was a "Blood Group" field.
  3. PRESERVED: All M23 Logic + M28 Data Type Fixes.
*/

document.addEventListener('DOMContentLoaded', () => {

    // --- Database Access ---
    const db = firebase.firestore();

    // --- Targets ---
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
    
    // --- State ---
    let isEmailEnabled = false;
    let isPaymentEnabled = false;
    let fieldCounter = 0;
    let currentEditingFormId = null;

    // =================================================================
    // START: "EDIT MODE" LOGIC
    // =================================================================

    const urlParams = new URLSearchParams(window.location.search);
    const formIdFromUrl = urlParams.get('formId');

    if (formIdFromUrl) {
        currentEditingFormId = formIdFromUrl; 
        
        pageTitle.textContent = 'Edit Form';
        pageSubtitle.textContent = 'You are now editing an existing form.';
        saveFormButton.querySelector('.truncate').textContent = 'Update Form';
        
        const getFormSubmissions = db.collection('submissions').where('formId', '==', currentEditingFormId).limit(1).get();
        const getFormDoc = db.collection('forms').doc(currentEditingFormId).get();

        Promise.all([getFormSubmissions, getFormDoc])
            .then(([submissionsSnapshot, doc]) => {
                
                const hasSubmissions = !submissionsSnapshot.empty;

                if (doc.exists) {
                    const data = doc.data();

                    if (hasSubmissions) {
                        pageSubtitle.textContent = 'This form has live data. Destructive edits (like deleting fields) are disabled.';
                        pageSubtitle.classList.add('text-yellow-400');
                    }
                    
                    // Pre-fill Step 1
                    formNameInput.value = data.formName || '';
                    orgNameInput.value = data.orgName || '';
                    coordinatorNameInput.value = data.coordinatorName || '';
                    coordinatorEmailInput.value = data.coordinatorEmail || '';

                    // Pre-fill Step 2
                    if (data.sendEmailNotification) emailToggle.click(); 
                    if (data.isPrepaid) {
                        paymentToggle.click();
                        presetAmountInput.value = data.presetAmount || '';
                    }

                    // Pre-fill Step 3
                    if (data.fields && Array.isArray(data.fields)) {
                        data.fields.forEach(field => {
                            const newRow = createFieldRow(field, hasSubmissions);
                            fieldsContainer.insertBefore(newRow, addFieldButtonBottom);
                        });
                    }

                } else {
                    alert("Error: Form not found.");
                    window.location.href = 'dashboard.html';
                }
            })
            .catch((error) => {
                console.error("Error fetching form data: ", error);
                alert("An error occurred while fetching the form.");
            });
    }
    

    // =================================================================
    // START: TOGGLE LOGIC
    // =================================================================
    
    if (emailToggle) {
        emailToggle.addEventListener('click', () => {
            isEmailEnabled = !isEmailEnabled; 
            updateToggleUI(emailToggle, emailToggleKnob, isEmailEnabled);
        });
    }

    if (paymentToggle) {
        paymentToggle.addEventListener('click', () => {
            isPaymentEnabled = !isPaymentEnabled;
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
    // START: "ADD FIELD" LOGIC
    // =================================================================

    if (addFieldButtonTop) {
        addFieldButtonTop.addEventListener('click', () => {
            const newRow = createFieldRow(null, false); 
            fieldsContainer.insertBefore(newRow, addFieldButtonBottom);
        });
    }

    if (addFieldButtonBottom) {
        addFieldButtonBottom.addEventListener('click', () => {
            const newRow = createFieldRow(null, false); 
            fieldsContainer.insertBefore(newRow, addFieldButtonBottom);
        });
    }

    // --- MAIN FIELD CREATION FUNCTION ---
    function createFieldRow(fieldData = null, isLocked = false) {
        fieldCounter = document.querySelectorAll('.field-row').length + 1;
            
        const newFieldRow = document.createElement('div');
        newFieldRow.className = 'field-row p-4 bg-background-dark rounded-lg border border-border-dark flex flex-col gap-4';
        newFieldRow.setAttribute('data-field-number', fieldCounter);

        // Data defaults
        const fieldName = fieldData ? fieldData.fieldName : '';
        // IMPROVED: Prefer 'uiType' (if saved) so we remember it was a Blood Group
        const dataType = fieldData ? (fieldData.uiType || fieldData.dataType) : 'string'; 
        const caseType = fieldData ? fieldData.caseType : 'as-typed';
        const maxLength = fieldData ? fieldData.maxLength : '';
        const dropdownOptions = fieldData ? fieldData.dropdownOptions : '';
        
        // Format options for UI
        let optionsString = '';
        if (Array.isArray(dropdownOptions)) {
            optionsString = dropdownOptions.join(', ');
        } else if (typeof dropdownOptions === 'string') {
            optionsString = dropdownOptions.replace(/\n/g, ', ');
        }
        
        // --- HTML TEMPLATE ---
        const fieldHTML = `
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
                        <option value="blood_group" ${dataType === 'blood_group' ? 'selected' : ''}>Blood Group (Auto-Fill)</option>
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
                    <button type="button" class="delete-field-button p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg ${isLocked ? 'hidden' : ''}">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
            <div class="flex flex-wrap gap-4 items-center">
                <div class="max-length-container flex-none min-w-[100px] w-28">
                    <label class="text-xs font-medium text-gray-400">Max Length</label>
                    <input type="number" placeholder="e.g., 50" class="max-length-input w-full h-10 px-4 mt-1 rounded-lg bg-surface-dark border border-border-dark text-white placeholder-gray-500 focus:ring-primary focus:border-primary text-sm" value="${maxLength || ''}">
                </div>
                <div class="dropdown-options-container flex-1 min-w-[200px] hidden">
                    <label class="text-xs font-medium text-gray-400">Options (comma separated)</label>
                    <textarea class="dropdown-options-input w-full p-4 mt-1 rounded-lg bg-surface-dark border border-border-dark text-white placeholder-gray-500 focus:ring-primary focus:border-primary text-sm" rows="3" placeholder="e.g. Male, Female, Other">${optionsString || ''}</textarea>
                </div>
            </div>
        `;
        
        newFieldRow.innerHTML = fieldHTML;
        updateFieldVisibility(newFieldRow, dataType);
        
        return newFieldRow;
    }

    // --- SMART VISIBILITY + LOCKING LOGIC ---
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
                const selectedType = e.target.value;
                
                // --- AUTO-FILL ---
                if (selectedType === 'blood_group') {
                    const optionsInput = row.querySelector('.dropdown-options-input');
                    optionsInput.value = "A+, A-, B+, B-, O+, O-, AB+, AB-";
                }
                
                updateFieldVisibility(row, selectedType);
            }
        });
    }
    
    function updateFieldVisibility(row, selectedType) {
        const optionsContainer = row.querySelector('.dropdown-options-container');
        const optionsInput = row.querySelector('.dropdown-options-input');
        const maxLengthContainer = row.querySelector('.max-length-container');
        const caseTypeContainer = row.querySelector('.case-type-container');

        // 1. Visibility
        if (selectedType === 'dropdown' || selectedType === 'radio' || selectedType === 'blood_group') {
            optionsContainer.classList.remove('hidden');
        } else {
            optionsContainer.classList.add('hidden');
        }

        if (['string', 'textarea', 'numeric', 'email'].includes(selectedType)) {
            maxLengthContainer.classList.remove('hidden');
        } else {
            maxLengthContainer.classList.add('hidden');
        }

        if (['string', 'textarea'].includes(selectedType)) {
            caseTypeContainer.classList.remove('hidden');
        } else {
            caseTypeContainer.classList.add('hidden');
        }

        // 2. LOCKING LOGIC (Make it Solid)
        if (selectedType === 'blood_group') {
            optionsInput.readOnly = true; 
            optionsInput.classList.add('opacity-60', 'cursor-not-allowed');
        } else {
            optionsInput.readOnly = false;
            optionsInput.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }

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
    // START: SAVE / UPDATE LOGIC
    // =================================================================

    if (saveFormButton) {
        saveFormButton.addEventListener('click', async () => {
            
            const formName = formNameInput.value.trim();
            if (formName === '') {
                alert('Form Name is required.');
                formNameInput.focus();
                return;
            }

            const fieldRows = document.querySelectorAll('.field-row');
            let allFieldsValid = true;

            fieldRows.forEach(row => {
                const fieldNameInput = row.querySelector('.field-name-input');
                if (fieldNameInput.value.trim() === '') {
                    fieldNameInput.classList.add('border-red-500');
                    allFieldsValid = false;
                } else {
                    fieldNameInput.classList.remove('border-red-500');
                }
            });

            if (!allFieldsValid) {
                alert('Please fill out all Field Names.');
                return;
            }
            
            saveFormButton.disabled = true;
            saveFormButton.querySelector('.truncate').textContent = 'Checking...';

            try {
                const nameCheckSnapshot = await db.collection('forms')
                    .where('formName', '==', formName)
                    .get();

                let isDuplicate = false;
                if (!nameCheckSnapshot.empty) {
                    nameCheckSnapshot.forEach(doc => {
                        if (doc.id !== currentEditingFormId) isDuplicate = true;
                    });
                }

                if (isDuplicate) {
                    alert('Error: Form name already exists.');
                    saveFormButton.disabled = false;
                    saveFormButton.querySelector('.truncate').textContent = currentEditingFormId ? 'Update Form' : 'Save Form';
                    return;
                }
                
                saveFormButton.querySelector('.truncate').textContent = 'Saving...';

                const orgName = orgNameInput.value;
                const coordinatorName = coordinatorNameInput.value;
                const coordinatorEmail = coordinatorEmailInput.value;
                const presetAmount = presetAmountInput.value;

                const fields = [];
                
                fieldRows.forEach(row => {
                    const typeSelect = row.querySelector('.data-type-select');
                    const selectedUiType = typeSelect.value; // Capture the UI selection
                    let finalType = selectedUiType;
                    const optionsRaw = row.querySelector('.dropdown-options-input').value || '';
                    
                    // --- TRANSFORM 1: Macro Logic ---
                    if (finalType === 'blood_group') {
                        finalType = 'dropdown';
                    }

                    // --- TRANSFORM 2: STRINGIFY Logic ---
                    let finalOptionsString = '';
                    if (finalType === 'dropdown' || finalType === 'radio') {
                         const tempArray = optionsRaw.split(',').map(opt => opt.trim()).filter(opt => opt !== '');
                         finalOptionsString = tempArray.join('\n');
                    }

                    const fieldObject = {
                        fieldName: row.querySelector('.field-name-input').value || null,
                        dataType: finalType,
                        uiType: selectedUiType, // MEMORY: Save 'blood_group' here!
                        caseType: row.querySelector('.case-type-select').value || null,
                        maxLength: row.querySelector('.max-length-input').value || null,
                        dropdownOptions: finalOptionsString,
                        isMandatory: true
                    };
                    fields.push(fieldObject);
                });

                const formDocument = {
                    formName: formName || null,
                    orgName: orgName || null,
                    coordinatorName: coordinatorName || null,
                    coordinatorEmail: coordinatorEmail || null,
                    sendEmailNotification: isEmailEnabled,
                    isPrepaid: isPaymentEnabled,
                    presetAmount: isPaymentEnabled ? presetAmount : null,
                    fields: fields,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                if (currentEditingFormId) {
                    await db.collection('forms').doc(currentEditingFormId).update(formDocument);
                    alert('Success! Your form has been updated.');
                } else {
                    formDocument.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    await db.collection('forms').add(formDocument);
                    alert('Success! Your new form has been saved.');
                }
                
                window.location.href = 'form-management.html';

            } catch (error) {
                console.error("Error saving form: ", error);
                alert('An error occurred. Please try again.');
                saveFormButton.disabled = false;
                saveFormButton.querySelector('.truncate').textContent = currentEditingFormId ? 'Update Form' : 'Save Form';
            }
        });
    }

});