/*
This is the JavaScript file for your form-management.html page.
Its first job is to:
1.  Find the empty table body.
2.  Fetch all the documents from our "forms" collection in Firestore.
3.  Build and display a new row for each form we find.
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
    // START: MILESTONE 10 CODE (Live Form Table)
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
    
    // (We will add the logic for the search bar, sort, and group buttons here in a future step)

}); 