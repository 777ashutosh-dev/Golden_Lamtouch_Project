/*
  M33 v1 - (MULTI-COLUMN SORTING ENGINE) Form Management Brain
  -----------------------------------------------------
  Updates:
  1. SORTING: Upgraded from simple A-Z to full multi-column sorting.
     - Supports: Name, Organisation, Payment, Total OTPs, Used OTPs.
  2. UI: Headers are now clickable triggers.
  3. STYLE: "Assign Group" icon is now Blue for better visibility.
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();
    
    // --- FIX: TELL FIREBASE TO USE INDIA ---
    const functions = firebase.app().functions('asia-south1');
    const onFormDelete = functions.httpsCallable('onFormDelete');
    const generateBatchOTPs = functions.httpsCallable('generateBatchOTPs');

    // --- Page "Memory" ---
    let allForms = [];
    let allGroups = [];
    let allOtps = [];
    
    // Sorting State (Default: Name A-Z)
    let currentSort = { column: 'formName', direction: 'asc' }; 
    
    // --- Global "Targets" in the HTML ---
    const formTableBody = document.getElementById('form-table-body');
    const searchInput = document.getElementById('form-search-input');
    const viewGroupSelect = document.getElementById('view-group-select'); 
    
    // --- Header Targets for Sorting ---
    const sortHeaders = {
        'sort-name': 'formName',
        'sort-org': 'org',
        'sort-payment': 'payment',
        'sort-total': 'total',
        'sort-used': 'used'
    };

    // --- Private "Memory" for Modals ---
    let currentAssignFormId = null;
    let currentOtpFormId = null;

    // =================================================================
    // START: DATA LOADING (The "Heartbeat")
    // =================================================================

    // --- 1. Load All Forms (Live) ---
    function loadAllForms() {
        db.collection('forms').onSnapshot(querySnapshot => {
            allForms = [];
            querySnapshot.forEach(doc => {
                allForms.push({ id: doc.id, ...doc.data() });
            });
            renderFilteredForms(); 
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
            renderFilteredForms(); 
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
            renderFilteredForms(); 
        }, (error) => {
            console.error("Error loading OTPs: ", error);
        });
    }
    
    // =================================================================
    // START: FILTERING & SORTING (The "Brain")
    // =================================================================

    // --- Event Listeners for Toolbar ---
    if (searchInput) searchInput.addEventListener('input', renderFilteredForms);
    if (viewGroupSelect) viewGroupSelect.addEventListener('change', renderFilteredForms);

    // --- Event Listeners for Sorting Headers ---
    Object.keys(sortHeaders).forEach(headerId => {
        const headerEl = document.getElementById(headerId);
        if (headerEl) {
            headerEl.addEventListener('click', () => {
                const columnKey = sortHeaders[headerId];
                
                // Toggle direction if clicking the same column, otherwise reset to asc
                if (currentSort.column === columnKey) {
                    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort.column = columnKey;
                    currentSort.direction = 'asc';
                }
                
                renderFilteredForms();
                updateSortIcons();
            });
        }
    });

    function updateSortIcons() {
        // Reset all icons to neutral
        Object.keys(sortHeaders).forEach(headerId => {
            const el = document.getElementById(headerId);
            if(el) {
                const icon = el.querySelector('.material-symbols-outlined');
                if(icon) {
                    icon.textContent = 'unfold_more';
                    icon.classList.remove('text-primary');
                }
                el.classList.remove('text-white');
                el.classList.add('text-gray-400');
            }
        });

        // Set active icon
        const activeHeaderId = Object.keys(sortHeaders).find(key => sortHeaders[key] === currentSort.column);
        if (activeHeaderId) {
            const activeEl = document.getElementById(activeHeaderId);
            if(activeEl) {
                const icon = activeEl.querySelector('.material-symbols-outlined');
                if(icon) {
                    icon.textContent = currentSort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
                    icon.classList.add('text-primary');
                }
                activeEl.classList.remove('text-gray-400');
                activeEl.classList.add('text-white');
            }
        }
    }

    /**
     * Master Filter & Sort Function
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

        // --- 2. Add Analytics Data (Required for Sorting) ---
        processedForms = processedForms.map(form => {
            const otpsForThisForm = allOtps.filter(otp => otp.formId === form.id);
            return {
                ...form,
                totalOtps: otpsForThisForm.length,
                usedOtps: otpsForThisForm.filter(otp => otp.isUsed === true).length,
                // Normalize Payment Status for sorting
                paymentLabel: form.isPrepaid ? 'Prepaid' : 'Postpaid'
            };
        });
        
        // --- 3. Sort ---
        processedForms.sort((a, b) => {
            let valA, valB;

            switch (currentSort.column) {
                case 'formName':
                    valA = (a.formName || '').toLowerCase();
                    valB = (b.formName || '').toLowerCase();
                    break;
                case 'org':
                    valA = (a.orgName || '').toLowerCase();
                    valB = (b.orgName || '').toLowerCase();
                    break;
                case 'payment':
                    valA = a.paymentLabel;
                    valB = b.paymentLabel;
                    break;
                case 'total':
                    valA = a.totalOtps;
                    valB = b.totalOtps;
                    break;
                case 'used':
                    valA = a.usedOtps;
                    valB = b.usedOtps;
                    break;
                default:
                    return 0;
            }

            if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        // --- 4. Render ---
        renderTable(processedForms);
    }
    
    // =================================================================
    // START: TABLE & MODAL RENDERING (The "UI")
    // =================================================================

    function renderTable(formsToRender) {
        if (!formTableBody) return;
        formTableBody.innerHTML = ''; 

        if (formsToRender.length === 0) {
            formTableBody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-500">No forms match your criteria.</td></tr>';
            return;
        }

        formsToRender.forEach(form => {
            const formId = form.id;
            
            // Group Badge
            const group = allGroups.find(g => g.id === form.groupId);
            const groupBadge = group 
              ? `<span class="ml-2 px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded-full">${group.groupName}</span>` 
              : '';
            
            // Payment Styling
            const isPrepaid = form.isPrepaid === true;
            const paymentStatusText = isPrepaid ? 'Prepaid' : 'Postpaid';
            const paymentStatusClass = isPrepaid ? 'text-primary font-medium' : 'text-gray-400';

            const rowHTML = `
                <tr class="border-b border-border-dark hover:bg-white/5">
                    <!-- Col 1: Form Name -->
                    <td class="px-6 py-4 text-sm font-semibold text-white">
                        <span>${form.formName || 'Untitled Form'}</span>
                        ${groupBadge}
                    </td>

                    <!-- Col 2: Organisation -->
                    <td class="px-6 py-4 text-sm text-gray-300">
                        ${form.orgName || 'N/A'}
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

                            <!-- Assign Group Button (UPDATED: BLUE) -->
                            <button data-id="${formId}" data-name="${form.formName || 'Untitled Form'}" data-group-id="${form.groupId || 'none'}" class="assign-group-button p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg" title="Assign Group">
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
     * Populates the "Group" dropdowns
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
            const currentVal = viewGroupSelect.value;
            viewGroupSelect.innerHTML = '<option value="all">All Groups</option>';
            allGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.groupName;
                viewGroupSelect.appendChild(option);
            });
            if (currentVal !== 'all' && allGroups.find(g => g.id === currentVal)) {
                viewGroupSelect.value = currentVal;
            }
        }
    }

    /**
     * Renders the list in the "Manage Groups" modal
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
    
    if (formTableBody) {
        formTableBody.addEventListener('click', (e) => {
            
            // OTP CSV Download
            const downloadOtpButton = e.target.closest('.download-otp-button');
            if (downloadOtpButton) {
                const formId = downloadOtpButton.dataset.id;
                const formName = downloadOtpButton.dataset.name;
                handleOtpCsvDownload(formId, formName, downloadOtpButton);
                return;
            }

            // Edit Form
            const editButton = e.target.closest('.edit-form-button');
            if (editButton) {
                const formId = editButton.dataset.id;
                window.location.href = `form-creation.html?formId=${formId}`;
                return;
            }

            // Assign Group
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

            // Delete Form
            const deleteButton = e.target.closest('.delete-form-button');
            if (deleteButton) {
                const formId = deleteButton.dataset.id;
                const formName = deleteButton.dataset.formName;
                
                if (confirm(`Are you sure you want to delete "${formName}"? This will delete all related submissions, OTPs, and files. This cannot be undone.`)) {
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

            // Add OTPs
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

    // Modal Listeners (unchanged logic)
    document.body.addEventListener('click', async (e) => {
        // Create Group
        if (e.target.closest('#create-group-button')) document.getElementById('create-group-modal').classList.remove('hidden');
        if (e.target.closest('#close-create-modal-button') || e.target.closest('#cancel-create-modal-button')) document.getElementById('create-group-modal').classList.add('hidden');
        
        // Manage Groups
        if (e.target.closest('#manage-groups-button')) document.getElementById('manage-groups-modal').classList.remove('hidden');
        if (e.target.closest('#close-manage-modal-button')) document.getElementById('manage-groups-modal').classList.add('hidden');
        
        // Assign Group
        if (e.target.closest('#close-assign-modal-button') || e.target.closest('#cancel-assign-modal-button')) document.getElementById('assign-group-modal').classList.add('hidden');
        
        // Add OTP
        if (e.target.closest('#close-otp-modal-button') || e.target.closest('#cancel-otp-modal-button')) document.getElementById('add-otp-modal').classList.add('hidden');

        // Save Group Logic
        if (e.target.closest('#save-group-button')) {
            const saveBtn = e.target.closest('#save-group-button');
            const originalText = '<span class="truncate">Save Group</span>';
            const groupNameInput = document.getElementById('group-name-input');
            const groupErrorMessage = document.getElementById('create-group-error-message');
            const groupName = groupNameInput.value.trim();
            
            if (groupName === '') {
                groupErrorMessage.textContent = 'Group Name cannot be empty.';
                return; 
            }
            const isDuplicate = allGroups.some(g => g.groupName.toLowerCase() === groupName.toLowerCase());
            if (isDuplicate) {
                groupErrorMessage.textContent = 'Error: A group with this name already exists.';
                return;
            }
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="truncate">Saving...</span>';
            groupErrorMessage.textContent = '';

            try {
                await db.collection('groups').add({ groupName: groupName });
                saveBtn.classList.remove('bg-primary', 'text-background-dark');
                saveBtn.classList.add('bg-green-500', 'text-white');
                saveBtn.innerHTML = '<span class="truncate">Saved!</span>';
                
                setTimeout(() => {
                    document.getElementById('create-group-modal').classList.add('hidden');
                    groupNameInput.value = '';
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = originalText;
                    saveBtn.classList.add('bg-primary', 'text-background-dark');
                    saveBtn.classList.remove('bg-green-500', 'text-white');
                }, 1000);
            } catch (error) {
                console.error("Error saving group: ", error);
                groupErrorMessage.textContent = 'An error occurred. Please try again.';
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalText;
            }
        }

        // Delete Group
        const deleteGroupButton = e.target.closest('.delete-group-button');
        if (deleteGroupButton) {
            const groupId = deleteGroupButton.dataset.id;
            const rowToRemove = deleteGroupButton.closest('div');
            
            if (confirm('Are you sure? This will not delete forms.')) {
                deleteGroupButton.disabled = true;
                deleteGroupButton.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span>'; 

                db.collection('groups').doc(groupId).delete()
                    .then(() => {
                        if (rowToRemove) rowToRemove.remove();
                        const container = document.getElementById('group-list-container');
                        if (container && container.children.length === 0) {
                             const msg = document.getElementById('no-groups-message');
                             if(msg) msg.classList.remove('hidden');
                        }
                    })
                    .catch(error => {
                        console.error('Error deleting group:', error);
                        alert('Error deleting group.');
                        deleteGroupButton.disabled = false;
                        deleteGroupButton.innerHTML = '<span class="material-symbols-outlined">delete</span>';
                    });
            }
        }

        // Save Assignment
        if (e.target.closest('#save-assign-button')) {
            const assignGroupSelect = document.getElementById('assign-group-select');
            const newGroupValue = assignGroupSelect.value === 'none' ? null : assignGroupSelect.value;
            
            if (!currentAssignFormId) return;
            
            db.collection('forms').doc(currentAssignFormId).update({ groupId: newGroupValue })
                .then(() => {
                    document.getElementById('assign-group-modal').classList.add('hidden');
                    currentAssignFormId = null;
                })
                .catch(err => document.getElementById('assign-group-error-message').textContent = 'An error occurred.');
        }

        // Generate OTPs
        if (e.target.closest('#generate-otp-button')) {
            const quantityInput = document.getElementById('otp-quantity-input');
            const errorMsg = document.getElementById('otp-error-message');
            const quantity = parseInt(quantityInput.value, 10);
            
            if (isNaN(quantity) || quantity <= 0 || quantity > 1000) {
                errorMsg.textContent = 'Please enter a valid number (1-1000).';
                return;
            }
            if (!currentOtpFormId) return;
            
            const btn = e.target.closest('#generate-otp-button');
            btn.disabled = true;
            btn.querySelector('.truncate').textContent = 'Generating...';
            
            try {
                const result = await generateBatchOTPs({
                    formId: currentOtpFormId,
                    quantity: quantity
                });

                if (result.data.success) {
                    alert(`Success! ${result.data.count} new OTPs have been generated.`);
                    document.getElementById('add-otp-modal').classList.add('hidden');
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

    // --- OTP CSV Download Logic ---
    async function handleOtpCsvDownload(formId, formName, buttonElement) {
        buttonElement.classList.add('cursor-not-allowed', 'opacity-50');
        const icon = buttonElement.querySelector('.material-symbols-outlined');
        const originalIcon = icon.textContent;
        icon.textContent = 'hourglass_top';
        
        try {
            const submissionsSnapshot = await db.collection('submissions').where('formId', '==', formId).get();
            const submissionsForThisForm = submissionsSnapshot.docs.map(doc => doc.data());

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

    function escapeCsvCell(cell) {
        if (cell === null || cell === undefined) return '""';
        let cellString = String(cell);
        if (cellString.includes('"') || cellString.includes(',')) {
            cellString = '"' + cellString.replace(/"/g, '""') + '"';
        }
        return cellString;
    }
    
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
    
    // --- Initialize ---
    loadAllGroups();
    loadAllForms();
    loadAllOtps();

});