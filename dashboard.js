// This is our "Dashboard Logic" file.
// It runs *after* auth-guard.js, so we know the user is logged in.

// We are telling the browser: "Don't run any of this code until the *entire* HTML page is loaded."
document.addEventListener('DOMContentLoaded', () => {

    // 1. Find our "target" in the HTML.
    // This is the <tbody> tag we gave an ID to.
    const tableBody = document.getElementById('submission-table-body');

    // 2. This is the "magic" Firebase command.
    // We are telling the database (db):
    // "Go to the 'submissions' collection and get all the documents."
    // ".onSnapshot()" is a *real-time listener*.
    // This means if we add new data in the Firebase website,
    // our table will update *automatically* without a refresh!
    db.collection('submissions').onSnapshot(querySnapshot => {
        
        // 3. We got the data! First, clear out all the *old* static rows.
        tableBody.innerHTML = ''; 

        // 4. Now, loop through every single document (row) that Firebase gave us.
        querySnapshot.forEach(doc => {
            
            // Get all the data for one row (like name, otp, etc.)
            const data = doc.data();

            // --- Helper Function: Format the Timestamp ---
            // Firebase stores dates as "Timestamps", which are complex objects.
            // We need to turn it into a simple string like "2024-06-25 12:11"
            let dateString = 'N/A';
            if (data.submissionDate && data.submissionDate.toDate) {
                const date = data.submissionDate.toDate();
                // This formats the date nicely.
                dateString = date.getFullYear() + '-' +
                             ('0' + (date.getMonth() + 1)).slice(-2) + '-' +
                             ('0' + date.getDate()).slice(-2) + ' ' +
                             ('0' + date.getHours()).slice(-2) + ':' +
                             ('0' + date.getMinutes()).slice(-2);
            }
            // --- End of Helper Function ---
            

            // --- Helper Function: Create the Status Badge ---
            // Let's build the correct HTML for the status "badge".
            let statusBadge = '';
            if (data.status === 'Submitted') {
                statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">Submitted</span>';
            } else if (data.status === 'Rejected') {
                statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Rejected</span>';
            } else {
                statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">Pending</span>';
            }
            // --- End of Helper Function ---


            // 5. Build the new HTML table row (`<tr>...</tr>`) as a string.
            // We use the backticks (`) to make a "template literal",
            // which lets us easily inject our variables like ${data.name}.
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
        // This part runs if we have an error (like we don't have permission)
        console.error("Error fetching data: ", error);
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-red-400">Error loading data. Check console.</td></tr>';
    });

});