/*
  M23 v12 - (INDIA REGION FIX) Browser Brain
  -----------------------------------------------------
  Updates:
  1. Region Fix: Explicitly connects to 'asia-south1' (India).
  This fixes the "CORS" error which was actually a "404 Not Found"
  because we were calling the US server by mistake.
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();
    
    // --- FIX: TELL FIREBASE TO USE INDIA ---
    // We access the specific app instance and request the 'asia-south1' region.
    const functions = firebase.app().functions('asia-south1');

    // --- Page "Memory" ---
    let allForms = [];
    let allSubmissions = [];
    let allOtps = [];
    
    // --- State for Sorting & Filtering ---
    let currentFilter = {
        period: 'all' // Default to "All Time"
    };
    let currentSort = {
        column: 'name', // Default sort
        direction: 'asc'
    };

    // --- DOM Targets ---
    const dateFilterSelect = document.getElementById('date-filter-select');
    const searchInput = document.getElementById('form-search-input');
    const dataTableBody = document.getElementById('data-table-body');

    // --- Sortable Column Headers ---
    const sortNameButton = document.getElementById('sort-name-button');
    const sortPeriodButton = document.getElementById('sort-period-button');
    
    // --- Modal Targets ---
    const downloadStatusModal = document.getElementById('download-status-modal');
    const downloadStatusText = document.getElementById('download-status-text');

    // =================================================================
    // START: DATA LOADING
    // =================================================================

    // --- 1. Load All Forms (Live) ---
    function loadAllForms() {
        db.collection('forms').onSnapshot(querySnapshot => {
            allForms = [];
            querySnapshot.forEach(doc => {
                allForms.push({ id: doc.id, ...doc.data() });
            });
            applyFiltersAndSort(); // Re-render the table
        }, (error) => {
            console.error("Error fetching forms: ", error);
            if(dataTableBody) dataTableBody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-red-400">Error loading forms.</td></tr>';
        });
    }

    // --- 2. Load All Submissions (Live) ---
    function loadAllSubmissions() {
        db.collection('submissions').onSnapshot(snapshot => {
            allSubmissions = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                allSubmissions.push({
                    id: doc.id,
                    ...data,
                    // IMPORTANT: Convert Firebase Timestamps to JS Date objects
                    submissionDate: data.submissionDate ? data.submissionDate.toDate() : null
                });
            });
            applyFiltersAndSort(); // Re-render the table
        }, (error) => {
            console.error("Error loading Submissions: ", error);
        });
    }

    // --- 3. Load All OTPs (Live) ---
    function loadAllOtps() {
        db.collection('otps').onSnapshot(snapshot => {
            allOtps = [];
            snapshot.forEach(doc => {
                allOtps.push({ id: doc.id, ...doc.data() });
            });
            applyFiltersAndSort(); // Re-render the table
        }, (error) => {
            console.error("Error loading OTPs: ", error);
        });
    }
    
    // =================================================================
    // START: FILTERING & SORTING (The "Analytics Brain")
    // =================================================================

    // --- Event Listeners for Toolbar ---
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            applyFiltersAndSort();
        });
    }
    if (dateFilterSelect) {
        dateFilterSelect.addEventListener('change', (e) => {
            currentFilter.period = e.target.value;
            applyFiltersAndSort();
        });
    }

    // --- Event Listeners for Sortable Columns ---
    function setupSorting() {
        const buttons = [
            { el: sortNameButton, col: 'name' },
            { el: sortPeriodButton, col: 'period' }
        ];

        buttons.forEach(btnInfo => {
            if (btnInfo.el) {
                btnInfo.el.addEventListener('click', () => {
                    // Reset icons on all buttons
                    buttons.forEach(b => {
                        if (b.el) b.el.querySelector('.material-symbols-outlined').textContent = 'unfold_more';
                    });

                    if (currentSort.column === btnInfo.col) {
                        // Flip direction
                        currentSort.direction = (currentSort.direction === 'asc') ? 'desc' : 'asc';
                    } else {
                        // Change column
                        currentSort.column = btnInfo.col;
                        // Default to descending for numbers, ascending for names
                        currentSort.direction = (btnInfo.col === 'name') ? 'asc' : 'desc';
                    }
                    
                    // Set icon for current button
                    btnInfo.el.querySelector('.material-symbols-outlined').textContent = (currentSort.direction === 'desc') ? 'arrow_downward' : 'arrow_upward';
                    
                    applyFiltersAndSort();
                });
            }
        });
    }

    /**
     * The Master Filter/Sort Function
     */
    function applyFiltersAndSort() {
        
        // --- 1. Get Start Date (for "Period" column) ---
        const now = new Date();
        let startDate = new Date();
        switch (currentFilter.period) {
            case 'today':
                startDate.setHours(0, 0, 0, 0);
                break;
            case '7day':
                startDate.setDate(now.getDate() - 7);
                break;
            case '30day':
                startDate.setMonth(now.getMonth() - 1);
                break;
            case 'all':
                startDate = new Date(0); // The beginning of time
                break;
        }

        // --- 2. Filter by Search Term ---
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        let processedForms = allForms.filter(form => {
            // Search filter
            const nameMatch = form.formName && form.formName.toLowerCase().includes(searchTerm);
            return !searchTerm || nameMatch;
        });

        // --- 3. Add Analytics Data to each form ---
        processedForms = processedForms.map(form => {
            const otpsForThisForm = allOtps.filter(otp => otp.formId === form.id);
            const subsForThisForm = allSubmissions.filter(sub => sub.formId === form.id);
            
            // Calculate submissions in the selected period
            const periodSubs = subsForThisForm.filter(s => {
                return s.submissionDate && s.submissionDate >= startDate;
            });

            return {
                ...form, // Spread all existing form data
                totalOtps: otpsForThisForm.length,
                usedOtps: otpsForThisForm.filter(otp => otp.isUsed === true).length,
                unusedOtps: otpsForThisForm.filter(otp => otp.isUsed === false).length,
                periodSubmissions: periodSubs.length,
            };
        });

        // --- 4. Apply Sorting ---
        processedForms.sort((a, b) => {
            let valA, valB;

            switch (currentSort.column) {
                case 'period':
                    valA = a.periodSubmissions;
                    valB = b.periodSubmissions;
                    break;
                case 'name':
                default:
                    valA = a.formName || '';
                    valB = b.formName || '';
                    return (currentSort.direction === 'asc')
                        ? valA.localeCompare(valB)
                        : valB.localeCompare(valA);
            }
            
            // Numeric Sort
            return (currentSort.direction === 'asc') ? (valA - valB) : (valB - valA);
        });
        
        // --- 5. Render the final table ---
        renderTable(processedForms);
    }
    
    // =================================================================
    // START: TABLE RENDERING & DOWNLOAD BUTTONS
    // =================================================================

    /**
     * Renders the table rows
     */
    function renderTable(formsToRender) {
        if (!dataTableBody) return;
        dataTableBody.innerHTML = ''; 

        if (formsToRender.length === 0) {
            dataTableBody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-gray-500">No forms match your search.</td></tr>';
            return;
        }

        formsToRender.forEach(form => {
            const formId = form.id;

            const rowHTML = `
                <tr class="border-b border-border-dark hover:bg-white/5">
                    <!-- Col 1: Form Name -->
                    <td class="px-6 py-4 text-sm font-semibold text-white">
                        <span>${form.formName || 'Untitled Form'}</span>
                    </td>
                    <!-- Col 2: Used OTPs -->
                    <td class="px-6 py-4 text-sm text-gray-300">${form.usedOtps}</td>
                    <!-- Col 3: Unused OTPs -->
                    <td class="px-6 py-4 text-sm text-gray-300">${form.unusedOtps}</td>
                    <!-- Col 4: Submissions (Period) -->
                    <td class="px-6 py-4 text-sm font-bold text-white">${form.periodSubmissions}</td>
                    
                    <!-- Col 5: Actions (One Single Button) -->
                    <td class="px-6 py-4 text-sm">
                        <button data-id="${formId}" class="download-report-button flex items-center gap-2 h-9 px-4 text-sm font-bold bg-primary text-background-dark rounded-lg hover:bg-amber-400 transition-colors" title="Download CSV + Images (.zip)">
                            <span class="material-symbols-outlined text-lg">download</span>
                            <span>Download Report</span>
                        </button>
                    </td>
                </tr>
            `;
            dataTableBody.innerHTML += rowHTML;
        });
    }
    
    /**
     * "Widest Net" listener for table clicks
     */
    if (dataTableBody) {
        dataTableBody.addEventListener('click', (e) => {
            
            // --- Handle "Download Report" Click ---
            const downloadBtn = e.target.closest('.download-report-button');
            if (downloadBtn) {
                const formId = downloadBtn.dataset.id;
                handleDownloadReport(formId);
            }
        });
    }

    // =================================================================
    // START: M23 v2 - CLOUD DOWNLOAD LOGIC
    // =================================================================

    /**
     * The New "One-Click" Download Handler
     * Calls the 'createFullReportZip' Cloud Function.
     */
    function handleDownloadReport(formId) {
        // 1. Show the modal
        if (downloadStatusModal) downloadStatusModal.classList.remove('hidden');
        if (downloadStatusText) downloadStatusText.textContent = 'Preparing your download...';

        // 2. Call the Cloud Function (IN INDIA)
        // Note: We used the 'functions' variable defined at the top which points to asia-south1
        const createFullReportZip = functions.httpsCallable('createFullReportZip');
        
        createFullReportZip({ formId: formId })
            .then((result) => {
                // --- SUCCESS ---
                const data = result.data;
                
                if (data.success) {
                    if (downloadStatusText) downloadStatusText.textContent = 'Download ready! Starting...';
                    
                    // Trigger the download via a temporary link
                    const link = document.createElement('a');
                    link.href = data.downloadUrl;
                    link.download = data.fileName || 'report.zip';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    // Close modal after a short delay
                    setTimeout(() => {
                         if (downloadStatusModal) downloadStatusModal.classList.add('hidden');
                    }, 2000);

                } else {
                    // Logic error from server (e.g., no submissions)
                    alert(data.message || 'Download failed.');
                    if (downloadStatusModal) downloadStatusModal.classList.add('hidden');
                }
            })
            .catch((error) => {
                // --- ERROR ---
                console.error("Cloud Function Error:", error);
                alert('An error occurred. Please try again. Check console for details.');
                if (downloadStatusModal) downloadStatusModal.classList.add('hidden');
            });
    }

    // =================================================================
    // START: INITIALIZE
    // =================================================================
    
    function initializePage() {
        loadAllForms();
        loadAllSubmissions();
        loadAllOtps();
        setupSorting();
    }

    initializePage();

});