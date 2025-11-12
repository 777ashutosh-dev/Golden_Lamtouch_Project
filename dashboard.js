/*
  M15 - COMPLETE (Baby Step 70b)
  -----------------------------------------------------
  This is the new "super-smart" brain for our redesigned dashboard.
  It controls all the new M15 features:
  1. "Today's Submissions" card (date + count)
  2. Tab Switching logic (Analytics vs. Lookup)
  3. "Form Analytics" tab (Date filters, Top 5, Sorting)
  4. "OTP Lookup" tab (Search by OTP)
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();

    // =================================================================
    // 1. GLOBAL STATE (Our "Memory")
    // =================================================================
    let allForms = [];
    let allGroups = [];
    let allSubmissions = [];
    let currentSort = {
        column: 'total',
        direction: 'desc'
    }; // Default sort
    let currentFilter = 'today'; // Default filter

    // =================================================================
    // 2. DOM ELEMENTS (Targets)
    // =================================================================

    // --- Part A: "Today's Submissions" Card ---
    const todayDateDisplay = document.getElementById('today-date-display');
    const todayCountDisplay = document.getElementById('today-count-display');

    // --- Part B: Tab Buttons & Panes ---
    const analyticsTabButton = document.getElementById('analytics-tab-button');
    const lookupTabButton = document.getElementById('lookup-tab-button');
    const analyticsPane = document.getElementById('analytics-pane');
    const lookupPane = document.getElementById('lookup-pane');

    // --- Part C: "Form Analytics" Pane ---
    const analyticsFilterBar = document.querySelector('#analytics-pane .flex-wrap');
    const analyticsTableBody = document.getElementById('analytics-table-body');
    const sortTotalBtn = document.getElementById('sort-total-btn');

    // --- Part D: "OTP Lookup" Pane ---
    const otpSearchInput = document.getElementById('otp-search-input');
    const otpResultsContainer = document.getElementById('otp-results-container');
    const otpResultsTableBody = document.getElementById('otp-results-table-body');
    const otpNoResultsMessage = document.getElementById('otp-no-results-message');

    // =================================================================
    // 3. DATA LOADING (The "Brain")
    // =================================================================

    // --- Load ALL data from Firebase (one time) ---
    // We listen to all 3 collections to build our "memory"
    async function loadAllData() {
        // Use Promise.all to load forms and groups first
        await Promise.all([
            db.collection('forms').get().then(snapshot => {
                allForms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }),
            db.collection('groups').get().then(snapshot => {
                allGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            })
        ]);

        // Now, listen to SUBMISSIONS in real-time
        db.collection('submissions').onSnapshot(snapshot => {
            allSubmissions = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    // IMPORTANT: Convert Firebase Timestamp to JS Date object
                    submissionDate: data.submissionDate ? data.submissionDate.toDate() : null
                };
            });
            
            // This is the "trigger"
            // Every time submissions change, re-calculate everything!
            runDashboardUpdates();
        });
    }

    // --- This is our new "master" function ---
    function runDashboardUpdates() {
        // 1. Update the "Today's Submissions" card
        updateTodaysCard();
        
        // 2. Re-build the "Form Analytics" table
        renderAnalyticsTable();
    }

    // =================================================================
    // 4. LOGIC - PART A: "Today's Submissions" Card
    // =================================================================

    function updateTodaysCard() {
        // 1. Set the Date
        const now = new Date();
        const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
        todayDateDisplay.textContent = now.toLocaleDateString('en-IN', options); // e.g., "Wed, 12 Nov 2025"

        // 2. Get "start of today" (midnight)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // 3. Filter submissions
        const todaySubmissions = allSubmissions.filter(sub => {
            return sub.submissionDate && sub.submissionDate >= todayStart;
        });

        // 4. Set the count
        todayCountDisplay.textContent = todaySubmissions.length;
    }

    // =================================================================
    // 5. LOGIC - PART B: Tab Switching
    // =================================================================

    if (analyticsTabButton && lookupTabButton) {
        analyticsTabButton.addEventListener('click', () => {
            // Show Analytics
            analyticsPane.classList.remove('hidden');
            analyticsTabButton.classList.add('border-primary', 'text-primary');
            analyticsTabButton.classList.remove('border-transparent', 'text-gray-400', 'hover:text-white');
            
            // Hide Lookup
            lookupPane.classList.add('hidden');
            lookupTabButton.classList.add('border-transparent', 'text-gray-400', 'hover:text-white');
            lookupTabButton.classList.remove('border-primary', 'text-primary');
        });

        lookupTabButton.addEventListener('click', () => {
            // Hide Analytics
            analyticsPane.classList.add('hidden');
            analyticsTabButton.classList.remove('border-primary', 'text-primary');
            analyticsTabButton.classList.add('border-transparent', 'text-gray-400', 'hover:text-white');
            
            // Show Lookup
            lookupPane.classList.remove('hidden');
            lookupTabButton.classList.remove('border-transparent', 'text-gray-400', 'hover:text-white');
            lookupTabButton.classList.add('border-primary', 'text-primary');

            // Reset the lookup tool
            otpSearchInput.value = '';
            otpResultsContainer.classList.add('hidden');
            otpNoResultsMessage.classList.add('hidden');
        });
    }

    // =================================================================
    // 6. LOGIC - PART C: "Form Analytics" Tab
    // =================================================================

    // --- Date Filter Button Clicks ---
    if (analyticsFilterBar) {
        analyticsFilterBar.addEventListener('click', (e) => {
            if (e.target.classList.contains('analytics-filter-btn')) {
                // Get the new filter (e.g., "7day")
                currentFilter = e.target.dataset.filter;
                
                // 1. Remove "active" style from all buttons
                analyticsFilterBar.querySelectorAll('.analytics-filter-btn').forEach(btn => {
                    btn.classList.remove('bg-primary/20', 'text-primary');
                    btn.classList.add('text-gray-300', 'hover:bg-white/10');
                });
                
                // 2. Add "active" style to the clicked button
                e.target.classList.add('bg-primary/20', 'text-primary');
                e.target.classList.remove('text-gray-300', 'hover:bg-white/10');
                
                // 3. Re-build the table with the new filter
                renderAnalyticsTable();
            }
        });
    }

    // --- Main Analytics Table Renderer ---
    function renderAnalyticsTable() {
        // 1. Get the "start date" based on the current filter
        const now = new Date();
        let startDate = new Date();
        
        switch (currentFilter) {
            case 'today':
                startDate.setHours(0, 0, 0, 0); // Midnight this morning
                break;
            case '7day':
                startDate.setDate(now.getDate() - 7);
                break;
            case '15day':
                startDate.setDate(now.getDate() - 15);
                break;
            case '30day':
                startDate.setMonth(now.getMonth() - 1);
                break;
            case '6month':
                startDate.setMonth(now.getMonth() - 6);
                break;
            case 'all':
                startDate = new Date(0); // The beginning of time
                break;
        }

        // 2. Calculate stats for EACH form
        let formStats = allForms.map(form => {
            // Get all submissions for this form
            const subsForThisForm = allSubmissions.filter(s => s.formId === form.id);
            
            // Get submissions *within the period*
            const periodSubs = subsForThisForm.filter(s => {
                return s.submissionDate && s.submissionDate >= startDate;
            });
            
            return {
                id: form.id,
                name: form.formName || 'Untitled Form',
                group: allGroups.find(g => g.id === form.groupId)?.groupName || 'N/A',
                periodCount: periodSubs.length,
                totalCount: subsForThisForm.length
            };
        });

        // 3. Find the "Top 5" based on Period Count
        const sortedByPeriod = [...formStats].sort((a, b) => b.periodCount - a.periodCount);
        const top5Ids = sortedByPeriod.slice(0, 5).map(f => f.id);

        // 4. Apply our "Total Submissions" sort (as per our plan)
        formStats.sort((a, b) => {
            const valA = a[currentSort.column === 'total' ? 'totalCount' : 'periodCount'];
            const valB = b[currentSort.column === 'total' ? 'totalCount' : 'periodCount'];
            
            if (currentSort.direction === 'asc') {
                return valA - valB; // Numerical sort (ascending)
            } else {
                return valB - valA; // Numerical sort (descending)
            }
        });

        // 5. Render the HTML
        analyticsTableBody.innerHTML = '';
        if (formStats.length === 0) {
            analyticsTableBody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-gray-500">No forms created yet.</td></tr>';
            return;
        }

        formStats.forEach((stat, index) => {
            // Check if this form is in the "Top 5"
            const isTop5 = top5Ids.includes(stat.id) && stat.periodCount > 0;
            
            const row = document.createElement('tr');
            row.className = `border-b border-border-dark ${isTop5 ? 'bg-primary/5' : 'hover:bg-white/5'}`; // Highlight row!
            
            row.innerHTML = `
                <td class="px-6 py-4 text-sm font-medium ${isTop5 ? 'text-primary' : 'text-gray-300'}">${index + 1}</td>
                <td class="px-6 py-4 text-sm font-semibold ${isTop5 ? 'text-white' : 'text-gray-300'}">
                    ${stat.name}
                    ${isTop5 ? '<span class="ml-2 px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded-full">Top 5</span>' : ''}
                </td>
                <td class="px-6 py-4 text-sm text-gray-400">${stat.group}</td>
                <td class="px-6 py-4 text-sm font-bold text-white">${stat.periodCount}</td>
                <td class="px-6 py-4 text-sm font-medium text-gray-300">${stat.totalCount}</td>
            `;
            analyticsTableBody.appendChild(row);
        });
    }

    // --- Sort Button Click ---
    if (sortTotalBtn) {
        sortTotalBtn.addEventListener('click', () => {
            // 1. Toggle direction
            if (currentSort.direction === 'desc') {
                currentSort.direction = 'asc';
                sortTotalBtn.querySelector('.material-symbols-outlined').textContent = 'arrow_upward';
            } else {
                currentSort.direction = 'desc';
                sortTotalBtn.querySelector('.material-symbols-outlined').textContent = 'arrow_downward';
            }
            // 2. Re-render the table
            renderAnalyticsTable();
        });
    }

    // =================================================================
    // 7. LOGIC - PART D: "OTP Lookup" Tab
    // =================================================================

    if (otpSearchInput) {
        otpSearchInput.addEventListener('keyup', (e) => {
            // We listen for "Enter" key
            if (e.key === 'Enter') {
                const otp = e.target.value.trim().toLowerCase();
                if (otp === '') {
                    otpResultsContainer.classList.add('hidden');
                    otpNoResultsMessage.classList.add('hidden');
                    return;
                }
                
                // Find the submission with this OTP
                // We search *all* submissions, not just today's
                const foundSub = allSubmissions.find(sub => sub.otp && sub.otp.toLowerCase() === otp);
                
                if (foundSub) {
                    // --- We found a match! ---
                    otpResultsTableBody.innerHTML = ''; // Clear old results
                    
                    // Format the date (copying from old dashboard.js logic)
                    let dateString = 'N/A';
                    if (foundSub.submissionDate) {
                        const d = foundSub.submissionDate;
                        dateString = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                    }

                    // Get status badge
                    let statusBadge = '';
                    if (foundSub.status === 'Submitted') {
                        statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">Submitted</span>';
                    } else if (foundSub.status === 'Rejected') {
                        statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Rejected</span>';
                    } else {
                        statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">Pending</span>';
                    }

                    // Get Form Name
                    const formName = allForms.find(f => f.id === foundSub.formId)?.formName || 'Unknown Form';

                    // Build the single row
                    otpResultsTableBody.innerHTML = `
                        <tr class="border-b border-border-dark">
                            <td class="px-6 py-4 text-sm font-medium text-gray-300">${foundSub.serial || 'N/A'}</td>
                            <td class="px-6 py-4 text-sm text-white">${foundSub.name || 'N/A'}</td>
                            <td class="px-6 py-4 text-sm text-gray-300">${formName}</td>
                            <td class="px-6 py-4 text-sm text-gray-300">${foundSub.otp}</td>
                            <td class="px-6 py-4 text-sm text-gray-300">${dateString}</td>
                            <td class="px-6 py-4 text-sm">${statusBadge}</td>
                        </tr>
                    `;
                    
                    // Show the table, hide the "no results" message
                    otpResultsContainer.classList.remove('hidden');
                    otpNoResultsMessage.classList.add('hidden');

                } else {
                    // --- No match found ---
                    otpResultsContainer.classList.add('hidden');
                    otpNoResultsMessage.classList.remove('hidden');
                }
            }
        });
    }

    // =================================================================
    // 8. INITIALIZATION
    // =================================================================
    loadAllData(); // Start the engine!

});