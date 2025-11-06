// This is our "Dashboard Logic" file.
// It runs *after* auth-guard.js, so we know the user is logged in.

// We are telling the browser: "Don't run any of this code until the *entire* HTML page is loaded."
document.addEventListener('DOMContentLoaded', () => {

    // 1. Find all our "targets" in the HTML.
    const tableBody = document.getElementById('submission-table-body');
    const totalFormsDisplay = document.getElementById('total-forms-display');
    const otpsGeneratedDisplay = document.getElementById('otps-generated-display'); // We'll use this later
    const otpsUsedDisplay = document.getElementById('otps-used-display');       // We'll use this later
    
    // --- THIS IS OUR NEW TARGET FOR THIS STEP ---
    const totalSubmissionsDisplay = document.getElementById('total-submissions-display');


    // =================================================================
    // START: MILESTONE 5 CODE (Already Working)
    // This code block populates our main table
    // =================================================================
    if (tableBody) {
        db.collection('submissions').onSnapshot(querySnapshot => {
            
            // We got the data! First, clear out all the *old* static rows.
            tableBody.innerHTML = ''; 

            // Now, loop through every single document (row) that Firebase gave us.
            querySnapshot.forEach(doc => {
                
                const data = doc.data();

                // --- Helper Function: Format the Timestamp ---
                let dateString = 'N/A';
                if (data.submissionDate && data.submissionDate.toDate) {
                    const date = data.submissionDate.toDate();
                    dateString = date.getFullYear() + '-' +
                                 ('0' + (date.getMonth() + 1)).slice(-2) + '-' +
                                 ('0' + date.getDate()).slice(-2) + ' ' +
                                 ('0' + date.getHours()).slice(-2) + ':' +
                                 ('0' + date.getMinutes()).slice(-2);
                }
                
                // --- Helper Function: Create the Status Badge ---
                let statusBadge = '';
                if (data.status === 'Submitted') {
                    statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">Submitted</span>';
                } else if (data.status === 'Rejected') {
                    statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Rejected</span>';
                } else {
                    statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">Pending</span>';
                }

                // 5. Build the new HTML table row
                const row = `
                    <tr class="border-b border-border-dark hover:bg-white/5">
                        <td class="px-6 py-4 text-sm font-medium text-gray-300">${data.serial || 'N/A'}</td>
                        <td class="px-6 py-4 text-sm text-white">${data.name || 'N/A'}</td>
                        <td class="px-6 py-4 text-sm text-gray-300">${data.form || 'N/A'}</td>
                        <td class="px-6 py-4 text-sm text-gray-300">${data.otp || 'N/A'}</td>
                        <td class="px-6 py-4 text-sm text-gray-300">${dateString}</td>
                        <td class="px-6 py-4 text-sm">${statusBadge}</td>
                    </tr>
                `;

                // 6. Add this new row to our table body.
                tableBody.innerHTML += row;
            });

        }, (error) => {
            console.error("Error fetching submissions: ", error);
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-red-400">Error loading data. Check console.</td></tr>';
        });
    }
    // =================================================================
    // END: MILESTONE 5 CODE
    // =================================================================


    // =================================================================
    // START: MILESTONE 8 CODE (Live Stat Cards)
    // =================================================================
    
    // --- Block 1: Update "Total Forms" Card (Already Working) ---
    if (totalFormsDisplay) {
        db.collection('forms').onSnapshot(querySnapshot => {
            const formCount = querySnapshot.size;
            totalFormsDisplay.textContent = formCount;
        }, (error) => {
            console.error("Error fetching form count: ", error);
            totalFormsDisplay.textContent = '0';
        });
    }

    // --- Block 2: Update "Total Submissions" Card (NEW CODE!) ---
    if (totalSubmissionsDisplay) {
        // We do the *exact same thing*, but for the 'submissions' collection
        db.collection('submissions').onSnapshot(querySnapshot => {
            
            // Get the count of how many submissions are in the database
            const submissionCount = querySnapshot.size;

            // Update the HTML text to show our new, live number!
            totalSubmissionsDisplay.textContent = submissionCount;

        }, (error) => {
            // If it fails, log an error and show '0'
            console.error("Error fetching submission count: ", error);
            totalSubmissionsDisplay.textContent = '0';
        });
    }

    // (We will add the logic for the OTP cards here in a future milestone)

    // =================================================================
    // END: MILESTONE 8 CODE
    // =================================================================

});