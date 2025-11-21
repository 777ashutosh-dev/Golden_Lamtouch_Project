/*
  M27 v3 - (SECURE DOWNLOADS) Browser Brain
  -----------------------------------------------------
  Updates:
  1. SECURITY: Added Coordinator Role check.
  2. LOGIC: Fetches 'accessList' for Coordinators.
  3. FILTER: Hides forms in the table if the user is not assigned to them.
  4. PRESERVED: All smart download/range logic.
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();
    
    // --- FIX: TELL FIREBASE TO USE INDIA ---
    const functions = firebase.app().functions('asia-south1');

    // --- Page "Memory" ---
    let allForms = [];
    let allSubmissions = [];
    let allOtps = [];
    
    // --- State for Sorting & Filtering ---
    let currentFilter = {
        period: 'all'
    };
    let currentSort = {
        column: 'name',
        direction: 'asc'
    };
    
    // --- NEW: Role State ---
    let userRole = sessionStorage.getItem('userRole') || 'admin';
    let coordinatorAccessList = [];

    // --- State for the Active Download ---
    let currentDownloadFormId = null;
    let currentLatestSerial = 0;
    let currentLastDownloadedSerial = 0;

    // --- DOM Targets ---
    const dateFilterSelect = document.getElementById('date-filter-select');
    const searchInput = document.getElementById('form-search-input');
    const dataTableBody = document.getElementById('data-table-body');

    // --- Sortable Column Headers ---
    const sortNameButton = document.getElementById('sort-name-button');
    const sortPeriodButton = document.getElementById('sort-period-button');
    
    // --- Modal Targets (Status) ---
    const downloadStatusModal = document.getElementById('download-status-modal');
    const downloadStatusText = document.getElementById('download-status-text');

    // --- Modal Targets (Options) ---
    const optionsModal = document.getElementById('download-options-modal');
    const closeOptionsBtn = document.getElementById('close-options-modal');
    const cancelDownloadBtn = document.getElementById('cancel-download-btn');
    const confirmDownloadBtn = document.getElementById('confirm-download-btn');
    const rangeInputsContainer = document.getElementById('range-inputs-container');
    const rangeStartInput = document.getElementById('range-start-input');
    const rangeEndInput = document.getElementById('range-end-input');
    const radioButtons = document.getElementsByName('download-type');

    // =================================================================
    // START: DATA LOADING
    // =================================================================

    async function initializePage() {
        
        // 1. If Coordinator, fetch access list first
        if (userRole === 'coordinator') {
            const coordDocId = sessionStorage.getItem('coordDocId');
            if (coordDocId) {
                try {
                    const doc = await db.collection('coordinators').doc(coordDocId).get();
                    if (doc.exists) {
                        coordinatorAccessList = doc.data().accessList || [];
                    }
                } catch (e) { console.error("Auth Error", e); }
            }
        }

        // 2. Load Data
        loadAllForms();
        loadAllSubmissions();
        loadAllOtps();
        setupSorting();
    }

    // --- 1. Load All Forms (Live) ---
    function loadAllForms() {
        db.collection('forms').onSnapshot(querySnapshot => {
            allForms = [];
            querySnapshot.forEach(doc => {
                allForms.push({ id: doc.id, ...doc.data() });
            });
            applyFiltersAndSort();
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
                    submissionDate: data.submissionDate ? data.submissionDate.toDate() : null
                });
            });
            applyFiltersAndSort();
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
            applyFiltersAndSort();
        }, (error) => {
            console.error("Error loading OTPs: ", error);
        });
    }
    
    // =================================================================
    // START: FILTERING & SORTING
    // =================================================================

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

    function setupSorting() {
        const buttons = [
            { el: sortNameButton, col: 'name' },
            { el: sortPeriodButton, col: 'period' }
        ];

        buttons.forEach(btnInfo => {
            if (btnInfo.el) {
                btnInfo.el.addEventListener('click', () => {
                    buttons.forEach(b => {
                        if (b.el) b.el.querySelector('.material-symbols-outlined').textContent = 'unfold_more';
                    });

                    if (currentSort.column === btnInfo.col) {
                        currentSort.direction = (currentSort.direction === 'asc') ? 'desc' : 'asc';
                    } else {
                        currentSort.column = btnInfo.col;
                        currentSort.direction = (btnInfo.col === 'name') ? 'asc' : 'desc';
                    }
                    
                    btnInfo.el.querySelector('.material-symbols-outlined').textContent = (currentSort.direction === 'desc') ? 'arrow_downward' : 'arrow_upward';
                    applyFiltersAndSort();
                });
            }
        });
    }

    function applyFiltersAndSort() {
        
        const now = new Date();
        let startDate = new Date();
        switch (currentFilter.period) {
            case 'today': startDate.setHours(0, 0, 0, 0); break;
            case '7day': startDate.setDate(now.getDate() - 7); break;
            case '30day': startDate.setMonth(now.getMonth() - 1); break;
            case 'all': startDate = new Date(0); break;
        }

        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        
        // --- FILTER 1: Search Term ---
        let processedForms = allForms.filter(form => {
            const nameMatch = form.formName && form.formName.toLowerCase().includes(searchTerm);
            return !searchTerm || nameMatch;
        });

        // --- FILTER 2: Coordinator Access (THE SECURITY FIX) ---
        if (userRole === 'coordinator') {
            processedForms = processedForms.filter(form => coordinatorAccessList.includes(form.id));
        }

        // --- 3. Add Analytics Data ---
        processedForms = processedForms.map(form => {
            const otpsForThisForm = allOtps.filter(otp => otp.formId === form.id);
            const subsForThisForm = allSubmissions.filter(sub => sub.formId === form.id);
            
            // Calculate Latest Serial
            let maxSerial = 0;
            subsForThisForm.forEach(sub => {
                const serial = parseInt(sub.serialNumber || "0", 10);
                if (serial > maxSerial) maxSerial = serial;
            });

            const periodSubs = subsForThisForm.filter(s => {
                return s.submissionDate && s.submissionDate >= startDate;
            });

            return {
                ...form, 
                usedOtps: otpsForThisForm.filter(otp => otp.isUsed === true).length,
                unusedOtps: otpsForThisForm.filter(otp => otp.isUsed === false).length,
                periodSubmissions: periodSubs.length,
                latestSerial: maxSerial,
                lastDownloaded: form.lastDownloadedSerial || 0 // From DB
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
            
            return (currentSort.direction === 'asc') ? (valA - valB) : (valB - valA);
        });
        
        renderTable(processedForms);
    }
    
    // =================================================================
    // START: TABLE RENDERING
    // =================================================================

    function renderTable(formsToRender) {
        if (!dataTableBody) return;
        dataTableBody.innerHTML = ''; 

        if (formsToRender.length === 0) {
            const msg = userRole === 'coordinator' ? "No forms assigned to you match your search." : "No forms match your search.";
            dataTableBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500">${msg}</td></tr>`;
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
                    
                    <!-- Col 2: Latest Serial -->
                    <td class="px-6 py-4 text-sm font-bold text-white">${form.latestSerial || 'N/A'}</td>

                    <!-- Col 3: Last Downloaded -->
                    <td class="px-6 py-4 text-sm text-gray-300">${form.lastDownloaded || 'None'}</td>
                    
                    <!-- Col 4: Submissions (Period) -->
                    <td class="px-6 py-4 text-sm font-medium text-gray-300">${form.periodSubmissions}</td>
                    
                    <!-- Col 5: Actions -->
                    <td class="px-6 py-4 text-sm">
                        <button data-id="${formId}" 
                                data-latest="${form.latestSerial}"
                                data-last="${form.lastDownloaded}"
                                class="download-report-button flex items-center gap-2 h-9 px-4 text-sm font-bold bg-primary text-background-dark rounded-lg hover:bg-amber-400 transition-colors" 
                                title="Download CSV + Images (.zip)">
                            <span class="material-symbols-outlined text-lg">download</span>
                            <span>Download Report</span>
                        </button>
                    </td>
                </tr>
            `;
            dataTableBody.innerHTML += rowHTML;
        });
    }
    
    // =================================================================
    // START: MODAL & DOWNLOAD LOGIC (The New Brain)
    // =================================================================

    // 1. Open Modal Logic
    if (dataTableBody) {
        dataTableBody.addEventListener('click', (e) => {
            const downloadBtn = e.target.closest('.download-report-button');
            if (downloadBtn) {
                currentDownloadFormId = downloadBtn.dataset.id;
                currentLatestSerial = parseInt(downloadBtn.dataset.latest || "0", 10);
                currentLastDownloadedSerial = parseInt(downloadBtn.dataset.last || "0", 10);
                
                // Calculate Smart Defaults
                const suggestedStart = currentLastDownloadedSerial > 0 ? currentLastDownloadedSerial + 1 : 1;
                
                // Populate Inputs
                rangeStartInput.value = suggestedStart;
                rangeEndInput.value = currentLatestSerial;
                
                // Reset UI
                radioButtons.forEach(r => {
                    if (r.value === 'all') r.checked = true;
                });
                rangeInputsContainer.classList.add('opacity-50', 'pointer-events-none');
                
                // Show Modal
                optionsModal.classList.remove('hidden');
            }
        });
    }

    // 2. Radio Button Logic
    if (radioButtons) {
        radioButtons.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'range') {
                    rangeInputsContainer.classList.remove('opacity-50', 'pointer-events-none');
                } else {
                    rangeInputsContainer.classList.add('opacity-50', 'pointer-events-none');
                }
            });
        });
    }

    // 3. Confirm Download Logic
    if (confirmDownloadBtn) {
        confirmDownloadBtn.addEventListener('click', () => {
            const downloadType = document.querySelector('input[name="download-type"]:checked').value;
            
            let start = null;
            let end = null;

            if (downloadType === 'range') {
                start = rangeStartInput.value.trim();
                end = rangeEndInput.value.trim();
                
                // Basic Validation
                if (!start || !end) {
                    alert("Please enter both start and end serial numbers.");
                    return;
                }
            } else {
                // If "All", we set the "end" to the latest so we can save progress
                end = currentLatestSerial.toString();
            }

            // Close Options Modal -> Open Status Modal
            optionsModal.classList.add('hidden');
            executeDownload(start, end);
        });
    }

    // 4. Close/Cancel Logic
    const closeFunc = () => optionsModal.classList.add('hidden');
    if (closeOptionsBtn) closeOptionsBtn.addEventListener('click', closeFunc);
    if (cancelDownloadBtn) cancelDownloadBtn.addEventListener('click', closeFunc);


    /**
     * The Actual Download Trigger
     */
    function executeDownload(startSerial, endSerial) {
        // 1. Show Status
        if (downloadStatusModal) downloadStatusModal.classList.remove('hidden');
        if (downloadStatusText) downloadStatusText.textContent = 'Preparing your download...';

        // 2. Call Cloud Function
        const createFullReportZip = functions.httpsCallable('createFullReportZip');
        
        createFullReportZip({ 
            formId: currentDownloadFormId,
            startSerial: startSerial,
            endSerial: endSerial
        })
            .then((result) => {
                const data = result.data;
                
                if (data.success) {
                    if (downloadStatusText) downloadStatusText.textContent = 'Download ready! Starting...';
                    
                    // Trigger Download
                    const link = document.createElement('a');
                    link.href = data.downloadUrl;
                    link.download = data.fileName || 'report.zip';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    // --- SAVE PROGRESS LOGIC ---
                    // If we successfully downloaded up to a certain point, save that.
                    if (endSerial) {
                        const endInt = parseInt(endSerial, 10);
                        // Only update if this download is "newer" than what we had
                        if (endInt > currentLastDownloadedSerial) {
                            db.collection('forms').doc(currentDownloadFormId).update({
                                lastDownloadedSerial: endInt
                            });
                        }
                    }
                    
                    setTimeout(() => {
                         if (downloadStatusModal) downloadStatusModal.classList.add('hidden');
                    }, 2000);

                } else {
                    alert(data.message || 'Download failed.');
                    if (downloadStatusModal) downloadStatusModal.classList.add('hidden');
                }
            })
            .catch((error) => {
                console.error("Cloud Function Error:", error);
                alert('An error occurred. Please try again. Check console for details.');
                if (downloadStatusModal) downloadStatusModal.classList.add('hidden');
            });
    }

    // =================================================================
    // START: INITIALIZE
    // =================================================================
    
    initializePage();

});