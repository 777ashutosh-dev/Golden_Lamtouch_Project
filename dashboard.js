/*
  M31 v1 - (EXECUTIVE DASHBOARD BRAIN)
  -----------------------------------------------------
  Updates:
  1. NEW CARDS: Logic for "Total Submissions" & "Pending Downloads".
  2. FILTERS: Added date range filtering ('7day', '30day', etc.) for the new cards.
  3. LOGIC: "Pending" now calculates (Serial > Last Downloaded) AND matches date filter.
  4. PRESERVED: All existing Analytics, OTP Lookup, and Real-time listeners.
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();
    // Even though Dashboard is read-only, we set the region for consistency
    const functions = firebase.app().functions('asia-south1');

    // =================================================================
    // 1. GLOBAL STATE
    // =================================================================
    let allForms = [];
    let allGroups = [];
    let allSubmissions = [];
    let allOtps = []; 
    let currentSort = { column: 'total', direction: 'desc' }; 
    let currentFilter = 'today'; 
    
    // --- Role State ---
    let userRole = sessionStorage.getItem('userRole') || 'admin';
    let coordinatorAccessList = null; 

    // =================================================================
    // 2. DOM ELEMENTS
    // =================================================================

    // Dashboard Cards
    const todayDateDisplay = document.getElementById('today-date-display');
    const todayCountDisplay = document.getElementById('today-count-display');
    
    // NEW: Card 2 & 3 Elements
    const totalCountDisplay = document.getElementById('total-count-display');
    const totalFilterSelect = document.getElementById('total-filter-select');
    const pendingCountDisplay = document.getElementById('pending-count-display');
    const pendingFilterSelect = document.getElementById('pending-filter-select');

    // Tabs
    const analyticsTabButton = document.getElementById('analytics-tab-button');
    const lookupTabButton = document.getElementById('lookup-tab-button');
    const analyticsPane = document.getElementById('analytics-pane');
    const lookupPane = document.getElementById('lookup-pane');

    // Analytics
    const analyticsFilterBar = document.querySelector('#analytics-pane .flex-wrap');
    const analyticsTableBody = document.getElementById('analytics-table-body');
    const sortTotalBtn = document.getElementById('sort-total-btn');

    // OTP Lookup
    const otpSearchInput = document.getElementById('otp-search-input');
    const otpResultsContainer = document.getElementById('otp-results-container');
    const otpResultsTableBody = document.getElementById('otp-results-table-body');
    const otpNoResultsMessage = document.getElementById('otp-no-results-message');
    
    // Detail Modal
    const detailModal = document.getElementById('otp-detail-modal');
    const detailContent = document.getElementById('otp-detail-content');
    const closeDetailBtn = document.getElementById('close-detail-modal');
    const closeDetailBtnMain = document.getElementById('close-detail-btn-main');
    const modalSerialDisplay = document.getElementById('modal-serial-display');

    // =================================================================
    // 3. DATA LOADING (Now 100% Real-Time)
    // =================================================================

    async function initializeDashboard() {
        
        // A. If Coordinator, fetch their access list first
        if (userRole === 'coordinator') {
            const coordDocId = sessionStorage.getItem('coordDocId');
            if (coordDocId) {
                try {
                    const doc = await db.collection('coordinators').doc(coordDocId).get();
                    if (doc.exists) {
                        coordinatorAccessList = doc.data().accessList || [];
                    } else {
                        coordinatorAccessList = [];
                    }
                } catch (error) {
                    console.error("Error fetching coordinator profile:", error);
                    coordinatorAccessList = [];
                }
            } else {
                coordinatorAccessList = [];
            }
        }

        // B. Listen for Forms (UPDATED: Real-time)
        db.collection('forms').onSnapshot(snapshot => {
            allForms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            runDashboardUpdates();
        });

        // C. Listen for Groups (UPDATED: Real-time)
        db.collection('groups').onSnapshot(snapshot => {
            allGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            runDashboardUpdates();
        });

        // D. Listen for Submissions
        db.collection('submissions').onSnapshot(snapshot => {
            allSubmissions = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    submissionDate: data.submissionDate ? data.submissionDate.toDate() : null
                };
            });
            runDashboardUpdates();
        });

        // E. Listen for OTPs
        db.collection('otps').onSnapshot(snapshot => {
            allOtps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
    }

    function runDashboardUpdates() {
        updateTodaysCard();
        updateTotalCard(); // NEW
        updatePendingCard(); // NEW
        renderAnalyticsTable();
    }

    // =================================================================
    // 4. LOGIC - PART A: "Today's Submissions" Card
    // =================================================================

    function updateTodaysCard() {
        const now = new Date();
        const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
        if(todayDateDisplay) todayDateDisplay.textContent = now.toLocaleDateString('en-IN', options); 

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // Filter Logic: Date + (Coordinator Access)
        const todaySubmissions = allSubmissions.filter(sub => {
            const isToday = sub.submissionDate && sub.submissionDate >= todayStart;
            
            if (userRole === 'admin') return isToday;
            
            // Safety check for access list
            return isToday && (coordinatorAccessList && coordinatorAccessList.includes(sub.formId));
        });

        if(todayCountDisplay) todayCountDisplay.textContent = todaySubmissions.length;
    }

    // =================================================================
    // NEW: LOGIC - PART A.2: "Total Submissions" Card
    // =================================================================

    if (totalFilterSelect) {
        totalFilterSelect.addEventListener('change', updateTotalCard);
    }

    function updateTotalCard() {
        if (!totalCountDisplay || !totalFilterSelect) return;

        const timeRange = totalFilterSelect.value;
        const startDate = getStartDateForRange(timeRange);

        // Filter: Date + (Coordinator Access)
        const filteredSubs = allSubmissions.filter(sub => {
            const isDateMatch = sub.submissionDate && sub.submissionDate >= startDate;
            
            if (userRole === 'admin') return isDateMatch;
            
            return isDateMatch && (coordinatorAccessList && coordinatorAccessList.includes(sub.formId));
        });

        totalCountDisplay.textContent = filteredSubs.length;
    }

    // =================================================================
    // NEW: LOGIC - PART A.3: "Pending Downloads" Card
    // =================================================================

    if (pendingFilterSelect) {
        pendingFilterSelect.addEventListener('change', updatePendingCard);
    }

    function updatePendingCard() {
        if (!pendingCountDisplay || !pendingFilterSelect) return;

        const timeRange = pendingFilterSelect.value;
        const startDate = getStartDateForRange(timeRange);
        
        let totalPending = 0;

        // 1. Determine visible forms (Role check)
        let visibleForms = allForms;
        if (userRole === 'coordinator') {
            visibleForms = allForms.filter(f => coordinatorAccessList && coordinatorAccessList.includes(f.id));
        }

        // 2. Loop through visible forms
        visibleForms.forEach(form => {
            const lastDownloaded = form.lastDownloadedSerial || 0;
            
            // 3. Find submissions for this form
            const formSubs = allSubmissions.filter(s => s.formId === form.id);

            // 4. Count submissions that are NEWER than last downloaded
            //    AND match the selected time range
            const pendingSubs = formSubs.filter(s => {
                const serial = parseInt(s.serialNumber || "0", 10);
                const isNew = serial > lastDownloaded;
                const isDateMatch = s.submissionDate && s.submissionDate >= startDate;
                return isNew && isDateMatch;
            });

            totalPending += pendingSubs.length;
        });

        pendingCountDisplay.textContent = totalPending;
    }

    // --- HELPER: Date Range Calculator ---
    function getStartDateForRange(range) {
        const now = new Date();
        let startDate = new Date(0); // Default All Time (Epoch)

        if (range === '7day') startDate.setDate(now.getDate() - 7);
        if (range === '30day') startDate.setDate(now.getDate() - 30);
        if (range === '90day') startDate.setDate(now.getDate() - 90);
        if (range === '6month') startDate.setMonth(now.getMonth() - 6);
        if (range === '1year') startDate.setFullYear(now.getFullYear() - 1);
        // 'all' remains Epoch

        return startDate;
    }

    // =================================================================
    // 5. LOGIC - PART B: Tab Switching
    // =================================================================

    if (analyticsTabButton && lookupTabButton) {
        analyticsTabButton.addEventListener('click', () => {
            analyticsPane.classList.remove('hidden');
            analyticsTabButton.classList.add('border-primary', 'text-primary');
            analyticsTabButton.classList.remove('border-transparent', 'text-gray-400', 'hover:text-white');
            
            lookupPane.classList.add('hidden');
            lookupTabButton.classList.add('border-transparent', 'text-gray-400', 'hover:text-white');
            lookupTabButton.classList.remove('border-primary', 'text-primary');
        });

        lookupTabButton.addEventListener('click', () => {
            analyticsPane.classList.add('hidden');
            analyticsTabButton.classList.remove('border-primary', 'text-primary');
            analyticsTabButton.classList.add('border-transparent', 'text-gray-400', 'hover:text-white');
            
            lookupPane.classList.remove('hidden');
            lookupTabButton.classList.remove('border-transparent', 'text-gray-400', 'hover:text-white');
            lookupTabButton.classList.add('border-primary', 'text-primary');

            if(otpSearchInput) otpSearchInput.value = '';
            if(otpResultsContainer) otpResultsContainer.classList.add('hidden');
            if(otpNoResultsMessage) otpNoResultsMessage.classList.add('hidden');
        });
    }

    // =================================================================
    // 6. LOGIC - PART C: "Form Analytics" Tab
    // =================================================================

    if (analyticsFilterBar) {
        analyticsFilterBar.addEventListener('click', (e) => {
            if (e.target.classList.contains('analytics-filter-btn')) {
                currentFilter = e.target.dataset.filter;
                
                analyticsFilterBar.querySelectorAll('.analytics-filter-btn').forEach(btn => {
                    btn.classList.remove('bg-primary/20', 'text-primary');
                    btn.classList.add('text-gray-300', 'hover:bg-white/10');
                });
                
                e.target.classList.add('bg-primary/20', 'text-primary');
                e.target.classList.remove('text-gray-300', 'hover:bg-white/10');
                
                renderAnalyticsTable();
            }
        });
    }

    function renderAnalyticsTable() {
        if (!analyticsTableBody) return;

        const now = new Date();
        let startDate = new Date();
        
        switch (currentFilter) {
            case 'today': startDate.setHours(0, 0, 0, 0); break;
            case '7day': startDate.setDate(now.getDate() - 7); break;
            case '15day': startDate.setDate(now.getDate() - 15); break;
            case '30day': startDate.setMonth(now.getMonth() - 1); break;
            case '6month': startDate.setMonth(now.getMonth() - 6); break;
            case 'all': startDate = new Date(0); break;
        }

        // 1. Filter Forms based on Access List
        let visibleForms = allForms;
        if (userRole === 'coordinator') {
            visibleForms = allForms.filter(f => coordinatorAccessList && coordinatorAccessList.includes(f.id));
        }

        let formStats = visibleForms.map(form => {
            const subsForThisForm = allSubmissions.filter(s => s.formId === form.id);
            const periodSubs = subsForThisForm.filter(s => s.submissionDate && s.submissionDate >= startDate);
            
            return {
                id: form.id,
                name: form.formName || 'Untitled Form',
                group: allGroups.find(g => g.id === form.groupId)?.groupName || 'N/A',
                periodCount: periodSubs.length,
                totalCount: subsForThisForm.length
            };
        });

        const sortedByPeriod = [...formStats].sort((a, b) => b.periodCount - a.periodCount);
        const top5Ids = sortedByPeriod.slice(0, 5).map(f => f.id);

        formStats.sort((a, b) => {
            const valA = a[currentSort.column === 'total' ? 'totalCount' : 'periodCount'];
            const valB = b[currentSort.column === 'total' ? 'totalCount' : 'periodCount'];
            if (currentSort.direction === 'asc') return valA - valB;
            else return valB - valA;
        });

        analyticsTableBody.innerHTML = '';
        if (formStats.length === 0) {
            const msg = userRole === 'coordinator' ? "No forms assigned to you." : "No forms created yet.";
            analyticsTableBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500">${msg}</td></tr>`;
            return;
        }

        formStats.forEach((stat, index) => {
            const isTop5 = top5Ids.includes(stat.id) && stat.periodCount > 0;
            const row = document.createElement('tr');
            row.className = `border-b border-border-dark ${isTop5 ? 'bg-primary/5' : 'hover:bg-white/5'}`;
            
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

    if (sortTotalBtn) {
        sortTotalBtn.addEventListener('click', () => {
            if (currentSort.direction === 'desc') {
                currentSort.direction = 'asc';
                sortTotalBtn.querySelector('.material-symbols-outlined').textContent = 'arrow_upward';
            } else {
                currentSort.direction = 'desc';
                sortTotalBtn.querySelector('.material-symbols-outlined').textContent = 'arrow_downward';
            }
            renderAnalyticsTable();
        });
    }

    // =================================================================
    // 7. LOGIC - PART D: "OTP Lookup" (ACCESS CONTROLLED)
    // =================================================================

    if (otpSearchInput) {
        otpSearchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                const otpInputVal = e.target.value.trim().toLowerCase();
                if (otpInputVal === '') {
                    otpResultsContainer.classList.add('hidden');
                    otpNoResultsMessage.classList.add('hidden');
                    return;
                }

                // --- Step 1: Check for Submission (Used) ---
                const foundSub = allSubmissions.find(sub => sub.otp && sub.otp.toLowerCase() === otpInputVal);
                
                if (foundSub) {
                    // --- ACCESS CHECK ---
                    if (userRole === 'coordinator' && (!coordinatorAccessList || !coordinatorAccessList.includes(foundSub.formId))) {
                        showOtpMessage(`OTP "${otpInputVal}" belongs to a form you cannot access.`, "text-red-400");
                        return;
                    }
                    renderSubmissionResult(foundSub);
                } else {
                    // --- Step 2: Check for OTP Existence (Unused) ---
                    const foundOtpDoc = allOtps.find(otp => otp.code && otp.code.toLowerCase() === otpInputVal);
                    
                    if (foundOtpDoc) {
                        // --- ACCESS CHECK ---
                        if (userRole === 'coordinator' && (!coordinatorAccessList || !coordinatorAccessList.includes(foundOtpDoc.formId))) {
                             showOtpMessage(`OTP "${otpInputVal}" belongs to a form you cannot access.`, "text-red-400");
                             return;
                        }
                        
                        // Valid & Access Allowed
                        showOtpMessage(`OTP "${foundOtpDoc.code}" is valid but has NOT been used yet.`, "text-yellow-400");
                    } else {
                        // Not found anywhere
                        showOtpMessage(`OTP "${otpInputVal}" does not exist.`, "text-red-400");
                    }
                }
            }
        });
    }

    function showOtpMessage(msg, colorClass) {
        otpResultsContainer.classList.add('hidden');
        otpNoResultsMessage.innerHTML = `<span class="${colorClass}">${msg}</span>`;
        otpNoResultsMessage.classList.remove('hidden');
    }

    function renderSubmissionResult(foundSub) {
        otpResultsTableBody.innerHTML = ''; 
        
        let dateString = 'N/A';
        if (foundSub.submissionDate) {
            dateString = foundSub.submissionDate.toLocaleString('en-IN', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        }

        let statusBadge = '';
        if (foundSub.status === 'Submitted') {
            statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">Submitted</span>';
        } else if (foundSub.status === 'Rejected') {
            statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Rejected</span>';
        } else {
            statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">${foundSub.status || 'Pending'}</span>`;
        }

        const formDef = allForms.find(f => f.id === foundSub.formId);
        const formName = formDef?.formName || 'Unknown Form';
        const serialDisplay = foundSub.serialNumber || 'N/A';

        const listRow = document.createElement('tr');
        listRow.className = "border-b border-border-dark hover:bg-white/5 cursor-pointer transition-colors";
        listRow.dataset.id = foundSub.id; 
        
        listRow.innerHTML = `
            <td class="px-6 py-4 text-sm font-medium text-gray-300">${serialDisplay}</td>
            <td class="px-6 py-4 text-sm text-gray-300">${formName}</td>
            <td class="px-6 py-4 text-sm text-gray-300">${foundSub.otp}</td>
            <td class="px-6 py-4 text-sm text-gray-300">${dateString}</td>
            <td class="px-6 py-4 text-sm">${statusBadge}</td>
        `;
        otpResultsTableBody.appendChild(listRow);
        
        otpResultsContainer.classList.remove('hidden');
        otpNoResultsMessage.classList.add('hidden');
    }

    // --- CLICK HANDLER ---
    if (otpResultsTableBody) {
        otpResultsTableBody.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (row && row.dataset.id) {
                const subId = row.dataset.id;
                const submission = allSubmissions.find(s => s.id === subId);
                if (submission) {
                    openDetailModal(submission);
                }
            }
        });
    }

    // --- MODAL LOGIC ---
    function openDetailModal(sub) {
        if (!detailModal) return;

        const formDef = allForms.find(f => f.id === sub.formId);
        const publicFormName = formDef?.formName || 'Unknown Form';

        const modalTitle = detailModal.querySelector('h3');
        if (modalTitle) {
            modalTitle.textContent = publicFormName;
        }

        if (modalSerialDisplay) {
            const serial = sub.serialNumber || 'No Serial';
            const otp = sub.otp || 'No OTP';
            const status = sub.status || 'Pending';
            let dateStr = 'N/A';
            if (sub.submissionDate instanceof Date) {
                 dateStr = sub.submissionDate.toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                 });
            }
            
            modalSerialDisplay.innerHTML = `
                <span class="text-white">${serial}</span> <span class="text-gray-600 mx-2">|</span> 
                <span class="text-primary font-mono">${otp}</span> <span class="text-gray-600 mx-2">|</span> 
                <span class="text-gray-400">${dateStr}</span> <span class="text-gray-600 mx-2">|</span> 
                <span class="${status === 'Submitted' ? 'text-green-400' : 'text-yellow-400'}">${status}</span>
            `;
        }

        detailContent.innerHTML = ''; 
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-6';

        const formatLabel = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        const skipFields = ['id', 'formId', 'otpId', 'otp', 'serialNumber', 'status', 'submissionDate'];

        for (const [key, value] of Object.entries(sub)) {
            if (skipFields.includes(key)) continue; 
            
            let displayValue = value;
            if (value instanceof Date) {
                displayValue = value.toLocaleString('en-IN');
            } else if (typeof value === 'string' && value.startsWith('http')) {
                displayValue = `<a href="${value}" target="_blank"><img src="${value}" class="h-24 w-auto rounded border border-border-dark hover:opacity-80 transition-opacity" alt="${key}"></a>`;
            } else if (typeof value === 'boolean') {
                displayValue = value ? 'Yes' : 'No';
            }

            const item = document.createElement('div');
            item.className = 'flex flex-col gap-1';
            item.innerHTML = `
                <span class="text-xs text-gray-500 uppercase font-bold tracking-wider">${formatLabel(key)}</span>
                <div class="text-sm text-white font-medium break-words">${displayValue}</div>
            `;
            grid.appendChild(item);
        }
        
        detailContent.appendChild(grid);
        detailModal.classList.remove('hidden');
    }

    const closeDetailFunc = () => detailModal.classList.add('hidden');
    if (closeDetailBtn) closeDetailBtn.addEventListener('click', closeDetailFunc);
    if (closeDetailBtnMain) closeDetailBtnMain.addEventListener('click', closeDetailFunc);

    // Init
    initializeDashboard(); 

});