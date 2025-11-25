/*
  M23 v23 - (SECURE OTP GENERATION) Form Management Brain
  -----------------------------------------------------
  Updates:
  1. SECURITY: "Generate OTPs" now calls the Cloud Function 'generateBatchOTPs'.
     - Direct database writes removed to comply with strict security rules.
  2. FIX: Resolved "Permission Denied" error when creating OTPs.
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();
    
    // --- FIX: TELL FIREBASE TO USE INDIA ---
    const functions = firebase.app().functions('asia-south1');
    const onFormDelete = functions.httpsCallable('onFormDelete');
    const generateBatchOTPs = functions.httpsCallable('generateBatchOTPs'); // NEW FUNCTION

    // --- Page "Memory" ---
    let allForms = [];
    let allGroups = [];
    let allOtps = [];
    let isAscending = true; // State for sorting
    
    // --- Global "Targets" in the HTML ---
    const formTableBody = document.getElementById('form-table-body');
    const searchInput = document.getElementById('form-search-input');
    
    // --- NEW Targets for Restored UI ---
    const viewGroupSelect = document.getElementById('view-group-select'); 
    const sortAzButton = document.getElementById('sort-az-button');
    
    // --- Toolbar Targets ---
    const createGroupButton = document.getElementById('create-group-button');
    const manageGroupsButton = document.getElementById('manage-groups-button');

    // --- Private "Memory" for Modals ---
    let currentAssignFormId = null;
    let currentOtpFormId = null;

    // =================================================================
    // START: DATA LOADING (The "Heartbeat")
    // =================================================================

    // --- 1. Load All Forms (Live) ---
    function loadAllForms() {
        db.collection('forms').orderBy('formName', 'asc').onSnapshot(querySnapshot => {
            allForms = [];
            querySnapshot.forEach(doc => {
                allForms.push({ id: doc.id, ...doc.data() });
            });
            renderFilteredForms(); // Render the table on load
        }, (error) => {
            console.error("Error fetching forms: ", error);
            if(formTableBody) formTableBody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-red-400">Error loading forms.</td></tr>';
        });
    }

    // --- 2. Load All Groups (Live) ---
    function loadAllGroups() {
        db.collection('groups').orderBy('groupName').onSnapshot(snapshot => {
            allGroups = [];
            snapshot.forEach(doc => {
                allGroups.push({ id: doc.id, ...doc.data() });
            });
            populateGroupDropdowns();
            renderManageGroupsList();
            renderFilteredForms(); // Re-render table to update logic
        }, (error) => {
            console.error("Error loading groups: ", error);
        });
    }

    // --- 3. Load All Otps (Live) ---
    function loadAllOtps() {
        db.collection('otps').onSnapshot(snapshot => {
            allOtps = [];
            snapshot.forEach(doc => {
                allOtps.push({ id: doc.id, ...doc.data() });
            });
            renderFilteredForms(); // Re-render table to update counts
        }, (error) => {
            console.error("Error loading OTPs: ", error);
        });
    }
    
    // =================================================================
    // START: FILTERING & RENDERING (The "Brain")
    // =================================================================

    // --- Event Listeners for Toolbar ---
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderFilteredForms();
        });
    }

    if (viewGroupSelect) {
        viewGroupSelect.addEventListener('change', () => {
            renderFilteredForms();
        });
    }

    if (sortAzButton) {
        sortAzButton.addEventListener('click', () => {
            isAscending = !isAscending;
            renderFilteredForms();
        });
    }

    /**
     * This is the new "Master" function.
     * It filters by Search AND Group, then Sorts.
     */
    function renderFilteredForms() {
        
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const selectedGroupId = viewGroupSelect ? viewGroupSelect.value : 'all';

        // --- 1. Filter ---
        let processedForms = allForms.filter(form => {
            // Search Filter
            const nameMatch = form.formName && form.formName.toLowerCase().includes(searchTerm);
            const orgMatch = form.orgName && form.orgName.toLowerCase().includes(searchTerm);
            const matchesSearch = !searchTerm || nameMatch || orgMatch;

            // Group Filter
            const matchesGroup = (selectedGroupId === 'all') || (form.groupId === selectedGroupId);
            
            return matchesSearch && matchesGroup;
        });

        // --- 2. Add Analytics Data ---
        processedForms = processedForms.map(form => {
            const otpsForThisForm = allOtps.filter(otp => otp.formId === form.id);
            return {
                ...form,
                totalOtps: otpsForThisForm.length,
                usedOtps: otpsForThisForm.filter(otp => otp.isUsed === true).length,
            };
        });
        
        // --- 3. Sort ---
        processedForms.sort((a, b) => {
            const nameA = (a.formName || '').toLowerCase();
            const nameB = (b.formName || '').toLowerCase();
            if (nameA < nameB) return isAscending ? -1 : 1;
            if (nameA > nameB) return isAscending ? 1 : -1;
            return 0;
        });

        // --- 4. Render ---
        renderTable(processedForms);
    }
    
    // =================================================================
    // START: TABLE & MODAL RENDERING (The "UI")
    // =================================================================

    /**
     * Master "Draw the Table" Function
     */
    function renderTable(formsToRender) {
        if (!formTableBody) return;
        formTableBody.innerHTML = ''; 

        if (formsToRender.length === 0) {
            formTableBody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-500">No forms match your criteria.</td></tr>';
            return;
        }

        formsToRender.forEach(form => {
            const formId = form.id;
            
            // --- Group Badge Logic ---
            const group = allGroups.find(g => g.id === form.groupId);
            const groupBadge = group 
              ? `<span class="ml-2 px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded-full">${group.groupName}</span>` 
              : '';
            
            // Organisation Name
            const orgName = form.orgName || 'N/A';

            // Payment Status Logic
            const isPrepaid = form.isPrepaid === true;
            const paymentStatusText = isPrepaid ? 'Prepaid' : 'Postpaid';
            // Yellow for Prepaid, Gray for Postpaid
            const paymentStatusClass = isPrepaid ? 'text-primary font-medium' : 'text-gray-400';

            const rowHTML = `
                <tr class="border-b border-border-dark hover:bg-white/5">
                    <!-- Col 1: Form Name (With Badge) -->
                    <td class="px-6 py-4 text-sm font-semibold text-white">
                        <span>${form.formName || 'Untitled Form'}</span>
                        ${groupBadge}
                    </td>

                    <!-- Col 2: Organisation -->
                    <td class="px-6 py-4 text-sm text-gray-300">
                        ${orgName}
                    </td>

                    <!-- Col 3: Payment Status -->
                    <td class="px-6 py-4 text-sm ${paymentStatusClass}">
                        ${paymentStatusText}
                    </td>

                    <!-- Col 4: Total OTPs -->
                    <td class="px-6 py-4 text-sm text-gray-300">${form.totalOtps}</td>

                    <!-- Col 5: Used OTPs -->
                    <td class="px-6 py-4 text-sm text-gray-300">${form.usedOtps}</td>
                    
                    <!-- Col 6: Actions -->
                    <td class="px-6 py-4 text-sm">
                        <div class="flex items-center gap-1">
                            <!-- OTPs Button (Green Pin) -->
                            <button data-id="${formId}" data-name="${form.formName || 'Untitled Form'}" class="download-otp-button p-2 text-green-400 hover:bg-green-500/10 rounded-lg" title="Download OTPs (CSV)">
                                <span class="material-symbols-outlined">pin</span>
                            </button>
                            
                            <!-- Add OTP Button (Yellow Key) -->
                            <button data-id="${formId}" class="add-otp-button p-2 text-primary hover:bg-primary/10 rounded-lg" title="Add OTPs">
                                <span class="material-symbols-outlined">vpn_key</span>
                            </button>

                            <!-- Assign Group Button -->
                            <button data-id="${formId}" data-name="${form.formName || 'Untitled Form'}" data-group-id="${form.groupId || 'none'}" class="assign-group-button p-2 text-gray-400 hover:bg-white/10 rounded-lg" title="Assign Group">
                                <span class="material-symbols-outlined">label</span>
                            </button>

                            <!-- Edit Button -->
                            <button data-id="${formId}" class="edit-form-button p-2 text-gray-400 hover:bg-white/10 rounded-lg" title="Edit Form">
                                <span class="material-symbols-outlined">edit</span>
                            </button>

                            <!-- Delete Button -->
                            <button data-id="${formId}" data-form-name="${form.formName || 'this form'}" class="delete-form-button p-2 text-red-500 hover:bg-red-500/10 rounded-lg" title="Delete Form">
                                <span class="material-symbols-outlined">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            formTableBody.innerHTML += rowHTML;
        });
    }

    /**
     * Populates the "Group" dropdowns in the toolbar AND modals.
     */
    function populateGroupDropdowns() {
        // 1. Assign Modal Dropdown
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

        // 2. View By Group Filter Dropdown (Toolbar)
        if (viewGroupSelect) {
            // Save current selection if re-populating to prevent reset
            const currentVal = viewGroupSelect.value;
            
            viewGroupSelect.innerHTML = '<option value="all">All Groups</option>';
            allGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.groupName;
                viewGroupSelect.appendChild(option);
            });

            // Restore selection if it still exists
            if (currentVal !== 'all' && allGroups.find(g => g.id === currentVal)) {
                viewGroupSelect.value = currentVal;
            }
        }
    }

    /**
     * Renders the list in the "Manage Groups" modal.
     */
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
                // Add an ID to the row so we can find it later for manual removal
                row.id = `group-row-${group.id}`;
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
    // START: ACTION HANDLERS (The "Muscles")
    // =================================================================
    
    /**
     * This is the "widest net" listener for all clicks in the table body.
     */
    if (formTableBody) {
        formTableBody.addEventListener('click', (e) => {
            
            // --- OTP CSV Download ---
            const downloadOtpButton = e.target.closest('.download-otp-button');
            if (downloadOtpButton) {
                const formId = downloadOtpButton.dataset.id;
                const formName = downloadOtpButton.dataset.name;
                handleOtpCsvDownload(formId, formName, downloadOtpButton);
                return;
            }

            // --- Edit Form ---
            const editButton = e.target.closest('.edit-form-button');
            if (editButton) {
                const formId = editButton.dataset.id;
                window.location.href = `form-creation.html?formId=${formId}`;
                return;
            }

            // --- Assign Group ---
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

            // --- Delete Form (CALLING THE CLOUD) ---
            const deleteButton = e.target.closest('.delete-form-button');
            if (deleteButton) {
                const formId = deleteButton.dataset.id;
                const formName = deleteButton.dataset.formName;
                
                if (confirm(`Are you sure you want to delete "${formName}"? This will delete all related submissions, OTPs, and files. This cannot be undone.`)) {
                    
                    // This now calls the ASIA-SOUTH1 function
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

            // --- Add OTPs ---
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

                if (otpFormName) otpFormName.textContent = formName;
                if (otpQuantityInput) otpQuantityInput.value = '';
                if (otpErrorMessage) otpErrorMessage.textContent = '';
                if (addOtpModal) addOtpModal.classList.remove('hidden');
                if (otpQuantityInput) otpQuantityInput.focus();
                return;
            }
        });
    }

    /**
     * This is the "widest net" listener for all modal pop-ups
     */
    document.body.addEventListener('click', async (e) => {
        
        // --- Create Group Modal ---
        if (e.target.closest('#create-group-button')) {
             document.getElementById('create-group-modal').classList.remove('hidden');
        }
        if (e.target.closest('#close-create-modal-button') || e.target.closest('#cancel-create-modal-button')) {
            document.getElementById('create-group-modal').classList.add('hidden');
        }
        
        // --- SAVE GROUP LOGIC (UPDATED with Validation) ---
        if (e.target.closest('#save-group-button')) {
            const saveBtn = e.target.closest('#save-group-button');
            const originalText = '<span class="truncate">Save Group</span>'; // Store original text structure
            
            const groupNameInput = document.getElementById('group-name-input');
            const groupErrorMessage = document.getElementById('create-group-error-message');
            const groupName = groupNameInput.value.trim();
            
            if (groupName === '') {
                groupErrorMessage.textContent = 'Group Name cannot be empty.';
                return; 
            }

            // --- DUPLICATE CHECK ---
            const isDuplicate = allGroups.some(g => g.groupName.toLowerCase() === groupName.toLowerCase());
            if (isDuplicate) {
                groupErrorMessage.textContent = 'Error: A group with this name already exists.';
                return;
            }
            
            // 1. Loading State
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="truncate">Saving...</span>';
            groupErrorMessage.textContent = '';

            try {
                await db.collection('groups').add({ groupName: groupName });
                
                // 2. Success State (Green)
                saveBtn.classList.remove('bg-primary', 'text-background-dark');
                saveBtn.classList.add('bg-green-500', 'text-white');
                saveBtn.innerHTML = '<span class="truncate">Saved!</span>';
                
                // 3. Wait 1s, then close and reset
                setTimeout(() => {
                    document.getElementById('create-group-modal').classList.add('hidden');
                    
                    // Reset Inputs
                    groupNameInput.value = '';
                    
                    // Reset Button Style
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = originalText;
                    saveBtn.classList.add('bg-primary', 'text-background-dark');
                    saveBtn.classList.remove('bg-green-500', 'text-white');
                    
                }, 1000);
                
            } catch (error) {
                console.error("Error saving group: ", error);
                groupErrorMessage.textContent = 'An error occurred. Please try again.';
                
                // Reset Button on Error
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalText;
            }
        }

        // --- Manage Groups Modal ---
        if (e.target.closest('#manage-groups-button')) {
             document.getElementById('manage-groups-modal').classList.remove('hidden');
        }
        if (e.target.closest('#close-manage-modal-button')) {
            document.getElementById('manage-groups-modal').classList.add('hidden');
        }
        
        // --- DELETE GROUP LOGIC (OPTIMISTIC UI) ---
        const deleteGroupButton = e.target.closest('.delete-group-button');
        if (deleteGroupButton) {
            const groupId = deleteGroupButton.dataset.id;
            const rowToRemove = deleteGroupButton.closest('div'); // The row element
            
            if (confirm('Are you sure? This will not delete forms.')) {
                // Visually disable the button to prevent double-clicks
                deleteGroupButton.disabled = true;
                deleteGroupButton.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span>'; // Spinner icon

                db.collection('groups').doc(groupId).delete()
                    .then(() => {
                        // SUCCESS: Manually remove the row instantly!
                        if (rowToRemove) rowToRemove.remove();
                        
                        // If list is empty now, show "No groups" message
                        const container = document.getElementById('group-list-container');
                        if (container && container.children.length === 0) {
                             const msg = document.getElementById('no-groups-message');
                             if(msg) msg.classList.remove('hidden');
                        }
                    })
                    .catch(error => {
                        console.error('Error deleting group:', error);
                        alert('Error deleting group.');
                        // Revert button state on error
                        deleteGroupButton.disabled = false;
                        deleteGroupButton.innerHTML = '<span class="material-symbols-outlined">delete</span>';
                    });
            }
        }

        // --- Assign Group Modal ---
        if (e.target.closest('#close-assign-modal-button') || e.target.closest('#cancel-assign-modal-button')) {
            document.getElementById('assign-group-modal').classList.add('hidden');
        }
        if (e.target.closest('#save-assign-button')) {
            const assignGroupSelect = document.getElementById('assign-group-select');
            const newGroupValue = assignGroupSelect.value === 'none' ? null : assignGroupSelect.value;
            
            if (!currentAssignFormId) {
                 document.getElementById('assign-group-error-message').textContent = 'Error: No form selected.';
                 return;
            }
            
            db.collection('forms').doc(currentAssignFormId).update({ groupId: newGroupValue })
                .then(() => {
                    document.getElementById('assign-group-modal').classList.add('hidden');
                    currentAssignFormId = null;
                })
                .catch(err => document.getElementById('assign-group-error-message').textContent = 'An error occurred.');
        }

        // --- Add OTP Modal (SECURE CLOUD FUNCTION) ---
        if (e.target.closest('#close-otp-modal-button') || e.target.closest('#cancel-otp-modal-button')) {
            document.getElementById('add-otp-modal').classList.add('hidden');
        }
        if (e.target.closest('#generate-otp-button')) {
            const quantityInput = document.getElementById('otp-quantity-input');
            const errorMsg = document.getElementById('otp-error-message');
            const quantity = parseInt(quantityInput.value, 10);
            
            if (isNaN(quantity) || quantity <= 0 || quantity > 1000) {
                errorMsg.textContent = 'Please enter a valid number (1-1000).';
                return;
            }
            if (!currentOtpFormId) {
                errorMsg.textContent = 'Error: No form selected. Please close and re-open.';
                return;
            }
            
            const btn = e.target.closest('#generate-otp-button');
            btn.disabled = true;
            btn.querySelector('.truncate').textContent = 'Generating...';
            
            try {
                // --- NEW: CALL CLOUD FUNCTION (Secure) ---
                const result = await generateBatchOTPs({
                    formId: currentOtpFormId,
                    quantity: quantity
                });

                if (result.data.success) {
                    alert(`Success! ${result.data.count} new OTPs have been generated.`);
                    document.getElementById('add-otp-modal').classList.add('hidden');
                } else {
                    throw new Error("Unknown server error");
                }

            } catch (error) {
                console.error("Error generating OTPs: ", error);
                errorMsg.textContent = 'An error occurred. Please try again.';
            } finally {
                btn.disabled = false;
                btn.querySelector('.truncate').textContent = 'Generate';
                quantityInput.value = '';
                currentOtpFormId = null; 
            }
        }
    });

    // --- Helper function to generate random code (Unused now, but kept for ref) ---
    function generateRandomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    // =================================================================
    // START: CSV DOWNLOAD LOGIC (OTP Only)
    // =================================================================

    /**
     * Handles the click for "Download OTP CSV"
     * (We need to load allSubmissions *just for this function*)
     */
    async function handleOtpCsvDownload(formId, formName, buttonElement) {
        // Show a quick loading message
        buttonElement.classList.add('cursor-not-allowed', 'opacity-50');
        const icon = buttonElement.querySelector('.material-symbols-outlined');
        const originalIcon = icon.textContent;
        icon.textContent = 'hourglass_top';
        
        try {
            // --- LOAD SUBMISSIONS (One-time) ---
            // This is the only place we need submissions now.
            const submissionsSnapshot = await db.collection('submissions').where('formId', '==', formId).get();
            const submissionsForThisForm = submissionsSnapshot.docs.map(doc => doc.data());
            // --- End Load ---

            const form = allForms.find(f => f.id === formId);
            let nameFieldName = null;
            let emailFieldName = null;

            if (form && form.fields) {
                const nameField = form.fields.find(f => f.dataType === 'string');
                if (nameField) nameFieldName = nameField.fieldName;
                const emailField = form.fields.find(f => f.dataType === 'email');
                if (emailField) emailFieldName = emailField.fieldName;
            }
            
            const otpsForThisForm = allOtps.filter(otp => otp.formId === formId);
            otpsForThisForm.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

            const csvRows = ['"Serial Number","OTP","Status","Used By Name","Used By Email"'];
            otpsForThisForm.forEach((otp, index) => {
                const serial = index + 1;
                const status = otp.isUsed ? "Used" : "Unused";
                let name = "", email = "";
                if (otp.isUsed) {
                    // Search the submissions we just loaded
                    const submission = submissionsForThisForm.find(sub => sub.otpId === otp.id);
                    if (submission) {
                        if (nameFieldName) name = submission[nameFieldName] || "";
                        if (emailFieldName) email = submission[emailFieldName] || "";
                    }
                }
                csvRows.push([serial, escapeCsvCell(otp.code), status, escapeCsvCell(name), escapeCsvCell(email)].join(','));
            });

            if (csvRows.length <= 1) {
                alert("No OTPs found for this form.");
                return;
            }
            triggerCsvDownload(csvRows.join('\n'), `${formName}_OTPs`);

        } catch (err) {
            console.error("Error generating OTP CSV:", err);
            alert("An error occurred. Check the console.");
        } finally {
            buttonElement.classList.remove('cursor-not-allowed', 'opacity-50');
            icon.textContent = originalIcon;
        }
    }

    /**
     * Helper: Escapes a cell for CSV content
     */
    function escapeCsvCell(cell) {
        if (cell === null || cell === undefined) {
            return '""';
        }
        let cellString = String(cell);
        if (cellString.includes('"') || cellString.includes(',')) {
            cellString = '"' + cellString.replace(/"/g, '""') + '"';
        }
        return cellString;
    }
    
    /**
     * Helper: Triggers the actual file download
     */
    function triggerCsvDownload(csvContent, baseFileName) {
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const date = new Date().toISOString().split('T')[0];
        const safeName = baseFileName.replace(/[^a-zA-Z0-9]/g, '_');
        
        link.setAttribute("href", url);
        link.setAttribute("download", `${safeName}_${date}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    

    // =================================================================
    // START: INITIALIZE THE PAGE
    // =================================================================
    
    function initializePage() {
        loadAllGroups();
        loadAllForms();
        loadAllOtps();
    }

    initializePage();

});