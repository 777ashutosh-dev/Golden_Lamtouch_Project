/*
  M17 - (Step 96) Email Validation FIX
  -----------------------------
  Updates:
  1. (BUG FIX) The `validateForm()` function now
     includes a regex check to ensure that any field
     with the `dataType: 'email'` is a valid email
     format before allowing submission.
*/

document.addEventListener('DOMContentLoaded', () => {

    const db = firebase.firestore();
    const storage = firebase.storage();

    // --- Page-level "memory" ---
    let currentFormId = null;
    let validOtpCode = null;
    let validOtpDocId = null;
    let formFields = [];
    
    // This will hold our final data
    let currentImageBlobs = {};
    let collectedData = {}; 
    let currentImageField = null; 

    let cropper = null; 
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
    const dynamicFormFields = document.getElementById('dynamic-form-fields');
    const submitFormButton = document.getElementById('submit-form-button');
    const submitErrorMessage = document.getElementById('submit-error-message');

    // Part 3: "Cropper Modal" Targets
    const cropperModal = document.getElementById('cropper-modal');
    const closeCropperButton = document.getElementById('close-cropper-button');
    const cropperImage = document.getElementById('cropper-image');
    const saveCropButton = document.getElementById('save-crop-button');
    const cropperModalTitle = document.getElementById('cropper-modal-title');
    const cropperModalText = document.getElementById('cropper-modal-text');

    // Part 3: "Camera Modal" Targets
    const cameraModal = document.getElementById('camera-modal');
    const cameraVideo = document.getElementById('camera-video');
    const capturePhotoButton = document.getElementById('capture-photo-button');
    const closeCameraButton = document.getElementById('close-camera-button');

    // Part 4: "Preview Modal" Targets
    const previewModal = document.getElementById('preview-modal');
    const closePreviewButton = document.getElementById('close-preview-button');
    const cancelPreviewButton = document.getElementById('cancel-preview-button');
    const confirmSubmitButton = document.getElementById('confirm-submit-button');
    const previewDataContainer = document.getElementById('preview-data-container');
    
    // Step 73b: The "Vibe" Overlay
    const submissionOverlay = document.getElementById('submission-overlay');


    // =================================================================
    // START: M16 - PART 1 - The "Gate"
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
                    formFields = formData.fields || []; // Our template!
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
    // START: M16 - PART 2 & 3 - The "Builder"
    // =================================================================
    
    function buildDynamicForm() {
        if (!formFields || formFields.length === 0) {
            dynamicFormFields.innerHTML = '<p class="text-gray-400">This form has no fields.</p>';
            return;
        }

        dynamicFormFields.innerHTML = ''; // Clear old fields

        formFields.forEach(field => {
            if (field.dataType === 'hidden') return; // Skip hidden fields

            const fieldWrapper = document.createElement('div');
            let fieldHTML = '';
            
            let hasLimit = false; 

            const safeFieldName = field.fieldName || `field-${Math.floor(Math.random() * 10000)}`;
            const fieldId = `field-${safeFieldName.replace(/[^a-zA-Z0-9-]/g, '-')}`;
            const fieldContainerId = `${fieldId}-container`; 

            switch (field.dataType) {
                
                case 'string':
                case 'email':
                case 'numeric':
                case 'textarea': 
                    
                    const isTextarea = field.dataType === 'textarea';
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
                            class="field-input w-full p-4 rounded-lg bg-background-dark border border-border-dark text-white placeholder-gray-500 focus:ring-primary focus:border-primary text-sm"
                            data-field-name="${field.fieldName}"
                            data-case-type="${field.caseType || 'as-typed'}"
                            ${hasLimit ? `maxlength="${field.maxLength}"` : ''}
                        ></textarea>
                    ` : `
                        <input
                            type="${field.dataType === 'string' ? 'text' : (field.dataType === 'numeric' ? 'number' : field.dataType)}"
                            id="${fieldId}"
                            placeholder="Enter ${field.fieldName.toLowerCase()}"
                            class="field-input w-full h-10 px-4 rounded-lg bg-background-dark border border-border-dark text-white placeholder-gray-500 focus:ring-primary focus:border-primary text-sm"
                            data-field-name="${field.fieldName}"
                            data-case-type="${field.caseType || 'as-typed'}"
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
                    fieldWrapper.className = 'flex flex-col gap-2 p-3 rounded-lg border border-transparent';
                    fieldWrapper.id = fieldContainerId; 
                    break;

                case 'dropdown':
                    const options = (field.dropdownOptions || '').split('\n').map(opt => opt.trim()).filter(opt => opt);
                    const dropdownOptionsHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
                    fieldHTML = `
                        <label for="${fieldId}" class="text-sm font-medium text-gray-300">${field.fieldName}</label>
                        <select
                            id="${fieldId}"
                            class="field-input w-full h-10 px-4 rounded-lg bg-background-dark border border-border-dark text-white focus:ring-primary focus:border-primary text-sm"
                            data-field-name="${field.fieldName}"
                        >
                            <option value="">Select an option...</option>
                            ${dropdownOptionsHTML}
                        </select>
                    `;
                    fieldWrapper.className = 'flex flex-col gap-2 p-3 rounded-lg border border-transparent';
                    fieldWrapper.id = fieldContainerId; 
                    break;
                
                case 'radio':
                    const radioOptions = (field.dropdownOptions || '').split('\n').map(opt => opt.trim()).filter(opt => opt);
                    const radioOptionsHTML = radioOptions.map((opt, index) => `
                        <label class="flex items-center gap-3">
                            <input
                                type="radio"
                                id="${fieldId}-${index}"
                                name="${fieldId}"
                                value="${opt}"
                                class="field-input-radio h-4 w-4 bg-background-dark border border-border-dark text-primary focus:ring-primary"
                                data-field-name="${field.fieldName}"
                            >
                            <span class="text-sm text-gray-300">${opt}</span>
                        </label>
                    `).join('');
                    fieldHTML = `
                        <label class="text-sm font-medium text-gray-300">${field.fieldName}</label>
                        <div class="flex flex-col gap-2 mt-2" id="${fieldId}" data-field-name="${field.fieldName}">
                            ${radioOptionsHTML}
                        </div>
                    `;
                    fieldWrapper.className = 'flex flex-col gap-2 p-3 rounded-lg border border-transparent';
                    fieldWrapper.id = fieldContainerId; 
                    break;
                
                case 'checkbox':
                    fieldHTML = `
                        <label class="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="${fieldId}"
                                class="field-input-checkbox h-5 w-5 rounded bg-background-dark border border-border-dark text-primary focus:ring-primary"
                                data-field-name="${field.fieldName}"
                            >
                            <span class="text-sm font-medium text-gray-300">${field.fieldName}</span>
                        </label>
                    `;
                    fieldWrapper.className = 'flex flex-col p-3 rounded-lg border border-transparent';
                    fieldWrapper.id = fieldContainerId; 
                    break;
                
                case 'image':
                case 'signature':
                    const isSignature = field.dataType === 'signature';
                    const aspectClass = isSignature ? 'aspect-[8/3] w-full sm:w-64' : 'aspect-[3/4] w-48'; 
                    const sampleURL = isSignature 
                        ? 'https://placehold.co/320x120/3e3e3e/E0E0E0?text=Sample\\n8:3' 
                        : 'https://placehold.co/180x240/3e3e3e/E0E0E0?text=Sample\\n3:4';
                    const sampleText = isSignature ? 'Sample (8:3)' : 'Sample (3:4)';
                    const previewClass = isSignature ? 'w-full sm:w-64 h-24' : 'w-48 h-64';
                    
                    const warningText = `
                        <div class="flex items-start gap-2 mt-2 p-3 bg-yellow-900/20 rounded-lg border border-yellow-400/30">
                            <span class="material-symbols-outlined text-yellow-400 text-lg">warning</span>
                            <p class="flex-1 text-xs text-yellow-300 font-medium">
                                Please upload a clear, professional ${isSignature ? 'signature' : 'photo'} (no hats or sunglasses).
                                <span class="block mt-1 text-yellow-400/80">The manufacturer is not responsible for poor quality prints from badly uploaded images.</span>
                            </p>
                        </div>
                    `;

                    const fileInputId = `${fieldId}-file-input`; 

                    fieldHTML = `
                        <label class="text-sm font-medium text-gray-300">${field.fieldName}</label>
                        <div id="${fieldId}-widget" class="flex flex-col sm:flex-row gap-4 p-3 rounded-lg border border-transparent">
                            <!-- Sample Photo -->
                            <div class="flex-shrink-0">
                                <img src="${sampleURL}" alt="Sample Photo" class="rounded-lg ${aspectClass} object-cover bg-background-dark border border-border-dark">
                                <p class="text-xs text-gray-400 mt-1 text-center">${sampleText}</p>
                            </div>
                            <!-- Upload Widget -->
                            <div class="flex-1 flex flex-col gap-3">
                                <!-- This is the preview box -->
                                <div id="${fieldId}-preview-box" class="hidden relative ${previewClass} rounded-lg bg-background-dark border border-border-dark">
                                    <img id="${fieldId}-preview-img" src="" alt="Your Crop" class="w-full h-full object-cover rounded-lg">
                                    <button type="button" class="discard-image-btn absolute top-1 right-1 p-0.5 bg-black/60 rounded-full text-white hover:bg-red-500" data-field-id="${fieldId}" data-field-name="${field.fieldName}">
                                        <span class="material-symbols-outlined text-lg">close</span>
                                    </button>
                                </div>
                                <!-- This is the initial state -->
                                <div id="${fieldId}-upload-box" class="flex flex-col gap-3">
                                    
                                    <label for="${fileInputId}" class="upload-gallery-label flex items-center justify-center gap-2 w-full sm:w-56 h-10 px-4 rounded-lg bg-surface-dark border border-border-dark text-sm text-gray-300 hover:bg-white/10 cursor-pointer">
                                        <span class="material-symbols-outlined text-lg">upload_file</span>
                                        <span>Upload from Gallery</span>
                                    </label>
                                    
                                    <input type="file" id="${fileInputId}" class="hidden file-input" accept="image/*" data-field-id="${fieldId}" data-field-name="${field.fieldName}" data-type="${field.dataType}">

                                    <button type="button" class="use-camera-btn flex items-center justify-center gap-2 w-full sm:w-56 h-10 px-4 rounded-lg bg-surface-dark border border-border-dark text-sm text-gray-300 hover:bg-white/10" data-field-id="${fieldId}" data-field-name="${field.fieldName}" data-type="${field.dataType}">
                                        <span class="material-symbols-outlined text-lg">photo_camera</span>
                                        <span>Use Camera</span>
                                    </button>
                                </div>
                                <span id="${fieldId}-error" class="text-sm text-red-400 h-4"></span>
                            </div>
                        </div>
                        ${warningText} 
                    `;
                    fieldWrapper.className = 'flex flex-col gap-2';
                    fieldWrapper.id = fieldContainerId; 
                    break;
                
                case 'header':
                    fieldHTML = `<h3 class="text-lg font-semibold text-primary pt-4 border-b border-border-dark">${field.fieldName}</h3>`;
                    fieldWrapper.className = ''; 
                    break;
            }

            if(fieldHTML) {
                fieldWrapper.innerHTML = fieldHTML;
                dynamicFormFields.appendChild(fieldWrapper);
            }
        }); 
        
        // Finally, attach our listeners
        attachAllListeners();
    }
    
    // =================================================================
    // START: M16 - THE "Widest Net" Listeners
    // =================================================================
    
    function attachAllListeners() {
        
        // --- 1. The "Widest Net" for Gallery Uploads ---
        document.addEventListener('change', (e) => {
            // Check if the changed element is one of our file inputs
            if (e.target.classList.contains('file-input')) {
                // Manually set the current field data
                currentImageField = { 
                    id: e.target.dataset.fieldId, 
                    name: e.target.dataset.fieldName, 
                    type: e.target.dataset.type 
                };
                
                // Now handle the file
                handleFileSelect(e);
            }
        });


        // --- 2. Brains for Text Inputs (Counter & Case) ---
        if (dynamicFormFields) {
            dynamicFormFields.addEventListener('input', (e) => {
                if (e.target.classList.contains('field-input')) {
                    const input = e.target;
                    const hasLimit = input.hasAttribute('maxlength');
                    const caseType = input.dataset.caseType;

                    if (hasLimit || caseType === 'all-caps' || caseType === 'sentence-case') {
                        const fieldId = input.id;
                        const counter = document.getElementById(`${fieldId}-counter`);
                        
                        let value = input.value;
                        
                        // Enforce Case Type
                        if (caseType === 'all-caps') {
                            value = value.toUpperCase();
                        } else if (caseType === 'sentence-case' && value.length > 0) {
                            value = value.charAt(0).toUpperCase() + value.slice(1);
                        }
                        input.value = value;
                        
                        // Update Counter
                        if (hasLimit && counter) {
                            counter.textContent = `${value.length} / ${input.maxLength}`;
                        }
                    }
                }
            });
        }
        
        // --- 3. Brains for ALL other Buttons (Camera, Discard) ---
        if (dynamicFormFields) {
            dynamicFormFields.addEventListener('click', (e) => {
                
                // --- Camera Button ---
                const cameraBtn = e.target.closest('.use-camera-btn');
                if (cameraBtn) {
                    startCamera(cameraBtn.dataset.fieldId, cameraBtn.dataset.fieldName, cameraBtn.dataset.type);
                    return;
                }

                // --- Discard Button ---
                const discardBtn = e.target.closest('.discard-image-btn');
                if (discardBtn) {
                    const fieldId = discardBtn.dataset.fieldId;
                    const fieldName = discardBtn.dataset.fieldName;

                    document.getElementById(`${fieldId}-preview-box`).classList.add('hidden');
                    document.getElementById(`${fieldId}-upload-box`).classList.remove('hidden');
                    document.getElementById(`${fieldId}-error`).textContent = '';

                    const fileInput = document.getElementById(`${fieldId}-file-input`);
                    if (fileInput) fileInput.value = '';

                    if (currentImageBlobs[fieldName]) {
                        delete currentImageBlobs[fieldName];
                    }
                    return;
                }
            });
        }
    }

    // --- The Logic for Handling the File ---
    function handleFileSelect(event) {
        if (!currentImageField) return;

        const file = event.target.files[0];
        
        if (!file) return;
        
        const fieldId = currentImageField.id;
        const errorSpan = document.getElementById(`${fieldId}-error`);
        errorSpan.textContent = '';

        if (file.size > 1024 * 1024) { // 1 MB
            errorSpan.textContent = 'Error: File is too large (Max 1MB).';
            return;
        }

        const reader = new FileReader();
        
        reader.onload = (e) => {
            if (cropperImage) {
                cropperImage.src = e.target.result;
                openCropper();
            } else {
                console.error('ERROR! cropperImage element not found!');
            }
        };
        
        reader.onerror = () => {
             console.error('ERROR! FileReader failed to read the file.');
             errorSpan.textContent = 'Error reading file. Please try again.';
        };
        
        reader.readAsDataURL(file);
    }
    
    function openCropper() {
        if (!currentImageField) return;

        const isSignature = currentImageField.type === 'signature';
        const aspect = isSignature ? (8 / 3) : (3 / 4);

        cropperModalTitle.textContent = isSignature ? 'Crop Your Signature' : 'Crop Your Photo';
        cropperModalText.textContent = isSignature 
            ? 'Please crop your signature to a horizontal (8:3) ratio.'
            : 'Please crop your photo to a passport-style (3:4) ratio.';
        
        cropperModal.classList.remove('hidden');
        
        if (cropper) {
            cropper.destroy();
        }
        
        cropper = new Cropper(cropperImage, {
            aspectRatio: aspect,
            viewMode: 2,
            autoCropArea: 1.0,
            background: false,
            responsive: true
        });
    }

    // --- Cropper Modal Buttons ---
    if (closeCropperButton) {
        closeCropperButton.addEventListener('click', () => {
            cropperModal.classList.add('hidden');
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
            if (currentImageField) {
                 const fileInput = document.getElementById(`${currentImageField.id}-file-input`);
                 if (fileInput) fileInput.value = '';
            }
        });
    }

    if (saveCropButton) {
        saveCropButton.addEventListener('click', () => {
            if (!cropper || !currentImageField) return;

            cropper.getCroppedCanvas().toBlob((blob) => {
                
                currentImageBlobs[currentImageField.name] = blob;
                
                const previewImg = document.getElementById(`${currentImageField.id}-preview-img`);
                previewImg.src = URL.createObjectURL(blob);
                
                document.getElementById(`${currentImageField.id}-preview-box`).classList.remove('hidden');
                document.getElementById(`${currentImageField.id}-upload-box`).classList.add('hidden');
                
                const fieldId = currentImageField.id;
                const widget = document.getElementById(`${fieldId}-widget`);
                if (widget) widget.classList.remove('border-red-500', 'border-2');

                cropperModal.classList.add('hidden');
                if (cropper) {
                    cropper.destroy();
                    cropper = null;
                }
                
            }, 'image/jpeg', 0.9);
        });
    }

    // --- Camera Modal Logic ---
    async function startCamera(fieldId, fieldName, dataType) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            document.getElementById(`${fieldId}-error`).textContent = 'Camera not supported on this device.';
            return;
        }

        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
            cameraVideo.srcObject = cameraStream;
            cameraModal.classList.remove('hidden');
            currentImageField = { id: fieldId, name: fieldName, type: dataType }; 
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
            openCropper(); 
        });
    }

    // =================================================================
    // START: M16 - PART 4 - The "Submit"
    // =================================================================
    
    function validateForm() {
        let isValid = true;
        let missingFields = [];
        submitErrorMessage.textContent = ''; 
        
        // (NEW) Simple regex for email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        formFields.forEach(field => {
            if (field.dataType === 'hidden' || field.dataType === 'header') return; 
            
            const safeFieldName = field.fieldName || `field-${Math.floor(Math.random() * 10000)}`;
            const fieldId = `field-${safeFieldName.replace(/[^a-zA-Z0-9-]/g, '-')}`;
            const containerId = `${fieldId}-container`;
            const container = document.getElementById(containerId);

            // 1. Reset all error borders
            if (container) container.classList.remove('border-red-500', 'border-2');
            if (field.dataType === 'image' || field.dataType === 'signature') {
                const widget = document.getElementById(`${fieldId}-widget`);
                if(widget) widget.classList.remove('border-red-500', 'border-2');
            }

            // 2. Check for empty values
            switch (field.dataType) {
                case 'string':
                case 'email':
                case 'numeric':
                case 'textarea':
                case 'dropdown':
                    const input = document.getElementById(fieldId);
                    if (!input || input.value.trim() === '') {
                        // --- This is the EMPTY check ---
                        isValid = false;
                        missingFields.push(field.fieldName);
                        if (container) container.classList.add('border-red-500', 'border-2');
                    
                    } else if (field.dataType === 'email' && !emailRegex.test(input.value.trim())) {
                        // --- (NEW) This is the EMAIL FORMAT check ---
                        isValid = false;
                        missingFields.push(field.fieldName + " (invalid format)");
                        if (container) container.classList.add('border-red-500', 'border-2');
                    }
                    break;
                
                case 'radio':
                    const checkedRadio = document.querySelector(`input[name="${fieldId}"]:checked`);
                    if (!checkedRadio) {
                        isValid = false;
                        missingFields.push(field.fieldName);
                        if (container) container.classList.add('border-red-500', 'border-2');
                    }
                    break;
                
                case 'checkbox':
                    // We will add 'isMandatory' logic later.
                    break;
                
                case 'image':
                case 'signature':
                    if (!currentImageBlobs[field.fieldName]) {
                        isValid = false;
                        missingFields.push(field.fieldName);
                        const widget = document.getElementById(`${fieldId}-widget`);
                        if(widget) widget.classList.add('border-red-500', 'border-2');
                    }
                    break;
            }
        });

        if (!isValid) {
            submitErrorMessage.textContent = `Please fill out all required fields. Missing: ${missingFields.join(', ')}`;
            submitErrorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        return isValid;
    }

    function collectDataForPreview() {
        collectedData = {}; // Clear previous data

        document.querySelectorAll('.field-input').forEach(input => {
            const fieldName = input.dataset.fieldName;
            collectedData[fieldName] = input.value || '';
        });
        
        document.querySelectorAll('.field-input-checkbox').forEach(input => {
            const fieldName = input.dataset.fieldName;
            collectedData[fieldName] = input.checked;
        });
        
        document.querySelectorAll('input[type="radio"]:checked').forEach(input => {
            const fieldName = input.dataset.fieldName;
            collectedData[fieldName] = input.value;
        });
    }

    function populatePreviewModal() {
        previewDataContainer.innerHTML = ''; // Clear old data

        formFields.forEach(field => {
            if (field.dataType === 'hidden' || field.dataType === 'header') return;

            const fieldName = field.fieldName;
            let valueHTML = '';

            if (field.dataType === 'image' || field.dataType === 'signature') {
                const blob = currentImageBlobs[fieldName];
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const aspectClass = field.dataType === 'signature' ? 'w-48 h-18' : 'w-32 h-40';
                    valueHTML = `<img src="${url}" class="${aspectClass} object-cover rounded-lg mt-1 border border-border-dark">`;
                } else {
                    valueHTML = '<p class.text-base text-gray-500 font-medium">No image uploaded</p>';
                }
            } else {
                let value = collectedData[fieldName];
                if (typeof value === 'boolean') {
                    value = value ? 'Yes' : 'No';
                }
                if (!value || value.trim() === '') {
                    value = '<span class="text-gray-500">N/A</span>';
                }
                valueHTML = `<p class="text-base text-white font-medium">${value}</p>`;
            }

            const row = document.createElement('div');
            row.innerHTML = `
                <p class="text-xs text-gray-400 uppercase tracking-wide">${fieldName}</p>
                ${valueHTML}
            `;
            previewDataContainer.appendChild(row);
        });
    }

    if (submitFormButton) {
        submitFormButton.addEventListener('click', () => {
            
            const isValid = validateForm();
            if (!isValid) {
                return;
            }
            
            collectDataForPreview();
            populatePreviewModal();
            previewModal.classList.remove('hidden');
        });
    }

    // (CHANGED - 77) Final Date Fix
    if (confirmSubmitButton) {
        confirmSubmitButton.addEventListener('click', async () => {
            
            console.log("DEBUG: 'Confirm & Submit' clicked.");
            
            // --- Show Overlay ---
            if (submissionOverlay) submissionOverlay.classList.remove('hidden');
            confirmSubmitButton.disabled = true;
            cancelPreviewButton.disabled = true;
            
            // --- Capture timestamp ---
            const submissionTimestamp = new Date();

            try {
                console.log("DEBUG: Inside 'try' block. Starting image upload...");
                
                const imageURLs = {};
                const uploadPromises = []; 

                for (const fieldName in currentImageBlobs) {
                    console.log(`DEBUG: Uploading image for: ${fieldName}`);
                    const blob = currentImageBlobs[fieldName];
                    
                    const fileName = `${currentFormId}_${validOtpDocId}_${fieldName.replace(/[^a-zA-Z0-9-]/g, '_')}.jpg`;
                    const filePath = `submissions/${currentFormId}/${fileName}`;
                    const fileRef = storage.ref(filePath);
                    
                    const uploadTask = fileRef.put(blob);
                    
                    uploadPromises.push(
                        uploadTask.then(async (snapshot) => {
                            const downloadURL = await snapshot.ref.getDownloadURL();
                            imageURLs[fieldName] = downloadURL; 
                            console.log(`DEBUG: SUCCESS uploading ${fieldName}. URL: ${downloadURL}`);
                        })
                    );
                }

                await Promise.all(uploadPromises);
                console.log("DEBUG: All image uploads complete.");

                const finalSubmission = {
                    ...collectedData,  // Use the data we already collected
                    ...imageURLs, 
                    formId: currentFormId,
                    otp: validOtpCode,
                    otpId: validOtpDocId,
                    submissionDate: submissionTimestamp, // Use our client-side timestamp
                    status: 'Submitted' 
                };
                
                console.log("DEBUG: Saving data to 'submissions' collection...");
                await db.collection('submissions').add(finalSubmission);
                console.log("DEBUG: Data saved successfully.");
                
                console.log("DEBUG: Updating OTP as 'isUsed: true'...");
                await db.collection('otps').doc(validOtpDocId).update({
                    isUsed: true
                });
                console.log("DEBUG: OTP updated successfully.");
                
                // --- Get the preview data *before* hiding the modal
                const previewHTML = previewDataContainer.innerHTML;
                
                // Hide the modal & overlay
                previewModal.classList.add('hidden');
                if (submissionOverlay) submissionOverlay.classList.add('hidden');
                
                const formNameStr = formTitle.textContent;

                // --- (NEW) Step 76: Hide the main page header text ---
                if (formTitle) formTitle.textContent = 'Submission Complete';
                if (formOrgName) formOrgName.classList.add('hidden');
                // --- End of Step 76 fix ---

                // --- (NEW) Step 77: Format date string for the on-screen receipt ---
                const dateString = submissionTimestamp.toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });

                // --- (CHANGED) Updated receiptHTML ---
                const receiptHTML = `
                    <div class="flex flex-col items-center justify-center gap-4 p-4">
                        <div id="receipt-content-for-pdf" 
                             class="w-full max-w-xl p-6 bg-surface-dark rounded-lg border border-border-dark">
                            
                            <div class="flex flex-col items-center text-center border-b border-border-dark pb-4">
                                <span class="material-symbols-outlined text-6xl text-green-400">task_alt</span>
                                <h2 class="text-2xl font-semibold text-white mt-2">Submission Successful!</h2>
                                <p class="text-gray-300 text-center">Your receipt for: ${formNameStr}</p>
                            </div>
                            
                            <div class="py-4 flex flex-col gap-3">
                                
                                <div class="flex justify-between">
                                    <span class="text-sm text-gray-400">Your Code</span>
                                    <span class="text-sm text-white font-medium">${validOtpCode}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-sm text-gray-400">Status</span>
                                    <span class="text-sm text-green-400 font-medium">Submitted</span>
                                </div>
                                <!-- (NEW) Step 77: Added Date/Time row -->
                                <div class="flex justify-between">
                                    <span class="text-sm text-gray-400">Submission Date</span>
                                    <span class="text-sm text-white font-medium">${dateString}</span>
                                </div>
                            </div>

                            <!-- This is the submitted data -->
                            <div class="border-t border-border-dark pt-4 mt-4">
                                <h3 class="text-lg font-semibold text-white mb-4">Your Submitted Data</h3>
                                <div class="flex flex-col gap-4">
                                    ${previewHTML}
                                </div>
                            </div>
                            
                            <p class="text-xs text-gray-500 text-center pt-4 border-t border-border-dark mt-4">
                                You may now close this window or download a copy of your receipt.
                            </p>
                        </div>
                        
                        <button id="download-pdf-button" class="flex h-12 min-w-[84px] w-full max-w-xl mt-6 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-primary px-5 text-base font-bold leading-normal tracking-[0.015em] text-background-dark transition-colors hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-surface-dark">
                            <span class="material-symbols-outlined">download</span>
                            <span class="truncate ml-2">Download PDF Receipt</span>
                        </button>
                    </div>
                `;
                
                formContentContainer.innerHTML = receiptHTML;
                console.log("DEBUG: Success! Showing receipt screen.");

                // Add the listener for the new button, passing the timestamp
                document.getElementById('download-pdf-button').addEventListener('click', () => {
                    const fileName = `${formNameStr.replace(/ /g, '_')}_Receipt_${validOtpCode}.pdf`;
                    generatePDF(fileName, submissionTimestamp); // Pass timestamp
                });

            } catch (err) {
                console.error("--- DEBUG: SUBMIT FAILED! ---");
                console.error(err);
                
                // We can show the error on the main page
                previewModal.classList.add('hidden');
                submitErrorMessage.textContent = 'An error occurred during submission. Please check the console and try again.';

                // --- Hide overlay on error ---
                if (submissionOverlay) submissionOverlay.classList.add('hidden');
                confirmSubmitButton.disabled = false;
                cancelPreviewButton.disabled = false;
            }
        });
    }

    if (closePreviewButton) {
        closePreviewButton.addEventListener('click', () => {
            previewModal.classList.add('hidden');
        });
    }
    if (cancelPreviewButton) {
        cancelPreviewButton.addEventListener('click', () => {
            previewModal.classList.add('hidden');
        });
    }
    
    // =================================================================
    // START: M16 - PART 5 - PDF Generation
    // =================================================================

    // (CHANGED) Function now accepts submissionTimestamp
    async function generatePDF(fileName = 'receipt.pdf', submissionTimestamp = null) {
        const button = document.getElementById('download-pdf-button');
        if (button) {
            button.disabled = true;
            button.querySelector('.truncate').textContent = 'Generating PDF...';
        }

        // Get the PDF "tools" from the window
        const { jsPDF } = window.jspdf;
        
        // This is the *real* content we want to print
        const contentToPrint = document.getElementById('receipt-content-for-pdf');
        
        // (CHANGED) We no longer need to format the date here,
        // because it's already in the 'contentToPrint' we are cloning.
        
        // We MUST clone it to avoid issues.
        const pdfWrapper = contentToPrint.cloneNode(true);
        
        // --- We still need to apply the layout fix to the cloned PDF wrapper ---
        const headerContainer = pdfWrapper.querySelector('.py-4');
        if (headerContainer) {
            
            // 1. Fix OTP Layout
            const otpRow = headerContainer.children[0]; // The "Your Code" row
            if(otpRow) {
                otpRow.children[1].classList.add('break-all', 'max-w-[50%]', 'text-right');
            }
            
            // 2. (BUG FIX) We no longer add the timestamp row here.
            // It is already part of the 'contentToPrint' clone.
        }

        // We must add this wrapper to the *body* to be rendered, but make it invisible
        pdfWrapper.style.width = "800px"; // Set a fixed width for good PDF layout
        pdfWrapper.style.position = "absolute";
        pdfWrapper.style.left = "-9999px";
        pdfWrapper.style.padding = "20px"; // Add padding for canvas spacing
        pdfWrapper.classList.add("bg-surface-dark"); // Ensure it has our dark BG
        document.body.appendChild(pdfWrapper);

        try {
            const canvas = await html2canvas(pdfWrapper, {
                scale: 2, // Improve quality
                useCORS: true, // (CRITICAL) for loading the blob: images
                backgroundColor: '#2C2C2C' // Match our 'bg-surface-dark'
            });
            
            const imgData = canvas.toDataURL('image/png');
            
            // Set PDF dimensions based on the canvas
            const pdfWidth = 800; // Our fixed width
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'px',
                format: [pdfWidth, pdfHeight]
            });

            doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            doc.save(fileName);

        } catch (err) {
            console.error('Error generating PDF:', err);
            alert('An error occurred while generating the PDF. Please try again.');
        } finally {
            // Clean up
            document.body.removeChild(pdfWrapper);
            
            if (button) {
                button.disabled = false;
                button.querySelector('.truncate').textContent = 'Download PDF Receipt';
            }
        }
    }
    
    // --- This starts the entire page ---
    initializeForm();

});