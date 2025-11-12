/*
  M14 - COMPLETE (Baby Step 69)
  -----------------------------------------------------
  This file now contains all logic for M12, M13, AND M14.
  
  This file handles:
  1. All M12/M13 features (Groups, Sort, Filter, Add OTPs)
  2. (NEW) A global 'allOtps' array
  3. (NEW) A 'loadAllOtps()' function to listen to the 'otps' collection
  4. (NEW) Upgraded 'renderTable()' to show live, accurate OTP counts
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();

    // --- Find all our "targets" in the HTML ---
    const formTableBody = document.getElementById('form-table-body');
    const searchInput = document.getElementById('form-search-input');
    
    // --- Create Group Modal Targets ---
    const createGroupModal = document.getElementById('create-group-modal');
    const createGroupButton = document.getElementById('create-group-button');
    const closeModalButton = document.getElementById('close-create-modal-button');
    const cancelGroupButton = document.getElementById('cancel-create-modal-button');
    const saveGroupButton = document.getElementById('save-group-button');
    const groupNameInput = document.getElementById('group-name-input');
    const groupErrorMessage = document.getElementById('create-group-error-message');
    
    // --- Filter/Sort Targets ---
    const groupFilterSelect = document.getElementById('group-filter-select');
    const sortAzButton = document.getElementById('sort-az-button');
    
    // --- Manage Groups Modal Targets ---
    const manageGroupsButton = document.getElementById('manage-groups-button');
    const manageGroupsModal = document.getElementById('manage-groups-modal');
    const closeManageModalButton = document.getElementById('close-manage-modal-button');
    const groupListContainer = document.getElementById('group-list-container');
    const noGroupsMessage = document.getElementById('no-groups-message');
    
    // --- Assign Group Modal Targets ---
    const assignGroupModal = document.getElementById('assign-group-modal');
    const closeAssignModalButton = document.getElementById('close-assign-modal-button');
    const cancelAssignModalButton = document.getElementById('cancel-assign-modal-button');
    const saveAssignButton = document.getElementById('save-assign-button');
    const assignFormName = document.getElementById('assign-form-name');
    const assignGroupSelect = document.getElementById('assign-group-select');
    const assignGroupErrorMessage = document.getElementById('assign-group-error-message');

    // --- OTP Modal Targets ---
    const addOtpModal = document.getElementById('add-otp-modal');
    const closeOtpModalButton = document.getElementById('close-otp-modal-button');
    const cancelOtpModalButton = document.getElementById('cancel-otp-modal-button');
    const generateOtpButton = document.getElementById('generate-otp-button');
    const otpFormName = document.getElementById('otp-form-name');
    const otpQuantityInput = document.getElementById('otp-quantity-input');
    const otpErrorMessage = document.getElementById('otp-error-message');

    // --- Global variables to store our data ---
    let allForms = []; // Master list of forms
    let allGroups = []; // Master list of groups
    let allOtps = []; // (NEW) Master list of OTPs
    let currentAssignFormId = null; 
    let currentOtpFormId = null; 


    // =================================================================
    // START: DATA LOADING & RENDERING
    // =================================================================

    // --- 1. Load All Forms from Firestore (Live) ---
    function loadAllForms() {
        if (formTableBody) {
            db.collection('forms').orderBy('createdAt', 'desc').onSnapshot(querySnapshot => {
                allForms = []; 
                querySnapshot.forEach(doc => {
                    allForms.push({ id: doc.id, ...doc.data() });
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

    // --- 3. (NEW) Load All OTPs from Firestore (Live) ---
    function loadAllOtps() {
        db.collection('otps').onSnapshot(snapshot => {
            allOtps = [];
            snapshot.forEach(doc => {
                allOtps.push({ id: doc.id, ...doc.data() });
            });
            // When OTPs change (like after generating new ones),
            // we MUST re-render the table to show the new counts.
            applyFiltersAndSort();
        }, (error) => {
            console.error("Error loading OTPs: ", error);
        });
    }


    // --- 4. Populate All Group Dropdowns ---
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

    // --- 5. Master "Draw the Table" Function (UPGRADED for M14) ---
    function renderTable(formsToRender) {
        formTableBody.innerHTML = ''; 

        if (formsToRender.length === 0) {
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

            // --- (NEW) OTP Counting Logic (Baby Step 69) ---
            // 1. Get all OTPs that match this form's ID
            const otpsForThisForm = allOtps.filter(otp => otp.formId === formId);
            // 2. Count the total
            const totalOtps = otpsForThisForm.length;
            // 3. Count only the ones that are 'isUsed: true'
            const usedOtps = otpsForThisForm.filter(otp => otp.isUsed === true).length;
            // --- End of new logic ---

            const rowHTML = `
                <tr class="border-b border-border-dark hover:bg-white/5">
                    <td class="px-6 py-4 text-sm font-semibold text-white">
                        <span>${data.formName || 'Untitled Form'}</span>
                        ${groupBadge}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-300">${data.orgName || 'N/A'}</td>
                    <td class="px-6 py-4 text-sm">${paymentStatus}</td>
                    
                    <!-- (UPGRADED) Show the live counts -->
                    <td class="px-6 py-4 text-sm text-white font-medium">${totalOtps}</td>
                    <td class="px-6 py-4 text-sm text-gray-300">${usedOtps}</td>
                    
                    <td class="px-6 py-4 text-sm">
                        <div class="flex items-center gap-2">
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
        // This function now runs whenever FORMS, GROUPS, or OTPs change.
        // It will always re-calculate and re-draw the table with fresh data.
        let filteredForms = [...allForms]; 
        const searchTerm = searchInput.value.toLowerCase();
        const selectedGroupId = groupFilterSelect.value;
        const isSortAz = sortAzButton.dataset.sorted === 'true';

        if (searchTerm) {
            filteredForms = filteredForms.filter(form => 
                (form.formName && form.formName.toLowerCase().includes(searchTerm)) ||
                (form.orgName && form.orgName.toLowerCase().includes(searchTerm))
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

    if (createGroupButton) {
        createGroupButton.addEventListener('click', () => {
            createGroupModal.classList.remove('hidden');
            groupErrorMessage.textContent = '';
            groupNameInput.value = '';
            groupNameInput.focus();
        });
    }
    if (closeModalButton) {
        closeModalButton.addEventListener('click', () => createGroupModal.classList.add('hidden'));
    }
    if (cancelGroupButton) {
        cancelGroupButton.addEventListener('click', () => createGroupModal.classList.add('hidden'));
    }
    if (saveGroupButton) {
        saveGroupButton.addEventListener('click', async () => { 
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
        });
    }

    // =================================================================
    // START: MODAL 2: "MANAGE GROUPS"
    // =================================================================

    if (manageGroupsButton) {
        manageGroupsButton.addEventListener('click', () => {
            renderManageGroupsList(); 
            manageGroupsModal.classList.remove('hidden');
        });
    }
    if (closeManageModalButton) {
        closeManageModalButton.addEventListener('click', () => {
            manageGroupsModal.classList.add('hidden');
        });
    }

    function renderManageGroupsList() {
        if (!groupListContainer) return;
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

    if (groupListContainer) {
        groupListContainer.addEventListener('click', async (e) => {
            const deleteButton = e.target.closest('.delete-group-button');
            if (deleteButton) {
                const groupId = deleteButton.dataset.id;
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
        });
    }

    // =================================================================
    // START: MODAL 3: "ASSIGN GROUP"
    // =================================================================
    
    if (closeAssignModalButton) {
        closeAssignModalButton.addEventListener('click', () => assignGroupModal.classList.add('hidden'));
    }
    if (cancelAssignModalButton) {
        cancelAssignModalButton.addEventListener('click', () => assignGroupModal.classList.add('hidden'));
    }
    if (saveAssignButton) {
        saveAssignButton.addEventListener('click', async () => {
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
                assignGroupModal.classList.add('hidden');
            } catch (error) {
                console.error("Error assigning group: ", error);
                assignGroupErrorMessage.textContent = 'An error occurred.';
            } finally {
                saveAssignButton.disabled = false;
                saveAssignButton.querySelector('.truncate').textContent = 'Save Assignment';
                currentAssignFormId = null;
            }
        });
    }

    // =================================================================
    // START: M13 - "ADD OTPs" LOGIC
    // =================================================================

    function generateRandomCode() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    if (closeOtpModalButton) {
        closeOtpModalButton.addEventListener('click', () => addOtpModal.classList.add('hidden'));
    }
    if (cancelOtpModalButton) {
        cancelOtpModalButton.addEventListener('click', () => addOtpModal.classList.add('hidden'));
    }
    if (generateOtpButton) {
        generateOtpButton.addEventListener('click', async () => {
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
                otpErrorMessage.textContent = 'Error: No form selected.';
                return;
            }
            
            otpErrorMessage.textContent = '';
            generateOtpButton.disabled = true;
            generateOtpButton.querySelector('.truncate').textContent = 'Generating...';
            
            try {
                const batch = db.batch();
                for (let i = 0; i < quantity; i++) {
                    const newCode = generateRandomCode();
                    const newOtpRef = db.collection('otps').doc(); 
                    const otpDoc = {
                        formId: currentOtpFormId,
                        code: newCode,
                        isUsed: false,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    batch.set(newOtpRef, otpDoc);
                }
                await batch.commit();
                alert(`Success! ${quantity} new OTPs have been generated.`);
                addOtpModal.classList.add('hidden');
                
            } catch (error) {
                console.error("Error generating OTPs: ", error);
                otpErrorMessage.textContent = 'An error occurred. Please try again.';
            } finally {
                generateOtpButton.disabled = false;
                generateOtpButton.querySelector('.truncate').textContent = 'Generate';
                otpQuantityInput.value = '';
                currentOtpFormId = null;
            }
        });
    }

    // =================================================================
    // START: TABLE ACTION BUTTONS (The main "click" listener)
    // =================================================================
    
    if (formTableBody) {
        formTableBody.addEventListener('click', (e) => {
            
            const editButton = e.target.closest('.edit-form-button');
            if (editButton) {
                const formId = editButton.dataset.id;
                window.location.href = `form-creation.html?formId=${formId}`;
                return;
            }

            const assignButton = e.target.closest('.assign-group-button');
            if (assignButton) {
                currentAssignFormId = assignButton.dataset.id; 
                const formName = assignButton.dataset.name;
                const currentGroupId = assignButton.dataset.groupId;
                assignFormName.textContent = formName;
                assignGroupSelect.value = currentGroupId;
                assignGroupErrorMessage.textContent = '';
                assignGroupModal.classList.remove('hidden');
                return;
            }

            const deleteButton = e.target.closest('.delete-form-button');
            if (deleteButton) {
                const formId = deleteButton.dataset.id;
                const formName = deleteButton.dataset.formName;
                if (confirm(`Are you sure you want to delete "${formName}"? This cannot be undone.`)) {
                    try {
                        db.collection('forms').doc(formId).delete();
                    } catch (error) {
                        console.error("Error deleting form: ", error);
                        alert('Error deleting form.');
                    }
                }
                return;
            }

            const otpButton = e.target.closest('.add-otp-button');
            if (otpButton) {
                const formId = otpButton.dataset.id;
                const form = allForms.find(f => f.id === formId);
                const formName = form ? form.formName : 'this form';
                currentOtpFormId = formId; 
                otpFormName.textContent = formName;
                otpQuantityInput.value = '';
                otpErrorMessage.textContent = '';
                addOtpModal.classList.remove('hidden');
                otpQuantityInput.focus();
                return;
            }
        });
    }

    // =================================================================
    // --- This is what starts everything ---
    // =================================================================
    loadAllGroups(); // Load groups
    loadAllForms();  // Load forms
    loadAllOtps();   // (NEW) Load OTPs

});