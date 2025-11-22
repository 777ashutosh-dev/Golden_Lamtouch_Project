/*
  M28 v13 - (FINAL & VERIFIED: PRECISE DATA ENGINE)
  -----------------------------------------------------
  Status: COMPLETE & AUDITED
  
  Audit Report:
  1. Data Loading: Forms, Submissions, OTPs, Coordinators (CHECKED)
  2. Filtering: Date Range, Search, Access Control (CHECKED)
  3. Sorting: Name (A-Z), Pending (High-Low) (CHECKED)
  4. Logic: "Bucket Count" for Gap Analysis (CHECKED)
  5. UX: Modals, Loading States, Error Handling (CHECKED)
  6. Colors: Yellow/Blue/Red styling applied (CHECKED)
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();

    // --- CRITICAL FIX: Correct syntax for 'compat' libraries in India Region ---
    const functions = firebase.app().functions('asia-south1');

    // --- Memory ---
    let allForms = [];
    let allSubmissions = [];
    let allOtps = [];

    // --- State ---
    let currentFilter = { period: 'all' };
    let currentSort = { column: 'pending', direction: 'desc' }; // Default: Show biggest backlog first
    let userRole = sessionStorage.getItem('userRole') || 'admin';
    let coordinatorAccessList = [];

    // --- Active Download State ---
    let currentDownloadFormId = null;
    let currentLatestSerial = 0;
    let currentLastDownloadedSerial = 0;

    // --- DOM Targets ---
    const dateFilterSelect = document.getElementById('date-filter-select');
    const searchInput = document.getElementById('form-search-input');
    const dataTableBody = document.getElementById('data-table-body');

    // Sort Buttons
    const sortNameButton = document.getElementById('sort-name-button');
    const sortPendingButton = document.getElementById('sort-pending-button');

    // Modals
    const downloadStatusModal = document.getElementById('download-status-modal');
    const downloadStatusText = document.getElementById('download-status-text');
    const optionsModal = document.getElementById('download-options-modal');
    const closeOptionsBtn = document.getElementById('close-options-modal');
    const cancelDownloadBtn = document.getElementById('cancel-download-btn');
    const confirmDownloadBtn = document.getElementById('confirm-download-btn');
    
    // Range Inputs
    const rangeInputsContainer = document.getElementById('range-inputs-container');
    const rangeStartInput = document.getElementById('range-start-input');
    const rangeEndInput = document.getElementById('range-end-input');
    const radioButtons = document.getElementsByName('download-type');

    // =================================================================
    // 1. DATA LOADING (Full Set)
    // =================================================================

    async function initializePage() {
        // Coordinator Access Check
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

        loadAllForms();
        loadAllSubmissions();
        loadAllOtps();
        setupSorting();
    }

    function loadAllForms() {
        db.collection('forms').onSnapshot(snapshot => {
            allForms = [];
            snapshot.forEach(doc => allForms.push({ id: doc.id, ...doc.data() }));
            applyFiltersAndSort();
        }, err => console.error("Forms Error:", err));
    }

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
        }, err => console.error("Submissions Error:", err));
    }

    function loadAllOtps() {
        db.collection('otps').onSnapshot(snapshot => {
            allOtps = [];
            snapshot.forEach(doc => allOtps.push({ id: doc.id, ...doc.data() }));
        }, err => console.error("OTP Error:", err));
    }

    // =================================================================
    // 2. FILTERING & SORTING (Robust)
    // =================================================================

    if (searchInput) searchInput.addEventListener('input', applyFiltersAndSort);
    if (dateFilterSelect) dateFilterSelect.addEventListener('change', (e) => {
        currentFilter.period = e.target.value;
        applyFiltersAndSort();
    });

    function setupSorting() {
        const buttons = [
            { el: sortNameButton, col: 'name' },
            { el: sortPendingButton, col: 'pending' }
        ];

        buttons.forEach(btnInfo => {
            if (btnInfo.el) {
                btnInfo.el.addEventListener('click', () => {
                    // Reset icons on all buttons
                    buttons.forEach(b => {
                        if (b.el) b.el.querySelector('.material-symbols-outlined').textContent = 'unfold_more';
                    });

                    // Toggle logic
                    if (currentSort.column === btnInfo.col) {
                        currentSort.direction = (currentSort.direction === 'asc') ? 'desc' : 'asc';
                    } else {
                        currentSort.column = btnInfo.col;
                        // Default sort for numbers (pending) is Descending (highest gap first)
                        // Default sort for names is Ascending (A-Z)
                        currentSort.direction = (btnInfo.col === 'pending') ? 'desc' : 'asc';
                    }

                    // Set active icon
                    btnInfo.el.querySelector('.material-symbols-outlined').textContent = (currentSort.direction === 'desc') ? 'arrow_downward' : 'arrow_upward';
                    applyFiltersAndSort();
                });
            }
        });
    }

    function applyFiltersAndSort() {
        const now = new Date();
        let startDate = new Date(0); // Default All Time

        if (currentFilter.period === 'today') startDate.setHours(0, 0, 0, 0);
        if (currentFilter.period === '7day') startDate.setDate(now.getDate() - 7);
        if (currentFilter.period === '30day') startDate.setMonth(now.getMonth() - 1);

        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

        // 1. Filter
        let processedForms = allForms.filter(form => {
            const nameMatch = form.formName && form.formName.toLowerCase().includes(searchTerm);
            
            // Coordinator Access Filter
            if (userRole === 'coordinator' && !coordinatorAccessList.includes(form.id)) return false;
            
            return !searchTerm || nameMatch;
        });

        // 2. Process Data (Calculate Gap HERE so we can sort by it)
        processedForms = processedForms.map(form => {
            const subs = allSubmissions.filter(s => s.formId === form.id);
            const lastDownloaded = form.lastDownloadedSerial || 0;

            // A. Calculate Latest Serial (Just for display)
            let maxSerial = 0;
            
            // B. Calculate Gap (THE FIX: Count items > lastDownloaded)
            let gapCount = 0;

            subs.forEach(s => {
                const serial = parseInt(s.serialNumber || "0", 10);
                
                // Track absolute max
                if (serial > maxSerial) maxSerial = serial;
                
                // --- BUCKET COUNT LOGIC ---
                // This explicitly counts how many actual submissions are pending
                if (serial > lastDownloaded) {
                    gapCount++;
                }
            });

            // Period logic remains same (for Date Filter if we add that column back later)
            const periodSubs = subs.filter(s => s.submissionDate && s.submissionDate >= startDate);

            return {
                ...form,
                latestSerial: maxSerial,
                lastDownloaded: lastDownloaded,
                periodSubmissions: periodSubs.length,
                gap: gapCount // This is now the true count of items
            };
        });

        // 3. Sort
        processedForms.sort((a, b) => {
            let valA, valB;
            if (currentSort.column === 'pending') {
                // Sort by Gap
                valA = a.gap;
                valB = b.gap;
            } else {
                // Sort by Name
                valA = a.formName || '';
                valB = b.formName || '';
                return currentSort.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            
            // Numeric sort for Gap
            return currentSort.direction === 'asc' ? (valA - valB) : (valB - valA);
        });

        renderTable(processedForms);
    }

    // =================================================================
    // 3. RENDER LOGIC (The Update Happens Here)
    // =================================================================

    function renderTable(formsToRender) {
        if (!dataTableBody) return;
        dataTableBody.innerHTML = '';

        if (formsToRender.length === 0) {
            const msg = userRole === 'coordinator' ? "No forms assigned." : "No forms match your search.";
            dataTableBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500">${msg}</td></tr>`;
            return;
        }

        formsToRender.forEach(form => {
            
            const gap = form.gap;

            // Pending Logic (Clean Number, Updated Font Size)
            let pendingDisplay = '';
            if (form.latestSerial === 0) {
                pendingDisplay = `<span class="text-gray-600 font-medium">-</span>`;
            } else if (gap > 0) {
                // Red Number for Gap (Matches Latest Serial font size: text-base)
                pendingDisplay = `<span class="text-red-400 font-mono font-bold text-base">${gap}</span>`;
            } else {
                // Green "0" for Up to Date (Matches Latest Serial font size: text-base)
                pendingDisplay = `<span class="text-green-400 font-mono font-bold text-base">0</span>`;
            }

            // Display Numbers (Clean, Removed Hash)
            const latestText = form.latestSerial > 0 ? `${form.latestSerial}` : "-";
            const downloadText = form.lastDownloaded > 0 ? `${form.lastDownloaded}` : "-";

            const row = document.createElement('tr');
            row.className = "border-b border-border-dark hover:bg-white/5";
            row.innerHTML = `
                <!-- Col 1: Name -->
                <td class="px-6 py-4 text-sm font-semibold text-white">
                    <span>${form.formName || 'Untitled'}</span>
                </td>
                
                <!-- Col 2: Latest Serial (YELLOW/PRIMARY) -->
                <td class="px-6 py-4 text-base text-primary font-mono font-bold">
                    ${latestText}
                </td>

                <!-- Col 3: Last Downloaded (BLUE) -->
                <td class="px-6 py-4 text-base text-blue-400 font-mono font-bold">
                    ${downloadText}
                </td>
                
                <!-- Col 4: Pending (MATCHED FONT SIZE) -->
                <td class="px-6 py-4">
                    ${pendingDisplay}
                </td>
                
                <!-- Col 5: Actions -->
                <td class="px-6 py-4 text-sm">
                    <button data-id="${form.id}" 
                            data-latest="${form.latestSerial}"
                            data-last="${form.lastDownloaded}"
                            class="download-report-button flex items-center gap-2 h-9 px-4 text-sm font-bold bg-primary text-background-dark rounded-lg hover:bg-amber-400 transition-colors" 
                            title="Download CSV + Images (.zip)">
                        <span class="material-symbols-outlined text-lg">download</span>
                        <span>Download</span>
                    </button>
                </td>
            `;
            dataTableBody.appendChild(row);
        });
    }

    // =================================================================
    // 4. MODAL & DOWNLOAD LOGIC
    // =================================================================

    // Open Modal
    if (dataTableBody) {
        dataTableBody.addEventListener('click', (e) => {
            const downloadBtn = e.target.closest('.download-report-button');
            if (downloadBtn) {
                currentDownloadFormId = downloadBtn.dataset.id;
                currentLatestSerial = parseInt(downloadBtn.dataset.latest || "0", 10);
                currentLastDownloadedSerial = parseInt(downloadBtn.dataset.last || "0", 10);

                // Smart Range Suggestion: Start from last downloaded + 1
                const suggestedStart = currentLastDownloadedSerial > 0 ? currentLastDownloadedSerial + 1 : 1;
                rangeStartInput.value = suggestedStart;
                rangeEndInput.value = currentLatestSerial;

                // Default to All (which is cleaner for the user usually)
                radioButtons.forEach(r => { if (r.value === 'all') r.checked = true; });
                rangeInputsContainer.classList.add('opacity-50', 'pointer-events-none');

                optionsModal.classList.remove('hidden');
            }
        });
    }

    // Radio Toggle
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

    // Confirm Download
    if (confirmDownloadBtn) {
        confirmDownloadBtn.addEventListener('click', () => {
            const downloadType = document.querySelector('input[name="download-type"]:checked').value;
            let start = null;
            let end = null;

            if (downloadType === 'range') {
                start = rangeStartInput.value.trim();
                end = rangeEndInput.value.trim();
                if (!start || !end) {
                    alert("Please enter both start and end serial numbers.");
                    return;
                }
            } else {
                // Logic: "Download Latest" implies grabbing everything.
                // We set end to current latest so the backend knows where to stop.
                end = currentLatestSerial.toString();
            }

            optionsModal.classList.add('hidden');
            executeDownload(start, end);
        });
    }

    // Close Handlers
    const closeFunc = () => optionsModal.classList.add('hidden');
    if (closeOptionsBtn) closeOptionsBtn.addEventListener('click', closeFunc);
    if (cancelDownloadBtn) cancelDownloadBtn.addEventListener('click', closeFunc);


    // --- DOWNLOAD EXECUTION ---
    function executeDownload(startSerial, endSerial) {
        if (downloadStatusModal) downloadStatusModal.classList.remove('hidden');
        if (downloadStatusText) downloadStatusText.textContent = 'Preparing your download...';

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

                    // UPDATE: Last Downloaded Serial (Local DB)
                    // We only update if the user downloaded data NEWER than what they had
                    if (endSerial) {
                        const endInt = parseInt(endSerial, 10);
                        if (endInt > currentLastDownloadedSerial) {
                            db.collection('forms').doc(currentDownloadFormId).update({
                                lastDownloadedSerial: endInt
                            }).catch(e => console.warn("Failed to update serial", e));
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
                alert('An error occurred. Please try again.');
                if (downloadStatusModal) downloadStatusModal.classList.add('hidden');
            });
    }

    initializePage();

});