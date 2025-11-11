/*
This is the JavaScript file for your form-management.html page.
It now does TWO things:
1.  Fetches and displays all the forms in the table (from M10).
2.  Listens for clicks on the "Edit" button for each form (NEW - M11).
*/

// We are telling the browser: "Don't run any of this code until the *entire* HTML page is loaded."
document.addEventListener('DOMContentLoaded', () => {

    // We get these from the script block in our HTML file
    const db = firebase.firestore();

    // 1. Find our "targets" in the HTML
    const formTableBody = document.getElementById('form-table-body');
    const searchInput = document.getElementById('form-search-input');
    // (We will add the other buttons later)

    // =================================================================
    // START: MILESTONE 10 CODE (Already Working)
    // This code block populates our main table
    // =================================================================

    // We'll store all our forms here so we can search them
    let allForms = [];

    if (formTableBody) {
        // We are telling Firestore:
        // "Listen for *any* changes in the 'forms' collection"
        // "Order them by the 'createdAt' date, newest first."
        db.collection('forms').orderBy('createdAt', 'desc').onSnapshot(querySnapshot => {
            
            // We got the data! First, clear the "Loading..." message.
            formTableBody.innerHTML = ''; 

            // Check if there are any forms at all
            if (querySnapshot.empty) {
                formTableBody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-500">No forms created yet. Go to the "Form Creation" page to build one!</td></tr>';
                return; // Stop here
            }

            // Save the forms for searching
            allForms = []; 

            // Now, loop through every single document (form) that Firebase gave us.
            querySnapshot.forEach(doc => {
                
                const data = doc.data(); // This is the data we saved (formName, orgName, etc.)
                const formId = doc.id;   // This is the unique "random" ID (like gPwPigD13...)

                // Save this form to our local array
                allForms.push({ id: formId, ...data });
                
                // --- Helper Function: Format Payment Status ---
                const paymentStatus = data.isPrepaid 
                    ? '<span class="text-yellow-400 font-medium">Prepaid</span>' 
                    : '<span class="text-gray-400">Postpaid</span>';

                // 5. Build the new HTML table row
                // We add "data-id" attributes to the buttons so we know *which* form to act on!
                const row = `
                    <tr class="border-b border-border-dark hover:bg-white/5">
                        <td class="px-6 py-4 text-sm font-semibold text-white">${data.formName || 'Untitled Form'}</td>
                        <td class="px-6 py-4 text-sm text-gray-300">${data.orgName || 'N/A'}</td>
                        <td class="px-6 py-4 text-sm">${paymentStatus}</td>
                        <td class="px-6 py-4 text-sm text-gray-300">0</td> <!-- Placeholder for Total OTPs -->
                        <td class="px-6 py-4 text-sm text-gray-300">0</td> <!-- Placeholder for Used OTPs -->
                        <td class="px-6 py-4 text-sm">
                            <div class="flex items-center gap-2">
                                <button data-id="${formId}" class="add-otp-button p-2 text-primary hover:bg-primary/20 rounded-lg" title="Add OTPs">
                                    <span class="material-symbols-outlined">vpn_key</span>
                                </button>
                                <button data-id="${formId}" class="assign-group-button p-2 text-gray-400 hover:bg-white/10 rounded-lg" title="Assign Group">
                                    <span class="material-symbols-outlined">label</span>
                                </button>
                                
                                <!-- THIS IS THE BUTTON WE ARE WIRING UP -->
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

                // 6. Add this new row to our table body.
                formTableBody.innerHTML += row;
            });

        }, (error) => {
            console.error("Error fetching forms: ", error);
            formTableBody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-red-400">Error loading data. Check console.</td></tr>';
        });
    }
    
    // =================================================================
    // END: MILESTONE 10 CODE
    // =================================================================


    // =================================================================
    // START: MILESTONE 11 CODE (Baby Step 59)
    // This code "wires up" the "Edit" button
    // =================================================================
    
    // We listen for clicks on the *entire* table body.
    if (formTableBody) {
        formTableBody.addEventListener('click', (e) => {
            
            // We check if the thing clicked (or its parent) is an "edit-form-button"
            const editButton = e.target.closest('.edit-form-button');

            if (editButton) {
                // It was an edit button!
                
                // 1. Get the Form ID that we stored in the "data-id" attribute
                const formId = editButton.dataset.id;
                
                // 2. Redirect the user to the form-creation page,
                //    and add the form's ID to the URL as a "query parameter"
                window.location.href = `form-creation.html?formId=${formId}`;
            }
            
            // (In the future, we will add 'else if' blocks here
            // to handle the 'delete-form-button', 'add-otp-button', etc.)

        });
    }

    // =================================================================
    // END: MILESTONE 11 CODE
    // =================================================================

});