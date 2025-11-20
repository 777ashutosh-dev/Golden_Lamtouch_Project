/*
  M26 v2 - (COORDINATOR PROFILES & EDITING) Settings Brain
  -----------------------------------------------------
  Updates:
  1. CREATE: Now sends Name, Org, and Phone to the Cloud Function.
  2. READ: Displays full profile details in the Coordinator list.
  3. UPDATE: Added "Edit Mode" logic.
     - Pre-fills modal with existing data.
     - Calls a new 'updateCoordinatorAccount' function.
  4. UI: Added "Edit" button to table rows.
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();
    const auth = firebase.auth();
    
    // --- FIX: TELL FIREBASE TO USE INDIA ---
    const functions = firebase.app().functions('asia-south1');

    // --- UI TARGETS ---
    
    // Zone 1: Global Config
    const unlockSettingsBtn = document.getElementById('unlock-settings-btn');
    const serialPrefixInput = document.getElementById('serial-prefix-input');
    const savePrefixBtn = document.getElementById('save-prefix-btn');
    
    // Zone 2: Security
    const currentPasswordInput = document.getElementById('current-password');
    const newPasswordInput = document.getElementById('new-password');
    const updatePasswordBtn = document.getElementById('update-password-btn');

    // Zone 3: Coordinators
    const addCoordinatorBtn = document.getElementById('add-coordinator-btn');
    const coordinatorsListBody = document.getElementById('coordinators-list-body');

    // Modals
    const reauthModal = document.getElementById('reauth-modal');
    const reauthPasswordInput = document.getElementById('reauth-password');
    const confirmReauthBtn = document.getElementById('confirm-reauth');
    const cancelReauthBtn = document.getElementById('cancel-reauth');

    const coordinatorModal = document.getElementById('coordinator-modal');
    const coordinatorModalTitle = document.getElementById('coordinator-modal-title');
    
    // Coordinator Form Inputs
    const coordNameInput = document.getElementById('coord-name');
    const coordOrgInput = document.getElementById('coord-org');
    const coordPhoneInput = document.getElementById('coord-phone');
    const coordEmailInput = document.getElementById('coord-email');
    const coordPasswordInput = document.getElementById('coord-password');
    const coordPasswordLabel = document.getElementById('coord-password-label');
    const passwordHint = document.getElementById('password-hint');
    
    const formAccessList = document.getElementById('form-access-list');
    const saveCoordBtn = document.getElementById('save-coord');
    const cancelCoordBtn = document.getElementById('cancel-coord');

    // State
    let allForms = [];
    let currentEditCoordId = null; // Track if we are editing

    // =================================================================
    // ZONE 1: GLOBAL CONFIG
    // =================================================================

    async function loadGlobalSettings() {
        try {
            const doc = await db.collection('config').doc('global').get();
            if (doc.exists) {
                serialPrefixInput.value = doc.data().serialPrefix || '25';
            }
        } catch (error) {
            console.error("Error loading settings:", error);
        }
    }

    if (unlockSettingsBtn) {
        unlockSettingsBtn.addEventListener('click', () => {
            reauthModal.classList.remove('hidden');
            reauthPasswordInput.value = '';
            reauthPasswordInput.focus();
        });
    }

    if (confirmReauthBtn) {
        confirmReauthBtn.addEventListener('click', async () => {
            const password = reauthPasswordInput.value;
            if (!password) return;

            confirmReauthBtn.disabled = true;
            confirmReauthBtn.textContent = 'Verifying...';

            const user = auth.currentUser;
            const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);

            try {
                await user.reauthenticateWithCredential(credential);
                reauthModal.classList.add('hidden');
                serialPrefixInput.disabled = false;
                serialPrefixInput.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-black/30');
                serialPrefixInput.classList.add('bg-background-dark', 'focus:border-primary');
                unlockSettingsBtn.classList.add('hidden');
                savePrefixBtn.classList.remove('hidden');
            } catch (error) {
                console.error("Re-auth failed:", error);
                alert("Incorrect password.");
            } finally {
                confirmReauthBtn.disabled = false;
                confirmReauthBtn.textContent = 'Unlock';
            }
        });
    }
    
    if (savePrefixBtn) {
        savePrefixBtn.addEventListener('click', async () => {
            const newPrefix = serialPrefixInput.value.trim();
            if (!newPrefix) return alert("Prefix cannot be empty.");
            
            savePrefixBtn.disabled = true;
            savePrefixBtn.textContent = 'Saving...';

            try {
                await db.collection('config').doc('global').set({
                    serialPrefix: newPrefix
                }, { merge: true });
                alert("Global Serial Prefix updated successfully.");
                
                serialPrefixInput.disabled = true;
                serialPrefixInput.classList.add('opacity-50', 'cursor-not-allowed', 'bg-black/30');
                serialPrefixInput.classList.remove('bg-background-dark', 'focus:border-primary');
                savePrefixBtn.classList.add('hidden');
                unlockSettingsBtn.classList.remove('hidden');
            } catch (error) {
                console.error("Error saving prefix:", error);
                alert("Error saving settings.");
            } finally {
                savePrefixBtn.disabled = false;
                savePrefixBtn.textContent = 'Save New Prefix';
            }
        });
    }

    if (cancelReauthBtn) {
        cancelReauthBtn.addEventListener('click', () => reauthModal.classList.add('hidden'));
    }

    // =================================================================
    // ZONE 2: ADMIN SECURITY
    // =================================================================

    if (updatePasswordBtn) {
        updatePasswordBtn.addEventListener('click', async () => {
            const currentPass = currentPasswordInput.value;
            const newPass = newPasswordInput.value;

            if (!currentPass || !newPass) return alert("Please fill in both fields.");
            if (newPass.length < 6) return alert("New password must be at least 6 characters.");

            updatePasswordBtn.disabled = true;
            updatePasswordBtn.textContent = 'Updating...';

            const user = auth.currentUser;
            const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPass);

            try {
                await user.reauthenticateWithCredential(credential);
                await user.updatePassword(newPass);
                alert("Password updated successfully!");
                currentPasswordInput.value = '';
                newPasswordInput.value = '';
            } catch (error) {
                console.error("Password update failed:", error);
                alert("Error: " + error.message);
            } finally {
                updatePasswordBtn.disabled = false;
                updatePasswordBtn.textContent = 'Update Password';
            }
        });
    }

    // =================================================================
    // ZONE 3: COORDINATOR MANAGEMENT (UPDATED)
    // =================================================================

    async function loadForms() {
        try {
            const snapshot = await db.collection('forms').get();
            allForms = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().formName }));
            renderFormChecklist([]); // Render empty checklist initially
        } catch (error) {
            console.error("Error loading forms:", error);
        }
    }

    function renderFormChecklist(selectedIds) {
        if (formAccessList) {
            formAccessList.innerHTML = '';
            allForms.forEach(form => {
                const isChecked = selectedIds.includes(form.id) ? 'checked' : '';
                const label = document.createElement('label');
                label.className = 'flex items-center gap-3 cursor-pointer hover:bg-white/5 p-2 rounded';
                label.innerHTML = `
                    <input type="checkbox" value="${form.id}" class="form-checkbox h-4 w-4 text-primary border-gray-500 rounded focus:ring-primary bg-transparent" ${isChecked}>
                    <span class="text-sm text-gray-300">${form.name}</span>
                `;
                formAccessList.appendChild(label);
            });
        }
    }

    function loadCoordinators() {
        db.collection('coordinators').onSnapshot(snapshot => {
            if (coordinatorsListBody) {
                coordinatorsListBody.innerHTML = '';
                if (snapshot.empty) {
                    coordinatorsListBody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-500">No coordinators created yet.</td></tr>';
                    return;
                }

                snapshot.forEach(doc => {
                    const data = doc.data();
                    const accessCount = data.accessList ? data.accessList.length : 0;
                    
                    const row = document.createElement('tr');
                    row.className = 'border-b border-border-dark hover:bg-white/5';
                    
                    // Store full data in row for easy "Edit" access
                    row.dataset.json = JSON.stringify({ id: doc.id, ...data });

                    row.innerHTML = `
                        <td class="px-4 py-3 text-sm font-medium text-white">${data.name || 'N/A'}</td>
                        <td class="px-4 py-3 text-sm text-gray-300">${data.org || 'N/A'}</td>
                        <td class="px-4 py-3 text-sm text-gray-300">${data.phone || 'N/A'}</td>
                        <td class="px-4 py-3 text-sm text-gray-300">${data.email}</td>
                        <td class="px-4 py-3 text-sm text-primary">${accessCount} Form(s)</td>
                        <td class="px-4 py-3 text-right flex justify-end gap-2">
                            <button class="edit-coord-btn text-gray-400 hover:text-white p-1 rounded" title="Edit">
                                <span class="material-symbols-outlined text-lg">edit</span>
                            </button>
                            <button class="delete-coord-btn text-red-500 hover:bg-red-500/10 p-1 rounded" title="Delete">
                                <span class="material-symbols-outlined text-lg">delete</span>
                            </button>
                        </td>
                    `;
                    coordinatorsListBody.appendChild(row);
                });
            }
        }, (error) => {
             console.error("Error loading coordinators:", error);
             if (coordinatorsListBody) coordinatorsListBody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-red-400">Error loading data.</td></tr>`;
        });
    }

    // --- OPEN MODAL Logic (Create vs Edit) ---

    // 1. Create New
    if (addCoordinatorBtn) {
        addCoordinatorBtn.addEventListener('click', () => {
            currentEditCoordId = null; // Reset ID -> "Create Mode"
            
            // Reset UI
            coordinatorModalTitle.textContent = "Add New Coordinator";
            saveCoordBtn.textContent = "Create Account";
            coordEmailInput.disabled = false; // Can edit email for new users
            coordEmailInput.classList.remove('opacity-50');
            
            coordPasswordLabel.textContent = "Set Password";
            passwordHint.classList.add('hidden');

            // Clear Inputs
            coordNameInput.value = '';
            coordOrgInput.value = '';
            coordPhoneInput.value = '';
            coordEmailInput.value = '';
            coordPasswordInput.value = '';
            
            renderFormChecklist([]); // Clear checks
            
            coordinatorModal.classList.remove('hidden');
        });
    }

    // 2. Edit Existing
    if (coordinatorsListBody) {
        coordinatorsListBody.addEventListener('click', (e) => {
            // --- DELETE ---
            const delBtn = e.target.closest('.delete-coord-btn');
            if (delBtn) {
                const row = delBtn.closest('tr');
                const data = JSON.parse(row.dataset.json);
                if (confirm(`Delete ${data.name || 'this coordinator'}?`)) {
                    db.collection('coordinators').doc(data.id).delete();
                    const deleteAuth = functions.httpsCallable('deleteCoordinatorAuth');
                    deleteAuth({ uid: data.uid }).catch(console.warn);
                }
                return;
            }

            // --- EDIT ---
            const editBtn = e.target.closest('.edit-coord-btn');
            if (editBtn) {
                const row = editBtn.closest('tr');
                const data = JSON.parse(row.dataset.json);
                
                currentEditCoordId = data.id; // Set ID -> "Edit Mode"

                // Set UI
                coordinatorModalTitle.textContent = "Edit Coordinator";
                saveCoordBtn.textContent = "Update Account";
                
                // Lock Email (Changing email breaks UID link usually, keeping simple)
                coordEmailInput.disabled = true;
                coordEmailInput.classList.add('opacity-50');
                
                coordPasswordLabel.textContent = "Change Password";
                passwordHint.classList.remove('hidden');

                // Fill Inputs
                coordNameInput.value = data.name || '';
                coordOrgInput.value = data.org || '';
                coordPhoneInput.value = data.phone || '';
                coordEmailInput.value = data.email || '';
                coordPasswordInput.value = ''; // Reset password field
                
                // Set Checks
                renderFormChecklist(data.accessList || []);
                
                coordinatorModal.classList.remove('hidden');
            }
        });
    }

    // Close Modal
    const closeCoord = () => coordinatorModal.classList.add('hidden');
    if (cancelCoordBtn) cancelCoordBtn.addEventListener('click', closeCoord);


    // --- SAVE LOGIC (Router) ---
    if (saveCoordBtn) {
        saveCoordBtn.addEventListener('click', async () => {
            
            // Collect Data
            const profileData = {
                name: coordNameInput.value.trim(),
                org: coordOrgInput.value.trim(),
                phone: coordPhoneInput.value.trim(),
                email: coordEmailInput.value.trim(),
                password: coordPasswordInput.value.trim()
            };

            // Get Access List
            const accessList = [];
            document.querySelectorAll('#form-access-list input:checked').forEach(cb => {
                accessList.push(cb.value);
            });

            // Basic Validation
            if (!profileData.name || !profileData.email) return alert("Name and Email are required.");
            
            saveCoordBtn.disabled = true;
            saveCoordBtn.textContent = 'Processing...';

            try {
                if (currentEditCoordId) {
                    // --- UPDATE MODE ---
                    // Call Update Cloud Function
                    const updateCoord = functions.httpsCallable('updateCoordinatorAccount');
                    await updateCoord({
                        docId: currentEditCoordId, // Firestore Doc ID
                        ...profileData,
                        accessList: accessList
                    });
                    alert("Coordinator updated successfully!");

                } else {
                    // --- CREATE MODE ---
                    if (!profileData.password || profileData.password.length < 6) {
                        throw new Error("Password is required (min 6 chars).");
                    }
                    // Call Create Cloud Function
                    const createCoord = functions.httpsCallable('createCoordinatorAccount');
                    await createCoord({
                        ...profileData,
                        accessList: accessList
                    });
                    alert("Coordinator created successfully!");
                }

                closeCoord();

            } catch (error) {
                console.error("Error:", error);
                alert("Error: " + error.message);
            } finally {
                saveCoordBtn.disabled = false;
                saveCoordBtn.textContent = currentEditCoordId ? 'Update Account' : 'Create Account';
            }
        });
    }

    // --- INIT ---
    loadGlobalSettings();
    loadForms();
    loadCoordinators();

});