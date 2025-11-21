/*
  M28 v1 - (SYSTEM LOGS: THE CONSOLE)
  -----------------------------------------------------
  Logic:
  1. READ: Listens to 'system_logs' collection (Limit 50).
  2. FILTER: Client-side filtering by 'type' for instant UI.
  3. FORMAT: Parsers for timestamps and JSON details.
  4. STYLE: Applies terminal-style color coding to events.
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();
    let allLogs = [];
    let currentFilter = 'ALL';

    // --- Targets ---
    const tableBody = document.getElementById('logs-table-body');
    const filterSelect = document.getElementById('log-filter-select');
    const refreshBtn = document.getElementById('refresh-logs-btn');
    
    // Modal Targets
    const modal = document.getElementById('log-detail-modal');
    const jsonContent = document.getElementById('log-json-content');
    const closeModalBtn = document.getElementById('close-log-modal');
    const copyBtn = document.getElementById('copy-log-btn');

    // =================================================================
    // 1. DATA LOADING (Real-time Listener)
    // =================================================================

    function initLogs() {
        // We listen to the last 100 logs for performance
        db.collection('system_logs')
            .orderBy('timestamp', 'desc')
            .limit(100)
            .onSnapshot(snapshot => {
                allLogs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                renderLogs();
            }, (error) => {
                console.error("Error fetching logs:", error);
                tableBody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-red-500 font-mono">Access Denied or Connection Failed.<br><span class="text-xs text-gray-500">Only Admins can view System Logs.</span></td></tr>`;
            });
    }

    // =================================================================
    // 2. RENDERING LOGIC (The Terminal Table)
    // =================================================================

    function renderLogs() {
        tableBody.innerHTML = '';

        const filteredLogs = allLogs.filter(log => {
            if (currentFilter === 'ALL') return true;
            return log.type === currentFilter;
        });

        if (filteredLogs.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500 font-mono">No events found for this filter.</td></tr>`;
            return;
        }

        filteredLogs.forEach(log => {
            // 1. Timestamp Formatting
            let timeString = 'N/A';
            if (log.timestamp) {
                const date = log.timestamp.toDate();
                timeString = date.toLocaleString('en-IN', {
                    month: 'short', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: false
                });
            }

            // 2. Type Badge Styling
            let badgeClass = 'bg-gray-700 text-gray-300'; // Default
            if (log.type === 'SECURITY') badgeClass = 'bg-yellow-900/30 text-yellow-500 border border-yellow-500/30';
            if (log.type === 'DESTRUCTION') badgeClass = 'bg-red-900/30 text-red-500 border border-red-500/30';
            if (log.type === 'DATA') badgeClass = 'bg-blue-900/30 text-blue-400 border border-blue-500/30';
            if (log.type === 'TRAFFIC') badgeClass = 'bg-green-900/30 text-green-400 border border-green-500/30';

            // 3. JSON Data Storage
            // We store the full details object as a string in a data attribute
            const detailsString = encodeURIComponent(JSON.stringify(log.details || {}, null, 2));

            const row = document.createElement('tr');
            row.className = 'hover:bg-white/5 transition-colors group';
            
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-gray-500 text-xs">${timeString}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 rounded text-xs font-bold tracking-wide ${badgeClass}">${log.type}</span>
                </td>
                <td class="px-6 py-4 font-semibold text-white text-sm">${log.event}</td>
                <td class="px-6 py-4 text-gray-400 text-xs font-mono">${log.actor || 'System'}</td>
                <td class="px-6 py-4 text-gray-300 text-sm">${log.description}</td>
                <td class="px-6 py-4 text-right">
                    <button class="view-payload-btn text-gray-600 hover:text-primary transition-colors opacity-0 group-hover:opacity-100" 
                            data-payload="${detailsString}" title="View Payload">
                        <span class="material-symbols-outlined text-lg">data_object</span>
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    // =================================================================
    // 3. INTERACTION LOGIC
    // =================================================================

    // Filter Change
    if (filterSelect) {
        filterSelect.addEventListener('change', (e) => {
            currentFilter = e.target.value;
            renderLogs();
        });
    }

    // Refresh (Manual)
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshBtn.classList.add('animate-spin');
            setTimeout(() => refreshBtn.classList.remove('animate-spin'), 500);
            // Since we use onSnapshot, it's already live, but this gives user feedback
        });
    }

    // View Payload (Modal)
    if (tableBody) {
        tableBody.addEventListener('click', (e) => {
            const btn = e.target.closest('.view-payload-btn');
            if (btn) {
                const rawJson = decodeURIComponent(btn.dataset.payload);
                jsonContent.textContent = rawJson; // Keeps formatting
                modal.classList.remove('hidden');
            }
        });
    }

    // Modal Controls
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }

    // Copy JSON
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const text = jsonContent.textContent;
            navigator.clipboard.writeText(text).then(() => {
                const original = copyBtn.textContent;
                copyBtn.textContent = "Copied!";
                copyBtn.classList.add('bg-green-500/20', 'text-green-400', 'border-green-500/50');
                setTimeout(() => {
                    copyBtn.textContent = original;
                    copyBtn.classList.remove('bg-green-500/20', 'text-green-400', 'border-green-500/50');
                }, 2000);
            });
        });
    }

    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    // --- INIT ---
    initLogs();

});