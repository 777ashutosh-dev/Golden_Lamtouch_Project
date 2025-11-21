/**
 * M28 v1 - (SYSTEM LOGS: THE RECORDER)
 * * Updates:
 * 1. LOGGING: Added 'logSystemEvent' helper function.
 * 2. INSTRUMENTATION: Hooked logging into all 6 critical functions.
 * 3. OBSERVABILITY: Tracks Actor (User/System), Event Type, and Details.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const path = require("path");
const os = require("os");
const fs = require("fs");

// --- GLOBAL REGION SETTING (INDIA) ---
setGlobalOptions({ region: "asia-south1" });

const BUCKET_NAME = "golden-lamtouch-project.firebasestorage.app";
admin.initializeApp({
  storageBucket: BUCKET_NAME
});

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage().bucket(BUCKET_NAME);

/**
 * --- HELPER: THE BLACK BOX RECORDER ---
 * Writes an immutable log entry to Firestore.
 */
async function logSystemEvent(actor, type, event, description, details = {}) {
    try {
        await db.collection("system_logs").add({
            actor: actor || "System", // e.g., "admin@gmail.com" or "System"
            type: type,               // "SECURITY", "DATA", "DESTRUCTION", "TRAFFIC"
            event: event,             // Short title e.g., "Form Deleted"
            description: description, // Human readable string
            details: details,         // JSON object with IDs, ranges, etc.
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`[LOG] ${type}: ${event} - ${description}`);
    } catch (error) {
        console.error("FAILED TO LOG EVENT:", error);
        // We do not throw here to prevent blocking the main action
    }
}

/**
 * 1. Serial Number Generator (Now with Logging)
 */
exports.onSubmissionCreate = onDocumentCreated(
  {
    document: "submissions/{submissionId}",
    region: "asia-south1" 
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return; 

    const submissionData = snap.data();
    const formId = submissionData.formId;

    if (!formId) return null;

    try {
      const configRef = db.collection("config").doc("global");
      const counterRef = db.collection("forms").doc(formId).collection("private").doc("counter");

      // --- TRANSACTION BLOCK ---
      const finalSerial = await db.runTransaction(async (t) => {
          const configDoc = await t.get(configRef);
          const prefix = configDoc.exists ? (configDoc.data().serialPrefix || "25") : "25";
          
          const counterDoc = await t.get(counterRef);
          const lastNumber = counterDoc.exists ? (counterDoc.data().lastNumber || 0) : 0;
          
          const newNumber = lastNumber + 1;
          const paddedNumber = String(newNumber).padStart(4, "0");
          
          t.set(counterRef, { lastNumber: newNumber }, { merge: true });
          
          return `${prefix}${paddedNumber}`;
      });

      // Update submission
      await snap.ref.update({ serialNumber: finalSerial, status: "Submitted" });
      
      // --- LOG TRAFFIC ---
      await logSystemEvent(
          "System", 
          "TRAFFIC", 
          "Submission Received", 
          `New submission ${finalSerial} for Form ID: ${formId}`,
          { formId, serialNumber: finalSerial, otp: submissionData.otp || "N/A" }
      );

      return null;

    } catch (error) {
      console.error("Serial Error:", error);
      return snap.ref.update({ status: "Error: No Serial" });
    }
  }
);

/**
 * 2. Cascading Delete (Now with Logging)
 */
async function deleteCollectionByQuery(query) {
  const batchSize = 500;
  let snapshot;
  while (true) {
    snapshot = await query.limit(batchSize).get();
    if (snapshot.size === 0) break;
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

exports.onFormDelete = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Admin only.");
  }
  
  const formId = request.data.formId;
  const actorEmail = request.auth.token.email || "Unknown Admin";
  
  // 1. Fetch Name BEFORE Deleting (For the Logs)
  const formDocRef = db.collection("forms").doc(formId);
  const formSnap = await formDocRef.get();
  const formName = formSnap.exists ? formSnap.data().formName : "Unknown Form";

  const submissionsQuery = db.collection("submissions").where("formId", "==", formId);
  const otpsQuery = db.collection("otps").where("formId", "==", formId);
  const storagePrefix = `submissions/${formId}/`;
  const privateCounterQuery = db.collection("forms").doc(formId).collection("private");

  // 2. Perform Destruction
  await Promise.all([
    formDocRef.delete(),
    deleteCollectionByQuery(submissionsQuery),
    deleteCollectionByQuery(otpsQuery),
    storage.deleteFiles({ prefix: storagePrefix }),
    deleteCollectionByQuery(privateCounterQuery),
  ]);

  // --- LOG DESTRUCTION ---
  await logSystemEvent(
      actorEmail,
      "DESTRUCTION",
      "Form Deleted",
      `Deleted form "${formName}" and all associated data.`,
      { formId, formName }
  );

  return { success: true };
});

function escapeCsvCell(cell) {
  if (cell === null || cell === undefined) return '""';
  let str = String(cell).replace(/"/g, '""');
  if (str.search(/("|,|\n)/g) >= 0) str = '"' + str + '"';
  return str;
}

/**
 * 3. Create Full Report .zip (Now with Logging)
 */
exports.createFullReportZip = onCall(
  { 
    timeoutSeconds: 540, 
    memory: "1GiB",
    cors: true 
  }, 
  async (request) => {
    if (!request.auth) {
       throw new HttpsError("unauthenticated", "Admin only.");
    }
    
    const archiver = require("archiver");
    const { v4: uuidv4 } = require("uuid");

    const formId = request.data.formId;
    const startSerial = request.data.startSerial;
    const endSerial = request.data.endSerial;
    const actorEmail = request.auth.token.email || "Unknown Admin";

    const formDoc = await db.collection("forms").doc(formId).get();
    if (!formDoc.exists) throw new HttpsError("not-found", "Form not found.");
    
    const form = formDoc.data();
    const formName = (form.formName || "form").replace(/[^a-zA-Z0-9]/g, "_");
    
    // --- BUILD QUERY ---
    let query = db.collection("submissions")
      .where("formId", "==", formId)
      .orderBy("serialNumber", "asc");

    if (startSerial) query = query.where("serialNumber", ">=", startSerial);
    if (endSerial) query = query.where("serialNumber", "<=", endSerial);

    const submissionsSnap = await query.get();

    if (submissionsSnap.empty) return { success: false, message: "No data found for this range." };

    const allSubmissions = submissionsSnap.docs.map((d) => d.data());
    
    // --- CSV GENERATION ---
    const formFields = form.fields.filter(f => f.dataType !== "hidden" && f.dataType !== "header");
    const imageFields = formFields.filter(f => f.dataType === "image" || f.dataType === "signature").map(f => f.fieldName);
    
    let headers = ["serialNumber"];
    headers = headers.concat(formFields.map(f => f.fieldName));
    headers.push("submissionDate");
    headers.push("otp");
    if (form.isPrepaid) headers.push("paymentStatus");
    
    const csvRows = [headers.map(escapeCsvCell).join(",")];
    let imageCount = 0;

    for (const sub of allSubmissions) {
      const row = [];
      for (const h of headers) {
        let val = sub[h];
        if (imageFields.includes(h)) {
            val = sub["serialNumber"] || ""; 
            if (sub[h]) imageCount++;
        }
        if (h === "submissionDate" && val && val.toDate) {
            val = val.toDate().toLocaleString("en-IN");
        }
        if (h === "paymentStatus") val = "Paid";
        row.push(escapeCsvCell(val));
      }
      csvRows.push(row.join(","));
    }

    // --- ZIP GENERATION ---
    const tempZipName = `${formName}_${uuidv4()}.zip`;
    const tempZipPath = path.join(os.tmpdir(), tempZipName);
    const output = fs.createWriteStream(tempZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    const zipPromise = new Promise((resolve, reject) => {
        output.on("close", resolve);
        archive.on("error", reject);
    });

    archive.pipe(output);
    archive.append(csvRows.join("\n"), { name: "report.csv" });

    if (imageCount > 0) {
      for (const sub of allSubmissions) {
        const serial = sub.serialNumber || sub.otp;
        if (!serial) continue;
        
        for (const field of imageFields) {
          const url = sub[field];
          if (!url) continue;
          try {
             const urlObj = new URL(url);
             const parts = urlObj.pathname.split("/o/");
             if (parts.length >= 2) {
                 const path = decodeURIComponent(parts[1]);
                 const file = storage.file(path);
                 const folderName = field.replace(/[^a-zA-Z0-9]/g, "_");
                 const zipPath = `${folderName}/${serial}.jpg`;
                 archive.append(file.createReadStream(), { name: zipPath });
             }
          } catch (e) { console.warn("Skipping image", e); }
        }
      }
    }

    await archive.finalize();
    await zipPromise;

    const dest = `temp_zips/${tempZipName}`;
    await storage.upload(tempZipPath, { destination: dest, contentType: "application/zip" });
    fs.unlinkSync(tempZipPath);
    
    const file = storage.file(dest);
    const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 15 * 60 * 1000 });
    
    // --- LOG DATA ACCESS ---
    await logSystemEvent(
        actorEmail,
        "DATA",
        "Report Downloaded",
        `Downloaded full report for "${form.formName}". Range: ${startSerial || "Start"} to ${endSerial || "End"}.`,
        { formId, startSerial, endSerial, recordCount: allSubmissions.length }
    );

    return { success: true, downloadUrl: url, fileName: `${formName}_Report.zip` };
  }
);

/**
 * 4. Create Coordinator Account (Now with Logging)
 */
exports.createCoordinatorAccount = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Admin only.");
    }
    
    const { email, password, name, org, phone, accessList } = request.data;
    const actorEmail = request.auth.token.email || "Unknown Admin";

    try {
        const userRecord = await auth.createUser({
            email: email,
            password: password,
            displayName: name || "Coordinator"
        });

        await db.collection("coordinators").add({
            uid: userRecord.uid,
            email: email,
            name: name || "",
            org: org || "",
            phone: phone || "",
            accessList: accessList || [],
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        await auth.setCustomUserClaims(userRecord.uid, { role: 'coordinator' });

        // --- LOG SECURITY EVENT ---
        await logSystemEvent(
            actorEmail,
            "SECURITY",
            "Coordinator Created",
            `Created new coordinator account: ${email} (${name}).`,
            { newCoordinatorEmail: email, accessListCount: (accessList || []).length }
        );

        return { success: true, uid: userRecord.uid };

    } catch (error) {
        console.error("Error creating coordinator:", error);
        throw new HttpsError("internal", error.message);
    }
});

/**
 * 5. Update Coordinator Account (Now with Logging)
 */
exports.updateCoordinatorAccount = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Admin only.");
    }
    
    const { docId, email, password, name, org, phone, accessList } = request.data;
    const actorEmail = request.auth.token.email || "Unknown Admin";
    
    try {
        const coordDoc = await db.collection("coordinators").doc(docId).get();
        if (!coordDoc.exists) throw new HttpsError("not-found", "Coordinator profile not found.");
        const uid = coordDoc.data().uid;
        const oldEmail = coordDoc.data().email;

        const authUpdates = {};
        if (email) authUpdates.email = email;
        if (password && password.length >= 6) authUpdates.password = password;
        if (name) authUpdates.displayName = name;
        
        if (Object.keys(authUpdates).length > 0) {
            await auth.updateUser(uid, authUpdates);
        }

        const firestoreUpdates = { email, name, org, phone, accessList };
        Object.keys(firestoreUpdates).forEach(key => firestoreUpdates[key] === undefined && delete firestoreUpdates[key]);

        await db.collection("coordinators").doc(docId).update(firestoreUpdates);

        // --- LOG SECURITY EVENT ---
        await logSystemEvent(
            actorEmail,
            "SECURITY",
            "Coordinator Updated",
            `Updated profile for ${oldEmail}.`,
            { docId, updatedFields: Object.keys(firestoreUpdates) }
        );

        return { success: true };

    } catch (error) {
        console.error("Error updating coordinator:", error);
        throw new HttpsError("internal", error.message);
    }
});

/**
 * 6. Delete Coordinator Auth (Now with Logging)
 */
exports.deleteCoordinatorAuth = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Admin only.");
    }
    
    const { uid } = request.data;
    const actorEmail = request.auth.token.email || "Unknown Admin";

    try {
        await auth.deleteUser(uid);
        
        // --- LOG SECURITY EVENT ---
        await logSystemEvent(
            actorEmail,
            "SECURITY",
            "Coordinator Deleted",
            `Deleted coordinator auth account (UID: ${uid}).`,
            { uid }
        );

        return { success: true };
    } catch (error) {
         console.warn("Error deleting auth user:", error);
         return { success: false };
    }
});