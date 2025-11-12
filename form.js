/*
  M16 - The Public-Facing Form (Baby Step 73c - FIXED)
  -----------------------------
  This file fixes two major bugs from 73b:
  1. (FIXED) A crash in 'buildDynamicForm' if a fieldName was null. 
     This prevented the rest of the form from loading.
  2. (FIXED) A "scope" bug that prevented the char counter's "brains" 
     (the 'input' listener) from being added.
  
  Our 4-Part Plan:
  - Part 1 (Baby Step 71): "OTP Gate" is COMPLETE.
  - Part 2 (Baby Step 72): "Basic Form" Builder is COMPLETE.
  - Part 3 (Baby Step 73): "Smart Image" & "Char Counter". (IN PROGRESS)
  - Part 4 (Baby Step 74): Build the "Submit" logic.
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();
    const storage = firebase.storage();

    // --- Page-level "memory" ---
    let currentFormId = null;
    let validOtpCode = null;
    let validOtpDocId = null;
    let formFields = [];
    let formData = {}; // We will use this in Part 4
    
    // (NEW) Cropper.js "memory"
    let cropper = null; // This will hold the cropper instance
    let currentImageBlobs = {}; // (NEW) This now an object to hold multiple images
    let currentImageField = null; // This tracks *which* image field we're cropping

    // (NEW) Camera "memory"
    let cameraStream = null;

    // --- Find all our "targets" in the HTML ---

    // Page Titles
    const formTitle = document.getElementById('form-title');
    const formOrgName = document.getElementById('form-org-name');

    // Part 1: "OTP Gate" Targets
    const otpGateContainer = document.getElementById('otp-gate-container');
    const otpInput = document.getElementById('otp-input');
    const verifyOtpButton = document.getElementById('verify-otp-button');
    const otpErrorMessage = document.getElementById('otp-error-message');

    // Part 2: "Form Content" Targets
    const formContentContainer = document.getElementById('form-content-container');
    const proPhotoWarning = document.getElementById('pro-photo-warning');
    const dynamicFormFields = document.getElementById('dynamic-form-fields');
    const submitFormButton = document.getElementById('submit-form-button');

    // (NEW) Part 3: "Cropper Modal" Targets
    const cropperModal = document.getElementById('cropper-modal');
    const closeCropperButton = document.getElementById('close-cropper-button');
    const cropperImage = document.getElementById('cropper-image');
    const saveCropButton = document.getElementById('save-crop-button');

    // (NEW) Part 3: "Camera Modal" Targets
    const cameraModal = document.getElementById('camera-modal');
    const cameraVideo = document.getElementById('camera-video');
    const capturePhotoButton = document.getElementById('capture-photo-button');
    const closeCameraButton = document.getElementById('close-camera-button');


    // =================================================================
    // START: M16 - PART 1 (Baby Step 71) - The "Gate" (Complete)
    // =================================================================

    function initializeForm() {
        formTitle.textContent = 'Form Submission';
        formOrgName.textContent = 'Please enter your code to begin.';
    }

    if (verifyOtpButton) {
        verifyOtpButton.addEventListener('click', async () => {
            const otpValue = otpInput.value.trim().toLowerCase();
            otpErrorMessage.textContent = '';

            if (otpValue.length !== 6) {
                showError('Code must be 6 characters long.');
                return;
            }

            verifyOtpButton.disabled = true;
            verifyOtpButton.querySelector('.truncate').textContent = 'Verifying...';

            try {
                const snapshot = await db.collection('otps')
                    .where('code', '==', otpValue)
                    .limit(1)
                    .get();

                if (snapshot.empty) {
                    showError('This code is not valid or does not exist.');
                    resetVerifyButton();
                    return;
                }

                const otpDoc = snapshot.docs[0];
                const otpData = otpDoc.data();

                if (otpData.isUsed === true) {
                    showError('This code has already been used and is no longer valid.');
                    resetVerifyButton();
                    return;
                }

                // --- SUCCESS! ---
                validOtpCode = otpData.code;
                validOtpDocId = otpDoc.id;
                currentFormId = otpData.formId;

                const formDoc = await db.collection('forms').doc(currentFormId).get();
                
                if (formDoc.exists) {
                    const formData = formDoc.data();
                    formTitle.textContent = formData.formName || 'Form Submission';
                    formOrgName.textContent = formData.orgName || 'Please fill out the form.';
                    formFields = formData.fields || [];
                    unlockForm();
                } else {
                    showError('Error: This code is for a form that no longer exists.');
                    resetVerifyButton();
                }

            } catch (err) {
                console.error("Error verifying OTP: ", err);
                showError('An error occurred. Please try again.');
                resetVerifyButton();
            }
        });
    }
    
    function showError(message) {
        otpErrorMessage.textContent = message;
    }
    
    function resetVerifyButton() {
        verifyOtpButton.disabled = false;
        verifyOtpButton.querySelector('.truncate').textContent = 'Verify Code';
    }

    function unlockForm() {
        otpGateContainer.classList.add('hidden');
        formContentContainer.classList.remove('hidden');
        buildDynamicForm();
    }

    // =================================================================
    // START: M16 - PART 2 & 3 (FIXED)
    // =================================================================
    
    function buildDynamicForm() {
        if (!formFields || formFields.length === 0) {
            dynamicFormFields.innerHTML = '<p class="text-gray-400">This form has no fields.</p>';
            return;
        }

        let hasImageField = false;

        formFields.forEach(field => {
            const fieldWrapper = document.createElement('div');
            let fieldHTML = '';
            
            // (NEW - FIX) This 'hasLimit' variable must be DECLARED here
            let hasLimit = false; 

            // (NEW - FIX) Safely create a field ID, even if fieldName is null
            // This prevents the loop from crashing.
            const safeFieldName = field.fieldName || `field-${Math.floor(Math.random() * 10000)}`;
            const fieldId = `field-${safeFieldName.replace(/[^a-zA-Z0-9-]/g, '-')}`;

            switch (field.dataType) {
                
                case 'string':
                case 'email':
                case 'numeric':
                case 'textarea': 
                    
                    const isTextarea = field.dataType === 'textarea';
                    // (NEW - FIX) We ASSIGN the value, not declare it.
                    hasLimit = field.maxLength && parseInt(field.maxLength, 10) > 0;
                    
                    const counterHTML = hasLimit ? `
                        <span class="text-xs text-gray-400" id="${fieldId}-counter">
                            0 / ${field.maxLength}
                        </span>
                    ` : '';
                    
                    const inputElement = isTextarea ? `
                        <textarea
                            rows="4"
                            id="${fieldId}"
                            placeholder="Enter ${field.fieldName.toLowerCase()}"
                            class="w-full p-4 rounded-lg bg-background-dark border border-border-dark text-white placeholder-gray-500 focus:ring-primary focus:border-primary text-sm"
                            data-field-name="${field.fieldName}"
                            ${hasLimit ? `maxlength="${field.maxLength}"` : ''}
                        ></textarea>
                    ` : `
                        <input
                            type="${field.dataType === 'string' ? 'text' : (field.dataType === 'numeric' ? 'number' : field.dataType)}"
                            id="${fieldId}"
                            placeholder="Enter ${field.fieldName.toLowerCase()}"
                            class="w-full h-10 px-4 rounded-lg bg-background-dark border border-border-dark text-white placeholder-gray-500 focus:ring-primary focus:border-primary text-sm"
                            data-field-name="${field.fieldName}"
                            ${hasLimit ? `maxlength="${field.maxLength}"` : ''}
                        >
                    `;
                    
                    fieldHTML = `
                        <div class="flex justify-between items-baseline">
                            <label for="${fieldId}" class="text-sm font-medium text-gray-300">${field.fieldName}</label>
                            ${counterHTML}
                        </div>
                        ${inputElement}
                    `;
                    fieldWrapper.className = 'flex flex-col gap-2';
                    break;

                case 'dropdown':
                    const options = (field.dropdownOptions || '').split('\n').map(opt => opt.trim()).filter(opt => opt);
                    const dropdownOptionsHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
                    fieldHTML = `
                        <label for="${fieldId}" class="text-sm font-medium text-gray-300">${field.fieldName}</label>
                        <select
                            id="${fieldId}"
                            class="w-full h-10 px-4 rounded-lg bg-background-dark border border-border-dark text-white focus:ring-primary focus:border-primary text-sm"
                            data-field-name="${field.fieldName}"
                        >
                            <option value="">Select an option...</option>
                            ${dropdownOptionsHTML}
                        </select>
                    `;
                    fieldWrapper.className = 'flex flex-col gap-2';
                    break;
                
                case 'radio':
                    const radioOptions = (field.dropdownOptions || '').split('\n').map(opt => opt.trim()).filter(opt => opt);
                    const radioOptionsHTML = radioOptions.map((opt) => `
                        <label class="flex items-center gap-3">
                            <input
                                type="radio"
                                name="${fieldId}"
                                value="${opt}"
                                class="h-4 w-4 bg-background-dark border-border-dark text-primary focus:ring-primary"
                            >
                            <span class="text-sm text-gray-300">${opt}</span>
                        </label>
                    `).join('');
                    fieldHTML = `
                        <label class="text-sm font-medium text-gray-300">${field.fieldName}</label>
                        <div class="flex flex-col gap-2 mt-2" data-field-name="${field.fieldName}">
                            ${radioOptionsHTML}
                        </div>
                    `;
                    fieldWrapper.className = 'flex flex-col gap-2';
                    break;
                
                case 'checkbox':
                    fieldHTML = `
                        <label class="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="${fieldId}"
                                data-field-name="${field.fieldName}"
                                class="h-5 w-5 rounded bg-background-dark border-border-dark text-primary focus:ring-primary"
                            >
                            <span class="text-sm font-medium text-gray-300">${field.fieldName}</span>
                        </label>
                    `;
                    fieldWrapper.className = 'flex flex-col';
                    break;
                
                case 'image':
                case 'signature':
                    hasImageField = true;
                    fieldHTML = `
                        <label class="text-sm font-medium text-gray-300">${field.fieldName}</label>
                        <div class="flex flex-col sm:flex-row gap-4">
                            <!-- Sample Photo -->
                            <div class="flex-shrink-0">
                                <img src="https://placehold.co/150x200/3e3e3e/E0E0E0?text=Sample\\n3:4" alt="Sample Photo" class="rounded-lg w-24 sm:w-36 aspect-[3/4] object-cover bg-background-dark border border-border-dark">
                                <p class="text-xs text-gray-400 mt-1 text-center">Sample (3:4)</p>
                            </div>
                            <!-- Upload Widget -->
                            <div class="flex-1 flex flex-col gap-3">
                                <!-- This is the preview box -->
                                <div id="${fieldId}-preview-box" class="hidden relative w-36 h-48 rounded-lg bg-background-dark border border-border-dark">
                                    <img id="${fieldId}-preview-img" src="" alt="Your Crop" class="w-full h-full object-cover rounded-lg">
                                    <button type="button" class="discard-image-btn absolute top-1 right-1 p-0.5 bg-black/60 rounded-full text-white hover:bg-red-500" data-field-id="${fieldId}" data-field-name="${field.fieldName}">
                                        <span class="material-symbols-outlined text-lg">close</span>
                                    </button>
                                </div>
                                <!-- This is the initial state -->
                                <div id="${fieldId}-upload-box" class="flex flex-col gap-3">
                                    <button type="button" class="upload-gallery-btn flex items-center justify-center gap-2 w-full sm:w-48 h-10 px-4 rounded-lg bg-surface-dark border border-border-dark text-sm text-gray-300 hover:bg-white/10" data-field-id="${fieldId}" data-field-name="${field.fieldName}">
                                        <span class="material-symbols-outlined text-lg">upload_file</span>
                                        <span>Upload from Gallery</span>
                                    </button>
                                    <button type="button" class="use-camera-btn flex items-center justify-center gap-2 w-full sm:w-48 h-10 px-4 rounded-lg bg-surface-dark border border-border-dark text-sm text-gray-300 hover:bg-white/10" data-field-id="${fieldId}" data-field-name="${field.fieldName}">
                                        <span class="material-symbols-outlined text-lg">photo_camera</span>
                                        <span>Use Camera</span>
                                    </button>
                                </div>
                                <span id="${fieldId}-error" class="text-sm text-red-400 h-4"></span>
                            </div>
                        </div>
                    `;
                    fieldWrapper.className = 'flex flex-col gap-2';
                    break;
                
                case 'header':
                    fieldHTML = `<h3 class="text-lg font-semibold text-primary pt-4 border-b border-border-dark">${field.fieldName}</h3>`;
                    fieldWrapper.className = ''; 
                    break;

                case 'hidden':
                    break;
            }

            // If we generated HTML, add it to the wrapper and the page
            if(fieldHTML) {
                fieldWrapper.innerHTML = fieldHTML;
                dynamicFormFields.appendChild(fieldWrapper);
            }

            // (NEW - FIX) This 'if' block is now outside the 'switch'
            // and will correctly check 'hasLimit' for 'string'/'textarea'
            if (hasLimit) {
                const input = document.getElementById(fieldId);
                const counter = document.getElementById(`${fieldId}-counter`);
                if (input && counter) {
                    input.addEventListener('input', () => {
                        counter.textContent = `${input.value.length} / ${field.maxLength}`;
                    });
                }
            }
        }); // --- End of forEach loop ---

        if (hasImageField) {
            proPhotoWarning.classList.remove('hidden');
        }
        
        // Add listeners for all new "Upload" / "Camera" buttons
        attachImageButtonListeners();
    }
    
    // =================================================================
    // START: M16 - PART 3 (Baby Step 73) - "Smart Image" & "Cropper"
    // =================================================================
    
    function attachImageButtonListeners() {
        // --- 1. "Upload from Gallery" buttons ---
        document.querySelectorAll('.upload-gallery-btn').forEach(button => {
            // (FIX) Remove old listeners to prevent bugs
            button.onclick = () => { 
                const fieldId = button.dataset.fieldId;
                const fieldName = button.dataset.fieldName;
                currentImageField = { id: fieldId, name: fieldName }; // Track which field we're editing
                
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.onchange = (e) => handleFileSelect(e, fieldId);
                fileInput.click();
            };
        });

        // --- 2. "Use Camera" buttons ---
        document.querySelectorAll('.use-camera-btn').forEach(button => {
            // (FIX) Remove old listeners
            button.onclick = () => {
                const fieldId = button.dataset.fieldId;
                const fieldName = button.dataset.fieldName;
                startCamera(fieldId, fieldName);
            };
        });

        // --- 3. (NEW - Baby Step 73d) "Discard" buttons ---
        document.querySelectorAll('.discard-image-btn').forEach(button => {
            // (FIX) Remove old listeners
            button.onclick = () => {
                const fieldId = button.dataset.fieldId;
                const fieldName = button.dataset.fieldName;

                // 1. Hide preview, show upload box
                document.getElementById(`${fieldId}-preview-box`).classList.add('hidden');
                document.getElementById(`${fieldId}-upload-box`).classList.remove('hidden');

                // 2. Clear the error message
                document.getElementById(`${fieldId}-error`).textContent = '';

                // 3. Delete the image from memory
                if (currentImageBlobs[fieldName]) {
                    delete currentImageBlobs[fieldName];
                }
            };
        });
    }

    function handleFileSelect(event, fieldId) {
        const file = event.target.files[0];
        if (!file) return;

        const errorSpan = document.getElementById(`${fieldId}-error`);
        errorSpan.textContent = '';

        // Rule 3: 1MB File Size Check
        if (file.size > 1024 * 1024) { // 1 MB
            errorSpan.textContent = 'Error: File is too large (Max 1MB).';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            cropperImage.src = e.target.result;
            cropperModal.classList.remove('hidden');
            
            if (cropper) cropper.destroy();
            
            cropper = new Cropper(cropperImage, {
                aspectRatio: 3 / 4, // Passport-style ratio
                viewMode: 2,
                autoCropArea: 1.0,
                background: false,
                responsive: true
            });
        };
        reader.readAsDataURL(file);
    }
    
    // --- Cropper Modal Buttons ---
    if (closeCropperButton) {
        closeCropperButton.addEventListener('click', () => {
            cropperModal.classList.add('hidden');
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
        });
    }

    if (saveCropButton) {
        saveCropButton.addEventListener('click', () => {
            if (!cropper || !currentImageField) return;

            cropper.getCroppedCanvas().toBlob((blob) => {
                
                // (NEW) Save blob to our object using the field *name*
                currentImageBlobs[currentImageField.name] = blob;
                
                const previewImg = document.getElementById(`${currentImageField.id}-preview-img`);
                previewImg.src = URL.createObjectURL(blob);
                
                document.getElementById(`${currentImageField.id}-preview-box`).classList.remove('hidden');
                document.getElementById(`${currentImageField.id}-upload-box`).classList.add('hidden');
                
                cropperModal.classList.add('hidden');
                if (cropper) {
                    cropper.destroy();
                    cropper = null;
                }
                
            }, 'image/jpeg', 0.9);
        });
    }

    // --- Camera Modal Logic ---
    async function startCamera(fieldId, fieldName) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            document.getElementById(`${fieldId}-error`).textContent = 'Camera not supported on this device.';
            return;
        }

        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
            cameraVideo.srcObject = cameraStream;
            cameraModal.classList.remove('hidden');
            currentImageField = { id: fieldId, name: fieldName }; // Track which field we're editing
        } catch (err) {
            console.error("Error accessing camera: ", err);
            document.getElementById(`${fieldId}-error`).textContent = 'Could not access camera.';
        }
    }

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        cameraModal.classList.add('hidden');
    }

    if (closeCameraButton) {
        closeCameraButton.addEventListener('click', stopCamera);
    }
    
    if (capturePhotoButton) {
        capturePhotoButton.addEventListener('click', () => {
            const canvas = document.createElement('canvas');
            canvas.width = cameraVideo.videoWidth;
            canvas.height = cameraVideo.videoHeight;
            const context = canvas.getContext('2d');
            context.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
            
            stopCamera();
            
            cropperImage.src = canvas.toDataURL('image/jpeg');
            cropperModal.classList.remove('hidden');

            if (cropper) cropper.destroy();
            cropper = new Cropper(cropperImage, {
                aspectRatio: 3 / 4,
                viewMode: 2,
                autoCropArea: 1.0,
                background: false,
                responsive: true
            });
        });
    }

    // =================================================================
    // START: M16 - PART 4 (Baby Step 74) - The "Submit"
    // =================================================================
    
    // We will write the final submit logic here
    
    
    // --- This starts the entire page ---
    initializeForm();

});