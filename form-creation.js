// This special line waits for all the HTML on the page to be fully loaded
// before our JavaScript code tries to run. This prevents errors.
document.addEventListener("DOMContentLoaded", () => {
    
    // --- STEP 1: FIND ALL OUR HTML ELEMENTS ---
    // We "grab" all the buttons and inputs we need by their unique IDs
    
    // The Email Toggle
    const emailToggle = document.getElementById("email-toggle");
    const emailToggleKnob = document.getElementById("email-toggle-knob");

    // The Payment Toggle
    const paymentToggle = document.getElementById("payment-toggle");
    const paymentToggleKnob = document.getElementById("payment-toggle-knob");
    
    // The Payment Amount Box (which is hidden)
    const presetAmountContainer = document.getElementById("preset-amount-container");

    
    // --- STEP 2: ADD A "CLICK" LISTENER FOR THE EMAIL TOGGLE ---
    emailToggle.addEventListener("click", () => {
        // This is a "vibe coding" way to check if the toggle is currently "on" or "off"
        // We read its 'aria-checked' attribute, which is just a "true" or "false" text
        const isChecked = emailToggle.getAttribute("aria-checked") === "true";
        
        // Now, we flip the value!
        // If it was "true", make it "false". If it was "false", make it "true".
        emailToggle.setAttribute("aria-checked", !isChecked);
        
        // Now we move the little white circle
        emailToggleKnob.classList.toggle("translate-x-5"); // Moves it right
        emailToggleKnob.classList.toggle("translate-x-0"); // Moves it left
        
        // And we change the background color
        emailToggle.classList.toggle("bg-gray-600"); // The "off" color
        emailToggle.classList.toggle("bg-primary"); // The "on" (yellow) color
    });


    // --- STEP 3: ADD A "CLICK" LISTENER FOR THE PAYMENT TOGGLE ---
    paymentToggle.addEventListener("click", () => {
        // We do the same thing: check its current state
        const isChecked = paymentToggle.getAttribute("aria-checked") === "true";
        
        // Flip the value
        paymentToggle.setAttribute("aria-checked", !isChecked);

        // Move the little white circle
        paymentToggleKnob.classList.toggle("translate-x-5");
        paymentToggleKnob.classList.toggle("translate-x-0");
        
        // Change the background color
        paymentToggle.classList.toggle("bg-gray-600");
        paymentToggle.classList.toggle("bg-primary");

        // --- THIS IS THE *NEW* LOGIC ---
        // After we flip the toggle, we check the *new* state
        const isNowChecked = !isChecked; // This is the new state
        
        if (isNowChecked) {
            // If the toggle is now ON (Prepaid), we SHOW the amount box
            presetAmountContainer.classList.remove("hidden");
        } else {
            // If the toggle is now OFF (Postpaid), we HIDE the amount box
            presetAmountContainer.classList.add("hidden");
        }
    });

});