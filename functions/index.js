/**
 * M17 - SECURE "CASCADING" DELETE (The "Brain")
 *
 * (STEP 79 FIX) The "deleteCollectionByQuery" helper function
 * has been replaced with a new, stable, loop-based version
 * that correctly handles deleting collections larger than 500
 * documents (which was the bug).
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
 * Helper Function: deleteCollectionByQuery (THE FIX)
 * =================================================================
 * This is the new, "Simple & Stable" helper.
 * It fetches documents in batches of 500 and deletes them in a
 * loop until the query returns no more documents. This correctly
 * handles collections of any size.
 */
async function deleteCollectionByQuery(query) {
  const batchSize = 500;
  let snapshot;

  while (true) {
    // Get a new batch of documents
    const batchQuery = query.limit(batchSize);
    snapshot = await batchQuery.get();

    // If there are no more documents, we are done
    if (snapshot.size === 0) {
      break;
    }

    // Create a new "batch" to delete the documents
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Commit the batch
    await batch.commit();

    // Loop will continue and get the next batch (if any)
  }
}

/**
 * =================================================================
 * THE MAIN FUNCTION: onFormDelete (This is our "Brain")
 * =================================================================
 * This is an "HTTPS Callable Function." It means our admin app
 * can "call" it securely.
 */
exports.onFormDelete = functions.https.onCall(async (data, context) => {
  // --- 1. Security Check ---
  // "context.auth" only exists if a user is logged in.
  // This is our first and most important security rule!
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
    const storagePrefix = `submissions/${formId}/`; // This is the folder in Storage

    // B) Run all delete queries
    // We use Promise.all to run them all at the same time for speed.

    console.log(`Step 1/4: Deleting form document...`);
    const deleteFormPromise = formDocRef.delete();

    console.log(`Step 2/4: Deleting all submissions...`);
    const deleteSubmissionsPromise = deleteCollectionByQuery(submissionsQuery);

    console.log(`Step 3/4: Deleting all OTPs...`);
    const deleteOtpsPromise = deleteCollectionByQuery(otpsQuery);

    console.log(`Step 4/4: Deleting all files in Storage at '${storagePrefix}'...`);
    const deleteStoragePromise = storage.deleteFiles({
      prefix: storagePrefix,
    });

    // C) Wait for everything to finish
    await Promise.all([
      deleteFormPromise,
      deleteSubmissionsPromise,
      deleteOtpsPromise,
      deleteStoragePromise,
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