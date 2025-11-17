/*
  M19 - (Step 99.2) "Global Settings" Logic
  -----------------------------------------------------
  This is the new "brain" for the settings.html page.
  
  LOGIC:
  1.  On page load, it finds the 'config/global' document.
  2.  It populates the input box with the 'serialPrefix' value.
  3.  When "Save" is clicked, it saves the new value back to
      the 'config/global' document.
*/
document.addEventListener('DOMContentLoaded', () => {

    // Auth guard is already running, so we just need Firestore
    const db = firebase.firestore();

    // --- Find all our "targets" in the HTML ---
    const serialPrefixInput = document.getElementById('serial-prefix-input');
    const saveSettingsButton = document.getElementById('save-settings-button');
    const saveSuccessMessage = document.getElementById('save-success-message');

    // Define the exact document we are working with
    const globalConfigRef = db.collection('config').doc('global');

    let saveTimeout; // This will be used to hide the success message

    /**
     * Loads the current settings from Firestore and
     * populates the input fields.
     */
    async function loadSettings() {
        if (!serialPrefixInput) return; // Safety check

        try {
            const doc = await globalConfigRef.get();
            if (doc.exists) {
                const data = doc.data();
                serialPrefixInput.value = data.serialPrefix || '';
            } else {
                // If the doc doesn't exist, we show a blank
                console.log("No global config set yet. Displaying blank.");
                serialPrefixInput.value = '';
            }
        } catch (error) {
            console.error("Error loading settings:", error);
            alert("Error: Could not load settings. Check console.");
        }
    }

    /**
     * Handles the "Save" button click event.
     */
    if (saveSettingsButton) {
        saveSettingsButton.addEventListener('click', async () => {
            if (!serialPrefixInput) return;

            const newPrefix = serialPrefixInput.value.trim();

            // --- Show loading state ---
            saveSettingsButton.disabled = true;
            saveSettingsButton.querySelector('.truncate').textContent = 'Saving...';
            saveSuccessMessage.classList.add('hidden'); // Hide old message
            
            // Clear any previous timeouts
            if (saveTimeout) clearTimeout(saveTimeout);

            try {
                // This is the "save" command.
                // { merge: true } is "Simple & Stable": it will
                // create the 'config/global' doc if it's missing,
                // or just update the 'serialPrefix' field if it exists.
                await globalConfigRef.set({
                    serialPrefix: newPrefix
                }, { merge: true });

                // --- Show success state ---
                saveSuccessMessage.classList.remove('hidden');

                // Hide the success message after 3 seconds
                saveTimeout = setTimeout(() => {
                    saveSuccessMessage.classList.add('hidden');
                }, 3000);

            } catch (error) {
                console.error("Error saving settings:", error);
                alert("Error: Could not save settings. Check console.");
            } finally {
                // --- Reset button ---
                saveSettingsButton.disabled = false;
                saveSettingsButton.querySelector('.truncate').textContent = 'Save Settings';
            }
        });
    }

    // --- This starts the page ---
    loadSettings();

});