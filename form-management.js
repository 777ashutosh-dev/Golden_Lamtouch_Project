/*
  M18 - (Step 97) "Download OTPs" CSV Export
  -----------------------------------------------------
  This file now contains the logic for M18.
  
  UPDATES:
  1.  New global "memory" array: `allSubmissions = []`.
  2.  New function: `loadAllSubmissions()` to fill that memory.
  3.  New "click" listener for the `.download-otp-button`.
  4.  New "brain" function: `downloadOtpCsv(formId, formName)`
      This function is "smart":
      - It finds the *dynamic* field names for "Name" and "Email"
        from the form's `fields` array.
      - It cross-references `otps` with `submissions`.
      - It builds and triggers a CSV download.
  5.  New helper: `escapeCsvCell(str)` to safely handle
      commas in names (e.g., "Doe, John").
  6.  Table `rowHTML` updated with the new "Download OTPs" button.
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();
    
    const onFormDelete = firebase.functions().httpsCallable('onFormDelete');

    // --- Find all our "targets" in the HTML ---
    
    const formTableBody = document.getElementById('form-table-body'); 
    const searchInput = document.getElementById('form-search-input');
    
    // --- Filter/Sort Targets ---
    const groupFilterSelect = document.getElementById('group-filter-select');
    const sortAzButton = document.getElementById('sort-az-button');

    // --- Global variables to store our data ---
    let allForms = []; // Master list of forms
    let allGroups = []; // Master list of groups
    let allOtps = []; // Master list of OTPs
    let allSubmissions = []; // (NEW) Master list of Submissions
    
    let currentAssignFormId = null; 
    let currentOtpFormId = null; 


    // =================================================================
    // START: DATA LOADING & RENDERING
    // =================================================================

    // --- 1. Load All Forms from Firestore (Live) ---
    function loadAllForms() {
        if (formTableBody) { 
            
            // (M17 FIX) Removed .orderBy('createdAt', 'desc')
            db.collection('forms').onSnapshot(querySnapshot => {
                allForms = []; 
                querySnapshot.forEach(doc => {
                    allForms.push({ id: doc.id, ...doc.data() });
                });
                
                // (M17 FIX) We sort with JavaScript instead.
                allForms.sort((a, b) => {
                    const dateA = a.createdAt ? a.createdAt.seconds : 0;
                    const dateB = b.createdAt ? b.createdAt.seconds : 0;
                    return dateB - dateA; // Descending order
                });

                applyFiltersAndSort(); // Re-render table
            }, (error) => {
                console.error("Error fetching forms: ", error);
                formTableBody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-red-400">Error loading data. Check console.</td></tr>';
            });
        }
    }

    // --- 2. Load All Groups from Firestore (Live) ---
    function loadAllGroups() {
        db.collection('groups').orderBy('groupName').onSnapshot(snapshot => {
            allGroups = []; 
            snapshot.forEach(doc => {
                allGroups.push({ id: doc.id, ...doc.data() });
            });
            populateGroupDropdowns();
            renderManageGroupsList();
            applyFiltersAndSort(); // Re-render table
        }, (error) => {
            console.error("Error loading groups: ", error);
        });
    }

    // --- 3. Load All OTPs from Firestore (Live) ---
    function loadAllOtps() {
        db.collection('otps').onSnapshot(snapshot => {
            allOtps = [];
            snapshot.forEach(doc => {
                allOtps.push({ id: doc.id, ...doc.data() });
            });
            applyFiltersAndSort();
        }, (error) => {
            console.error("Error loading OTPs: ", error);
        });
    }
    
    // --- 4. (NEW) Load All Submissions from Firestore (Live) ---
    function loadAllSubmissions() {
        db.collection('submissions').onSnapshot(snapshot => {
            allSubmissions = [];
            snapshot.forEach(doc => {
                allSubmissions.push({ id: doc.id, ...doc.data() });
            });
            // We don't need to re-render the table on *submission*
            // changes, only when the user clicks "Download".
        }, (error) => {
            console.error("Error loading Submissions: ", error);
        });
    }


    // --- 5. Populate All Group Dropdowns ---
    function populateGroupDropdowns() {
        if (groupFilterSelect) {
            const currentVal = groupFilterSelect.value;
            groupFilterSelect.innerHTML = '<option value="all">All Groups</option>';
            allGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.groupName;
                groupFilterSelect.appendChild(option);
            });
            groupFilterSelect.value = currentVal;
        }
        
        const assignGroupSelect = document.getElementById('assign-group-select');
        if (assignGroupSelect) {
            assignGroupSelect.innerHTML = '<option value="none">No Group (Un-assign)</option>';
            allGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.groupName;
                assignGroupSelect.appendChild(option);
            });
        }
    }

    // --- 6. Master "Draw the Table" Function (UPGRADED for M18) ---
    function renderTable(formsToRender) {
        if (!formTableBody) return; // Safety check
        
        formTableBody.innerHTML = ''; 

        if (formsToRender.length === 0) {
            // (FIX) Colspan is 6
            formTableBody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-500">No forms match your search.</td></tr>';
            return;
        }

        formsToRender.forEach(formData => {
            const data = formData; 
            const formId = formData.id;
            
            const paymentStatus = data.isPrepaid 
                ? '<span class="text-yellow-400 font-medium">Prepaid</span>' 
                : '<span class="text-gray-400">Postpaid</span>';

            const group = allGroups.find(g => g.id === data.groupId);
            const groupBadge = group 
              ? `<span class="ml-2 px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded-full">${group.groupName}</span>` 
              : '';

            const otpsForThisForm = allOtps.filter(otp => otp.formId === formId);
            const totalOtps = otpsForThisForm.length;
            const usedOtps = otpsForThisForm.filter(otp => otp.isUsed === true).length;

            // (NEW) Updated rowHTML with the new button
            const rowHTML = `
                <tr class="border-b border-border-dark hover:bg-white/5">
                    <td class="px-6 py-4 text-sm font-semibold text-white">
                        <span>${data.formName || 'Untitled Form'}</span>
                        ${groupBadge}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-300">${data.orgName || 'N/A'}</td>
                    <td class="px-6 py-4 text-sm">${paymentStatus}</td>
                    
                    <td class="px-6 py-4 text-sm text-white font-medium">${totalOtps}</td>
                    <td class="px-6 py-4 text-sm text-gray-300">${usedOtps}</td>
                    
                    <td class="px-6 py-4 text-sm">
                        <div class="flex items-center gap-2">
                            <!-- (NEW) Download OTPs Button -->
                            <button data-id="${formId}" data-name="${data.formName || 'Untitled Form'}" class="download-otp-button p-2 text-green-400 hover:bg-green-500/10 rounded-lg" title="Download OTPs (CSV)">
                                <span class="material-symbols-outlined">download</span>
                            </button>
                            
                            <button data-id="${formId}" class="add-otp-button p-2 text-primary hover:bg-primary/20 rounded-lg" title="Add OTPs">
                                <span class="material-symbols-outlined">vpn_key</span>
                            </button>
                            <button data-id="${formId}" data-name="${data.formName || 'Untitled Form'}" data-group-id="${data.groupId || 'none'}" class="assign-group-button p-2 text-gray-400 hover:bg-white/10 rounded-lg" title="Assign Group">
                                <span class="material-symbols-outlined">label</span>
                            </button>
                            <button data-id="${formId}" class="edit-form-button p-2 text-gray-400 hover:bg-white/10 rounded-lg" title="Edit Form">
                                <span class="material-symbols-outlined">edit</span>
                            </button>
                            <button data-id="${formId}" data-form-name="${data.formName || 'this form'}" class="delete-form-button p-2 text-red-500 hover:bg-red-500/10 rounded-lg" title="Delete Form">
                                <span class="material-symbols-outlined">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            formTableBody.innerHTML += rowHTML;
        });
    }

    // =================================================================
    // START: FILTERING & SORTING LOGIC
    // =================================================================

    function applyFiltersAndSort() {
        let filteredForms = [...allForms]; 
        
        const searchTerm = searchInput ? searchInput.value : ''; 
        const selectedGroupId = groupFilterSelect ? groupFilterSelect.value : 'all';
        const isSortAz = sortAzButton ? sortAzButton.dataset.sorted === 'true' : false;

        if (searchTerm) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            filteredForms = filteredForms.filter(form => 
                (form.formName && form.formName.toLowerCase().includes(lowerSearchTerm)) ||
                (form.orgName && form.orgName.toLowerCase().includes(lowerSearchTerm))
            );
        }
        if (selectedGroupId !== 'all') {
            filteredForms = filteredForms.filter(form => form.groupId === selectedGroupId);
        }
        if (isSortAz) {
            filteredForms.sort((a, b) => (a.formName || '').localeCompare(b.formName || ''));
        }
        renderTable(filteredForms);
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', applyFiltersAndSort);
    }
    if (groupFilterSelect) {
        groupFilterSelect.addEventListener('change', applyFiltersAndSort);
    }
    if (sortAzButton) {
        sortAzButton.addEventListener('click', () => {
            const isCurrentlySorted = sortAzButton.dataset.sorted === 'true';
            if (isCurrentlySorted) {
                sortAzButton.dataset.sorted = 'false';
                sortAzButton.classList.remove('bg-primary/20', 'text-primary');
            } else {
                sortAzButton.dataset.sorted = 'true';
                sortAzButton.classList.add('bg-primary/20', 'text-primary');
            }
            applyFiltersAndSort();
        });
    }

    // =================================================================
    // START: MODAL 1: "CREATE GROUP"
    // =================================================================
    
    const createGroupButton = document.getElementById('create-group-button');
    if (createGroupButton) {
        createGroupButton.addEventListener('click', () => {
            const createGroupModal = document.getElementById('create-group-modal');
            const groupNameInput = document.getElementById('group-name-input');
            const groupErrorMessage = document.getElementById('create-group-error-message');
            
            if (createGroupModal) createGroupModal.classList.remove('hidden');
            if (groupErrorMessage) groupErrorMessage.textContent = '';
            if (groupNameInput) {
                groupNameInput.value = '';
                groupNameInput.focus();
            }
        });
    }

    // =================================================================
    // START: MODAL 2: "MANAGE GROUPS"
    // =================================================================
    
    const manageGroupsButton = document.getElementById('manage-groups-button');
    if (manageGroupsButton) {
        manageGroupsButton.addEventListener('click', () => {
            const manageGroupsModal = document.getElementById('manage-groups-modal');
            renderManageGroupsList(); 
            if (manageGroupsModal) manageGroupsModal.classList.remove('hidden');
        });
    }

    function renderManageGroupsList() {
        const groupListContainer = document.getElementById('group-list-container');
        const noGroupsMessage = document.getElementById('no-groups-message');
        
        if (!groupListContainer || !noGroupsMessage) return;
        
        if (allGroups.length === 0) {
            noGroupsMessage.classList.remove('hidden');
            groupListContainer.innerHTML = ''; 
        } else {
            noGroupsMessage.classList.add('hidden');
            groupListContainer.innerHTML = ''; 
            allGroups.forEach(group => {
                const row = document.createElement('div');
                row.className = 'flex justify-between items-center p-3 bg-background-dark rounded-lg';
                row.innerHTML = `
                    <span class="text-white">${group.groupName}</span>
                    <button class="delete-group-button p-1 text-gray-500 hover:text-red-500" data-id="${group.id}">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                `;
                groupListContainer.appendChild(row);
            });
        }
    }
    
    // =================================================================
    // START: TABLE ACTION BUTTONS (UPDATED FOR M18)
    // =================================================================
    
    if (formTableBody) {
        formTableBody.addEventListener('click', (e) => {
            
            // --- (NEW) Download OTPs Button ---
            const downloadButton = e.target.closest('.download-otp-button');
            if (downloadButton) {
                const formId = downloadButton.dataset.id;
                const formName = downloadButton.dataset.name;
                
                // Show a quick loading message
                downloadButton.classList.add('cursor-not-allowed', 'opacity-50');
                const icon = downloadButton.querySelector('.material-symbols-outlined');
                const originalIcon = icon.textContent;
                icon.textContent = 'hourglass_top';
                
                // We use a timeout to let the UI update *before*
                // we run the heavy CSV logic.
                setTimeout(() => {
                    try {
                        downloadOtpCsv(formId, formName);
                    } catch (err) {
                        console.error("Error generating CSV:", err);
                        alert("An error occurred while generating the CSV. Check the console.");
                    } finally {
                        // Reset the button
                        downloadButton.classList.remove('cursor-not-allowed', 'opacity-50');
                        icon.textContent = originalIcon;
                    }
                }, 50); // 50ms delay
                return;
            }

            const editButton = e.target.closest('.edit-form-button');
            if (editButton) {
                const formId = editButton.dataset.id;
                window.location.href = `form-creation.html?formId=${formId}`;
                return;
            }

            const assignButton = e.target.closest('.assign-group-button');
            if (assignButton) {
                const assignGroupModal = document.getElementById('assign-group-modal');
                const assignFormName = document.getElementById('assign-form-name');
                const assignGroupSelect = document.getElementById('assign-group-select');
                const assignGroupErrorMessage = document.getElementById('assign-group-error-message');
                
                currentAssignFormId = assignButton.dataset.id; 
                const formName = assignButton.dataset.name;
                const currentGroupId = assignButton.dataset.groupId;
                
                if (assignFormName) assignFormName.textContent = formName;
                if (assignGroupSelect) assignGroupSelect.value = currentGroupId;
                if (assignGroupErrorMessage) assignGroupErrorMessage.textContent = '';
                if (assignGroupModal) assignGroupModal.classList.remove('hidden');
                return;
            }

            const deleteButton = e.target.closest('.delete-form-button');
            if (deleteButton) {
                const formId = deleteButton.dataset.id;
                const formName = deleteButton.dataset.formName;
                
                if (confirm(`Are you sure you want to delete "${formName}"? This will delete all related submissions and OTPs. This cannot be undone.`)) {
                    
                    onFormDelete({ formId: formId })
                        .then((result) => {
                            console.log('Cloud Function Success:', result.data.message);
                            alert(`Success! "${formName}" and all its data have been deleted.`);
                        })
                        .catch((error) => {
                            console.error('Cloud Function Error:', error);
                            alert('An error occurred. The form could not be deleted. Check the console.');
                        });
                }
                return;
            }

            const otpButton = e.target.closest('.add-otp-button');
            if (otpButton) {
                const formId = otpButton.dataset.id;
                const form = allForms.find(f => f.id === formId);
                const formName = form ? (form.formName || 'Untitled Form') : 'this form';
                
                currentOtpFormId = formId; 
                
                const addOtpModal = document.getElementById('add-otp-modal');
                const otpFormName = document.getElementById('otp-form-name');
                const otpQuantityInput = document.getElementById('otp-quantity-input');
                const otpErrorMessage = document.getElementById('otp-error-message');

                if (otpFormName) {
                    otpFormName.textContent = formName;
                }
                if (otpQuantityInput) {
                    otpQuantityInput.value = '';
                }
                if (otpErrorMessage) {
                    otpErrorMessage.textContent = '';
                }
                if (addOtpModal) {
                    addOtpModal.classList.remove('hidden');
                }
                if (otpQuantityInput) {
                    otpQuantityInput.focus();
                }
                return;
            }
        });
    }

    // =================================================================
    // START: ALL MODAL BUTTONS (THE "CONSOLIDATED" LISTENER)
    // =================================================================
    
    document.body.addEventListener('click', async (e) => {
        
        // --- Create Group Modal: "Cancel" / "Close" ---
        if (e.target.closest('#close-create-modal-button') || e.target.closest('#cancel-create-modal-button')) {
            const modal = document.getElementById('create-group-modal');
            if (modal) modal.classList.add('hidden');
        }

        // --- Create Group Modal: "Save" ---
        const saveGroupButton = e.target.closest('#save-group-button');
        if (saveGroupButton) {
            const groupNameInput = document.getElementById('group-name-input');
            const groupErrorMessage = document.getElementById('create-group-error-message');
            const createGroupModal = document.getElementById('create-group-modal');
            
            const groupName = groupNameInput.value.trim();
            if (groupName === '') {
                groupErrorMessage.textContent = 'Group Name cannot be empty.';
                return; 
            }
            
            saveGroupButton.disabled = true;
            saveGroupButton.querySelector('.truncate').textContent = 'Saving...';
            groupErrorMessage.textContent = ''; 
            
            try {
                await db.collection('groups').add({
                    groupName: groupName,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                alert(`Success! Group "${groupName}" has been created.`);
                createGroupModal.classList.add('hidden');
            } catch (error) {
                console.error("Error saving group: ", error);
                groupErrorMessage.textContent = 'An error occurred. Please try again.';
            } finally {
                saveGroupButton.disabled = false;
                saveGroupButton.querySelector('.truncate').textContent = 'Save Group';
            }
        }

        // --- Manage Groups Modal: "Close" ---
        if (e.target.closest('#close-manage-modal-button')) {
            const modal = document.getElementById('manage-groups-modal');
            if (modal) modal.classList.add('hidden');
        }

        // --- Manage Groups Modal: "Delete" ---
        const deleteGroupButton = e.target.closest('.delete-group-button');
        if (deleteGroupButton) {
            const groupId = deleteGroupButton.dataset.id;
            if (confirm('Are you sure you want to delete this group? Forms will be un-assigned.')) {
                try {
                    await db.collection('groups').doc(groupId).delete();
                    alert('Group deleted.');
                } catch (error) {
                    console.error("Error deleting group: ", error);
                    alert('Error deleting group.');
                }
            }
        }

        // --- Assign Group Modal: "Cancel" / "Close" ---
        if (e.target.closest('#close-assign-modal-button') || e.target.closest('#cancel-assign-modal-button')) {
            const modal = document.getElementById('assign-group-modal');
            if (modal) modal.classList.add('hidden');
        }

        // --- Assign Group Modal: "Save" ---
        const saveAssignButton = e.target.closest('#save-assign-button');
        if (saveAssignButton) {
            const assignGroupSelect = document.getElementById('assign-group-select');
            const assignGroupErrorMessage = document.getElementById('assign-group-error-message');
            
            if (!currentAssignFormId) {
                assignGroupErrorMessage.textContent = 'Error: No form selected.';
                return;
            }
            
            const selectedGroupId = assignGroupSelect.value;
            saveAssignButton.disabled = true;
            saveAssignButton.querySelector('.truncate').textContent = 'Saving...';
            
            try {
                const newGroupValue = selectedGroupId === 'none' ? null : selectedGroupId;
                await db.collection('forms').doc(currentAssignFormId).update({
                    groupId: newGroupValue
                });
                document.getElementById('assign-group-modal').classList.add('hidden');
            } catch (error) {
                console.error("Error assigning group: ", error);
                assignGroupErrorMessage.textContent = 'An error occurred.';
            } finally {
                saveAssignButton.disabled = false;
                saveAssignButton.querySelector('.truncate').textContent = 'Save Assignment';
                currentAssignFormId = null;
            }
        }

        // --- Add OTP Modal: "Cancel" / "Close" ---
        if (e.target.closest('#close-otp-modal-button') || e.target.closest('#cancel-otp-modal-button')) {
            const modal = document.getElementById('add-otp-modal');
            if (modal) modal.classList.add('hidden');
        }

        // --- Add OTP Modal: "Generate" ---
        const generateOtpButton = e.target.closest('#generate-otp-button');
        if (generateOtpButton) {
            const otpQuantityInput = document.getElementById('otp-quantity-input');
            const otpErrorMessage = document.getElementById('otp-error-message');
            
            const quantity = parseInt(otpQuantityInput.value, 10);
            
            if (isNaN(quantity) || quantity <= 0) {
                otpErrorMessage.textContent = 'Please enter a valid number (1 or more).';
                return;
            }
            if (quantity > 1000) {
                otpErrorMessage.textContent = 'You can only generate 1000 codes at a time.';
                return;
            }
            
            if (!currentOtpFormId) {
                otpErrorMessage.textContent = 'Error: No form selected. Please close and re-open this modal.';
                return;
            }
            
            otpErrorMessage.textContent = '';
            generateOtpButton.disabled = true;
            generateOtpButton.querySelector('.truncate').textContent = 'Generating...';
            
            try {
                const batchLimit = 500;
                let batch = db.batch();
                let count = 0;

                for (let i = 0; i < quantity; i++) {
                    const newCode = generateRandomCode();
                    const newOtpRef = db.collection('otps').doc(); 
                    const otpDoc = {
                        formId: currentOtpFormId,
                        code: newCode.toLowerCase(), 
                        isUsed: false,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    batch.set(newOtpRef, otpDoc);
                    count++;
                    
                    if (count === batchLimit) {
                        await batch.commit();
                        batch = db.batch();
                        count = 0;
                    }
                }
                
                if (count > 0) {
                    await batch.commit();
                }

                alert(`Success! ${quantity} new OTPs have been generated.`);
                document.getElementById('add-otp-modal').classList.add('hidden');
                
            } catch (error) {
                console.error("Error generating OTPs: ", error);
                otpErrorMessage.textContent = 'An error occurred. Please try again.';
            } finally {
                generateOtpButton.disabled = false;
                generateOtpButton.querySelector('.truncate').textContent = 'Generate';
                otpQuantityInput.value = '';
                currentOtpFormId = null; 
            }
        }
    });

    // --- Helper function to generate random code ---
    function generateRandomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    // =================================================================
    // START: (NEW) M18 - CSV EXPORT "BRAIN"
    // =================================================================

    /**
     * This is a "stable" helper function to make sure
     * text with commas (like "Doe, John") doesn't break
     * the CSV format.
     */
    function escapeCsvCell(str) {
        if (str === null || str === undefined) {
            return '';
        }
        let result = String(str);
        // If the string contains a comma, a quote, or a newline,
        // wrap it in double quotes and escape any existing quotes.
        if (result.includes(',') || result.includes('"') || result.includes('\n')) {
            result = '"' + result.replace(/"/g, '""') + '"';
        }
        return result;
    }

    /**
     * This is the "master" function for downloading the OTP report.
     */
    function downloadOtpCsv(formId, formName = 'report') {
        
        // --- 1. Find the "Smart" Field Names ---
        const form = allForms.find(f => f.id === formId);
        let nameFieldName = null;
        let emailFieldName = null;

        if (form && form.fields) {
            // Find the *first* string field (assume it's the name)
            const nameField = form.fields.find(f => f.dataType === 'string');
            if (nameField) {
                nameFieldName = nameField.fieldName;
            }
            // Find the *first* email field
            const emailField = form.fields.find(f => f.dataType === 'email');
            if (emailField) {
                emailFieldName = emailField.fieldName;
            }
        }
        
        console.log(`Smart Fields Found: Name='${nameFieldName}', Email='${emailFieldName}'`);

        // --- 2. Filter OTPs and Submissions ---
        const otpsForThisForm = allOtps.filter(otp => otp.formId === formId);
        
        // (NEW) We also need to sort the OTPs by when they were
        // created so the "Serial Number" is consistent.
        otpsForThisForm.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.seconds : 0;
            const dateB = b.createdAt ? b.createdAt.seconds : 0;
            return dateA - dateB; // Ascending order (oldest first)
        });

        // --- 3. Build the CSV Data ---
        const csvRows = [];
        // Header Row (as you requested)
        csvRows.push('"Serial Number","OTP","Status","Used By Name","Used By Email"');

        otpsForThisForm.forEach((otp, index) => {
            const serial = index + 1;
            const code = otp.code;
            const status = otp.isUsed ? "Used" : "Unused";
            
            let name = "";
            let email = "";

            // If the OTP is used, find the matching submission
            if (otp.isUsed) {
                const submission = allSubmissions.find(sub => sub.otpId === otp.id);
                if (submission) {
                    // Use our "smart" field names to get the data
                    if (nameFieldName && submission[nameFieldName]) {
                        name = submission[nameFieldName];
                    }
                    if (emailFieldName && submission[emailFieldName]) {
                        email = submission[emailFieldName];
                    }
                }
            }
            
            // Add the row, escaping each cell
            csvRows.push([
                serial,
                escapeCsvCell(code),
                escapeCsvCell(status),
                escapeCsvCell(name),
                escapeCsvCell(email)
            ].join(','));
        });

        if (csvRows.length <= 1) {
            alert("No OTPs found for this form.");
            return;
        }

        // --- 4. Create and Trigger the Download ---
        const csvContent = csvRows.join('\n');
        
        // We need to add a "BOM" (Byte Order Mark) so that
        // Excel opens non-English characters correctly.
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        
        // Clean up the form name and add a date
        const safeName = formName.replace(/[^a-zA-Z0-9]/g, '_');
        const date = new Date().toISOString().split('T')[0]; // '2025-11-17'
        link.setAttribute("download", `${safeName}_OTPs_${date}.csv`);
        
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }


    // =================================================================
    // --- This is what starts everything ---
    // =================================================================
    loadAllGroups();
    loadAllForms();
    loadAllOtps();
    loadAllSubmissions(); // (NEW) Load submissions into memory

});