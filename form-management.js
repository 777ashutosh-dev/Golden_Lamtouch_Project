/*
This is the *NEW, COMPLETE* JavaScript file for form-management.html.
This single file contains all logic for:
- M10 (Loading Forms)
- M11 (Making "Edit" button work)
- M12 (Making "Grouping" buttons, modals, and dropdown work)
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();

    // --- Find all our "targets" in the HTML ---
    const formTableBody = document.getElementById('form-table-body');
    const searchInput = document.getElementById('form-search-input');
    
    // --- Grouping Modal Targets ---
    const createGroupModal = document.getElementById('create-group-modal');
    const createGroupButton = document.getElementById('create-group-button');
    const closeModalButton = document.getElementById('close-create-modal-button'); // Fixed ID
    const cancelGroupButton = document.getElementById('cancel-create-modal-button'); // Fixed ID
    const saveGroupButton = document.getElementById('save-group-button');
    const groupNameInput = document.getElementById('group-name-input');
    const groupErrorMessage = document.getElementById('create-group-error-message'); // Fixed ID
    
    // --- Filter/Sort Targets ---
    const groupFilterSelect = document.getElementById('group-filter-select');
    const sortAzButton = document.getElementById('sort-az-button');
    
    // (We will add manage-groups-modal targets later)

    // --- Global variables to store our data ---
    let allForms = []; // Master list of forms
    let allGroups = []; // Master list of groups


    // =================================================================
    // START: GROUPING LOGIC (M12)
    // =================================================================

    // --- Logic to OPEN the "Create Group" modal ---
    if (createGroupButton) {
        createGroupButton.addEventListener('click', () => {
            if (createGroupModal) {
                createGroupModal.classList.remove('hidden');
                groupErrorMessage.textContent = '';
                groupNameInput.value = '';
                groupNameInput.focus(); // Put cursor in the box
            }
        });
    }

    // --- Logic to CLOSE the "Create Group" modal (Method 1: "X" button) ---
    if (closeModalButton) {
        closeModalButton.addEventListener('click', () => {
            if (createGroupModal) {
                createGroupModal.classList.add('hidden');
            }
        });
    }

    // --- Logic to CLOSE the "Create Group" modal (Method 2: "Cancel" button) ---
    if (cancelGroupButton) {
        cancelGroupButton.addEventListener('click', () => {
            if (createGroupModal) {
                createGroupModal.classList.add('hidden');
            }
        });
    }

    // --- Logic to SAVE the new group ---
    if (saveGroupButton) {
        saveGroupButton.addEventListener('click', async () => { 
            
            const groupName = groupNameInput.value.trim();

            // 1. Validation
            if (groupName === '') {
                groupErrorMessage.textContent = 'Group Name cannot be empty.';
                return; 
            }

            // 2. "Loading" state
            saveGroupButton.disabled = true;
            saveGroupButton.querySelector('.truncate').textContent = 'Saving...';
            groupErrorMessage.textContent = ''; 

            try {
                // 3. Create the new group object
                const newGroup = {
                    groupName: groupName,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                // 4. Save it to our NEW "groups" collection
                await db.collection('groups').add(newGroup);

                // 5. Success!
                alert(`Success! Group "${groupName}" has been created.`);
                
                // We don't need to manually update the dropdown,
                // because our "loadGroupsDropdown" function is *live* (onSnapshot)
                // It will see the new group and update itself automatically!

            } catch (error) {
                console.error("Error saving group: ", error);
                groupErrorMessage.textContent = 'An error occurred. Please try again.';
            } finally {
                // 6. Reset the button and close the modal
                saveGroupButton.disabled = false;
                saveGroupButton.querySelector('.truncate').textContent = 'Save Group';
                groupNameInput.value = ''; 
                createGroupModal.classList.add('hidden');
            }
        });
    }

    // --- Logic to LOAD Groups into Dropdown ---
    function loadGroupsDropdown() {
        if (groupFilterSelect) {
            
            // Listen for *any* changes to the 'groups' collection
            db.collection('groups').orderBy('groupName').onSnapshot(snapshot => {
                
                // Clear all *old* options (but keep the first "All Groups" one)
                groupFilterSelect.innerHTML = '<option value="all">All Groups</option>';

                allGroups = []; // Reset our master list
                snapshot.forEach(doc => {
                    const group = doc.data();
                    allGroups.push({ id: doc.id, ...group }); // Save to master list

                    // Create a new <option> element
                    const option = document.createElement('option');
                    option.value = doc.id; // The value will be the unique ID
                    option.textContent = group.groupName; // The text the user sees
                    
                    // Add the new option to the dropdown
                    groupFilterSelect.appendChild(option);
                });

            }, (error) => {
                console.error("Error loading groups: ", error);
            });
        }
    }
    
    // =================================================================
    // END: GROUPING LOGIC
    // =================================================================


    // =================================================================
    // START: FORM LIST LOGIC (M10 + M11)
    // =================================================================

    // --- This is our "Master" function to draw the table ---
    function renderTable(formsToRender) {
        formTableBody.innerHTML = ''; 

        if (formsToRender.length === 0) {
            formTableBody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-500">No forms found.</td></tr>';
            return;
        }

        formsToRender.forEach(formData => {
            const data = formData; 
            const formId = formData.id;
            
            const paymentStatus = data.isPrepaid 
                ? '<span class="text-yellow-400 font-medium">Prepaid</span>' 
                : '<span class="text-gray-400">Postpaid</span>';

            // Find the group name.
            const group = allGroups.find(g => g.id === data.groupId);
            const groupName = group ? group.groupName : 'N/A';

            const row = `
                <tr class="border-b border-border-dark hover:bg-white/5">
                    <td class="px-6 py-4 text-sm font-semibold text-white">${data.formName || 'Untitled Form'}</td>
                    <td class="px-6 py-4 text-sm text-gray-300">${data.orgName || 'N/A'}</td>
                    <td class="px-6 py-4 text-sm">${paymentStatus}</td>
                    <td class="px-6 py-4 text-sm text-gray-300">0</td> <!-- Placeholder -->
                    <td class="px-6 py-4 text-sm text-gray-300">0</td> <!-- Placeholder -->
                    <td class="px-6 py-4 text-sm">
                        <div class="flex items-center gap-2">
                            <button data-id="${formId}" class="add-otp-button p-2 text-primary hover:bg-primary/20 rounded-lg" title="Add OTPs">
                                <span class="material-symbols-outlined">vpn_key</span>
                            </button>
                            <button data-id="${formId}" class="assign-group-button p-2 text-gray-400 hover:bg-white/10 rounded-lg" title="Assign Group">
                                <span class="material-symbols-outlined">label</span>
                            </button>
                            <button data-id="${formId}" class="edit-form-button p-2 text-gray-400 hover:bg-white/10 rounded-lg" title="Edit Form">
                                <span class="material-symbols-outlined">edit</span>
                            </button>
                            <button data-id="${formId}" class="delete-form-button p-2 text-red-500 hover:bg-red-500/10 rounded-lg" title="Delete Form">
                                <span class="material-symbols-outlined">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            formTableBody.innerHTML += row;
        });
    }

    // --- This function loads all the forms from the database ---
    function loadAllForms() {
        if (formTableBody) {
            db.collection('forms').orderBy('createdAt', 'desc').onSnapshot(querySnapshot => {
                
                allForms = []; 
                querySnapshot.forEach(doc => {
                    allForms.push({ id: doc.id, ...doc.data() });
                });

                // Now, render the table for the first time
                // (This will show all forms by default)
                applyFiltersAndSort(); // Use our new master function

            }, (error) => {
                console.error("Error fetching forms: ", error);
                formTableBody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-red-400">Error loading data. Check console.</td></tr>';
            });
        }
    }

    // =================================================================
    // START: FILTERING & SORTING LOGIC (M12)
    // =================================================================

    // --- This is our new "master" function that runs all filters ---
    function applyFiltersAndSort() {
        let filteredForms = [...allForms]; 
        
        // 1. Get the current filter values
        const searchTerm = searchInput.value.toLowerCase();
        const selectedGroupId = groupFilterSelect.value;
        const isSortAz = sortAzButton.dataset.sorted === 'true';

        // 2. Apply Search Filter
        if (searchTerm) {
            filteredForms = filteredForms.filter(form => 
                (form.formName && form.formName.toLowerCase().includes(searchTerm)) ||
                (form.orgName && form.orgName.toLowerCase().includes(searchTerm))
            );
        }

        // 3. Apply Group Filter
        if (selectedGroupId !== 'all') {
            filteredForms = filteredForms.filter(form => form.groupId === selectedGroupId);
        }

        // 4. Apply Sort
        if (isSortAz) {
            filteredForms.sort((a, b) => {
                const nameA = a.formName || '';
                const nameB = b.formName || '';
                return nameA.localeCompare(nameB);
            });
        } else {
            // Default sort is by 'createdAt' (which 'allForms' already is)
            // No need to re-sort
        }
        
        // 5. Finally, re-render the table with our new filtered/sorted list
        renderTable(filteredForms);
    }
    
    // --- Add all our "listeners" ---
    
    // Listen for typing in the search bar
    if (searchInput) {
        searchInput.addEventListener('input', applyFiltersAndSort);
    }
    
    // Listen for a change in the dropdown
    if (groupFilterSelect) {
        groupFilterSelect.addEventListener('change', applyFiltersAndSort);
    }

    // Listen for a click on the sort button
    if (sortAzButton) {
        sortAzButton.addEventListener('click', () => {
            const isCurrentlySorted = sortAzButton.dataset.sorted === 'true';
            
            if (isCurrentlySorted) {
                // If it is, unsort it
                sortAzButton.dataset.sorted = 'false';
                sortAzButton.classList.remove('bg-primary/20', 'text-primary'); // Make it not yellow
            } else {
                // If it's not, sort it A-Z
                sortAzButton.dataset.sorted = 'true';
                sortAzButton.classList.add('bg-primary/20', 'text-primary'); // Make it yellow
            }
            // After changing the state, re-run the filters
            applyFiltersAndSort();
        });
    }

    // =================================================================
    // START: "ACTION" BUTTON CLICK LISTENER (M11)
    // =================================================================
    
    // We listen for clicks on the *entire* table body.
    if (formTableBody) {
        formTableBody.addEventListener('click', (e) => {
            
            // Check for "Edit" button
            const editButton = e.target.closest('.edit-form-button');
            if (editButton) {
                const formId = editButton.dataset.id;
                window.location.href = `form-creation.html?formId=${formId}`;
                return; // Stop checking
            }

            // (We will add the other button logic here later)
            // e.g.,
            // const deleteButton = e.target.closest('.delete-form-button');
            // if (deleteButton) { ... }

        });
    }

    // =================================================================
    // --- This is what starts everything ---
    // =================================================================
    loadGroupsDropdown(); // Load the groups dropdown
    loadAllForms();       // Load all the forms

});