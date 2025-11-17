/**
 * M20 - (STEP 101) "Serial Number" Generation "Brain"
 *
 * This file now contains TWO "Brains":
 * 1. (NEW) onSubmissionCreate: A Firestore Trigger that
 * watches for new submissions. It reads the "serialPrefix"
 * (e.g., "25") from 'config/global' and safely generates
 * a unique serial number (e.g., "250001") using a
 * secure Transaction.
 *
 * 2. (M17) onFormDelete: Our "Cascading Delete" function
 * that securely deletes all related data for a form.
 */

// Import the necessary Firebase modules
const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize the Firebase Admin SDK
admin.initializeApp();

// Get our "tools"
const db = admin.firestore();
const storage = admin.storage().bucket();

/**
 * =================================================================
 * (NEW) "BRAIN" 1: Serial Number Generator
 * =================================================================
 * This function triggers *after* a new submission is created.
 * It uses a Transaction to safely increment a counter
 * and add a unique serial number to the submission.
 */
exports.onSubmissionCreate = functions.firestore
  .document("submissions/{submissionId}")
  .onCreate(async (snap, context) => {
    // 1. Get the new submission data
    const submissionData = snap.data();
    const formId = submissionData.formId;

    if (!formId) {
      console.error("Submission is missing a 'formId'. Cannot generate serial.");
      return null;
    }

    try {
      // 2. Define our "targets"
      const configRef = db.collection("config").doc("global");
      // This is the private counter document *inside* the form
      const counterRef = db.collection("forms").doc(formId).collection("private").doc("counter");

      // 3. Run the secure "Transaction"
      // This is the "Simple & Stable" way to prevent race conditions.
      const newSerialNumber = await db.runTransaction(async (t) => {
        
        // --- Get the Global Prefix (e.g., "25") ---
        const configDoc = await t.get(configRef);
        let prefix = "";
        if (configDoc.exists) {
          // This reads the "25" you saved on the Settings page
          prefix = configDoc.data().serialPrefix || "";
        }

        // --- Get the Current Counter Number (e.g., 0) ---
        const counterDoc = await t.get(counterRef);
        let lastNumber = 0;
        if (counterDoc.exists) {
          lastNumber = counterDoc.data().lastNumber || 0;
        }

        // --- This is the "Logic" ---
        const newNumber = lastNumber + 1;
        
        // This creates "0001", "0002", etc.
        const paddedNumber = String(newNumber).padStart(4, "0");
        
        // This is your requested architecture (e.g., "250001")
        const serialNumber = `${prefix}${paddedNumber}`;

        // --- Save the new number back to the counter ---
        // We use .set() with {merge: true} to create the
        // document if it doesn't exist, or update it if it does.
        t.set(counterRef, { lastNumber: newNumber }, { merge: true });

        // Return our new serial number
        return serialNumber;
      });

      // 4. Update the original submission document
      // We are now *outside* the transaction
      console.log(`Success! Assigning Serial: ${newSerialNumber} to Submission: ${snap.id}`);
      return snap.ref.update({
        serialNumber: newSerialNumber,
      });

    } catch (error) {
      console.error(
        `FATAL ERROR: Failed to generate serial for submission ${snap.id}:`,
        error
      );
      // We can add an "error" status to the submission
      // so the admin knows it failed.
      return snap.ref.update({
        status: "Error: No Serial",
      });
    }
  });


/**
 * =================================================================
 * (M17) "BRAIN" 2: Secure "Cascading" Delete
 * =================================================================
 * This is an "HTTPS Callable Function." It means our admin app
 * can "call" it securely.
 */
async function deleteCollectionByQuery(query) {
  const batchSize = 500;
  let snapshot;

  while (true) {
    const batchQuery = query.limit(batchSize);
    snapshot = await batchQuery.get();
    if (snapshot.size === 0) {
      break;
    }
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  }
}

exports.onFormDelete = functions.https.onCall(async (data, context) => {
  // --- 1. Security Check ---
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be a logged-in admin to perform this action."
    );
  }

  // --- 2. Get the formId ---
  const formId = data.formId;
  if (!formId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with a 'formId'."
    );
  }

  console.log(
    `DELETION REQUEST: User '${context.auth.uid}' initiated delete for formId '${formId}'`
  );

  try {
    // --- 3. The "Deep Clean" Logic ---

    // A) Define our "targets"
    const formDocRef = db.collection("forms").doc(formId);
    const submissionsQuery = db.collection("submissions").where("formId", "==", formId);
    const otpsQuery = db.collection("otps").where("formId", "==", formId);
    const storagePrefix = `submissions/${formId}/`;
    
    // We also need to delete the "private" sub-collection
    const privateCounterQuery = db.collection("forms").doc(formId).collection("private");

    // B) Run all delete queries
    console.log(`Step 1/5: Deleting form document...`);
    const deleteFormPromise = formDocRef.delete();

    console.log(`Step 2/5: Deleting all submissions...`);
    const deleteSubmissionsPromise = deleteCollectionByQuery(submissionsQuery);

    console.log(`Step 3/5: Deleting all OTPs...`);
    const deleteOtpsPromise = deleteCollectionByQuery(otpsQuery);

    console.log(`Step 4/5: Deleting all files in Storage at '${storagePrefix}'...`);
    const deleteStoragePromise = storage.deleteFiles({
      prefix: storagePrefix,
    });
    
    console.log(`Step 5/5: Deleting private counter...`);
    const deleteCounterPromise = deleteCollectionByQuery(privateCounterQuery);

    // C) Wait for everything to finish
    await Promise.all([
      deleteFormPromise,
      deleteSubmissionsPromise,
      deleteOtpsPromise,
      deleteStoragePromise,
      deleteCounterPromise, // Added the new promise
    ]);

    // D) Send a "Success" message back to the app
    console.log(
      `SUCCESS: All data for formId '${formId}' has been deleted.`
    );
    return {
      success: true,
      message: `Form '${formId}' and all related data have been successfully deleted.`,
    };
  } catch (error) {
    // E) Send an "Error" message back to the app
    console.error("ERROR during cascading delete:", error);
    throw new functions.https.HttpsError(
      "internal",
      "An error occurred while deleting the form."
    );
  }
});