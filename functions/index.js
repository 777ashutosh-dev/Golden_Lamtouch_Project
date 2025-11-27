/**
 * M28 v5 - (SECURE CORE & OTP VALIDATION)
 * * Updates:
 * 1. IDENTITY FIX: synchronized Admin email to 'goldenlamtouch@gmail.com'.
 * 2. SECURITY: 'requireAdmin' now strictly checks this email or the 'admin' claim.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const path = require("path");
const os = require("os");
const fs = require("fs");
const archiver = require("archiver");
const { v4: uuidv4 } = require("uuid");

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
 * --- HELPER: SECURITY GATEKEEPER ---
 * Throws error if user is not an Admin.
 */
function requireAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in.");
  }
  // Check for Custom Claim 'role' or specific email whitelist
  const token = request.auth.token;
  
  // *** IDENTITY SYNCHRONIZATION ***
  // We strictly allow the Master Email here.
  if (token.role !== 'admin' && token.email !== 'goldenlamtouch@gmail.com') { 
     console.warn(`Non-admin access attempt by: ${token.email}`);
     throw new HttpsError("permission-denied", "Access denied: Admins only.");
  }
}

/**
 * --- HELPER: THE BLACK BOX RECORDER ---
 */
async function logSystemEvent(actor, type, event, description, details = {}) {
  try {
    await db.collection("system_logs").add({
      actor: actor || "System",
      type: type,
      event: event,
      description: description,
      details: details,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("FAILED TO LOG EVENT:", error);
  }
}

/**
 * 1. Serial Number Generator + OTP INTEGRITY CHECK
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
    const otpUsed = submissionData.otp;
    const otpId = submissionData.otpId;

    // --- SECURITY CHECK: Validate OTP Usage ---
    // If someone bypassed the frontend and injected data, we catch them here.
    if (otpId) {
      const otpRef = db.collection('otps').doc(otpId);
      const otpDoc = await otpRef.get();
      
      // If OTP doesn't exist OR Code mismatch
      if (!otpDoc.exists || otpDoc.data().code !== otpUsed) {
         await logSystemEvent("System", "SECURITY", "Fraud Attempt", `Deleted submission with fake OTP: ${otpUsed}`, { submissionId: event.params.submissionId });
         return snap.ref.delete(); // DELETE FRAUDULENT SUBMISSION
      }
      
      // Mark as used if not already (Server-side enforcement)
      if (otpDoc.data().isUsed === false) {
        await otpRef.update({ isUsed: true, usedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }

    if (!formId) return null;

    try {
      const configRef = db.collection("config").doc("global");
      const counterRef = db.collection("forms").doc(formId).collection("private").doc("counter");

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

      await snap.ref.update({ serialNumber: finalSerial, status: "Submitted" });

      await logSystemEvent(
        "System",
        "TRAFFIC",
        "Submission Received",
        `New submission ${finalSerial} for Form ID: ${formId}`,
        { formId, serialNumber: finalSerial }
      );

    } catch (error) {
      console.error("Serial Error:", error);
      return snap.ref.update({ status: "Error: No Serial" });
    }
  }
);

/**
 * 2. Cascading Delete (SECURED)
 */
exports.onFormDelete = onCall({ cors: true }, async (request) => {
  requireAdmin(request); // LOCK

  const formId = request.data.formId;
  const actorEmail = request.auth.token.email;

  const formDocRef = db.collection("forms").doc(formId);
  const formSnap = await formDocRef.get();
  const formName = formSnap.exists ? formSnap.data().formName : "Unknown Form";

  // Function to delete in batches
  async function deleteQueryBatch(query, resolve) {
    const snapshot = await query.get();
    const batchSize = snapshot.size;
    if (batchSize === 0) {
      resolve();
      return;
    }
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    process.nextTick(() => {
      deleteQueryBatch(query, resolve);
    });
  }

  const submissionsQuery = db.collection("submissions").where("formId", "==", formId).limit(500);
  const otpsQuery = db.collection("otps").where("formId", "==", formId).limit(500);
  const storagePrefix = `submissions/${formId}/`;

  await formDocRef.delete();
  await new Promise((resolve) => deleteQueryBatch(submissionsQuery, resolve));
  await new Promise((resolve) => deleteQueryBatch(otpsQuery, resolve));
  
  try {
    await storage.deleteFiles({ prefix: storagePrefix });
  } catch(e) { console.log("Storage Empty or Error", e); }

  await logSystemEvent(
    actorEmail,
    "DESTRUCTION",
    "Form Deleted",
    `Deleted form "${formName}".`,
    { formId }
  );

  return { success: true };
});

/**
 * 3. Create Full Report .zip (SECURED)
 */
exports.createFullReportZip = onCall(
  { timeoutSeconds: 540, memory: "1GiB", cors: true },
  async (request) => {
    requireAdmin(request); // LOCK

    const { formId, startSerial, endSerial } = request.data;
    const actorEmail = request.auth.token.email;

    const formDoc = await db.collection("forms").doc(formId).get();
    if (!formDoc.exists) throw new HttpsError("not-found", "Form not found.");

    const form = formDoc.data();
    const formName = (form.formName || "form").replace(/[^a-zA-Z0-9]/g, "_");

    let query = db.collection("submissions")
      .where("formId", "==", formId)
      .orderBy("serialNumber", "asc");

    if (startSerial) query = query.where("serialNumber", ">=", startSerial);
    if (endSerial) query = query.where("serialNumber", "<=", endSerial);

    const submissionsSnap = await query.get();
    if (submissionsSnap.empty) return { success: false, message: "No data found." };

    const allSubmissions = submissionsSnap.docs.map((d) => d.data());

    // CSV Logic
    function escapeCsvCell(cell) {
        if (cell === null || cell === undefined) return '""';
        let str = String(cell).replace(/"/g, '""');
        if (str.search(/("|,|\n)/g) >= 0) str = '"' + str + '"';
        return str;
    }

    const formFields = form.fields.filter(f => f.dataType !== "hidden" && f.dataType !== "header");
    const imageFields = formFields.filter(f => f.dataType === "image" || f.dataType === "signature").map(f => f.fieldName);

    let headers = ["serialNumber", ...formFields.map(f => f.fieldName), "submissionDate", "otp"];
    if (form.isPrepaid) headers.push("paymentStatus");

    const csvRows = [headers.map(escapeCsvCell).join(",")];
    
    for (const sub of allSubmissions) {
      const row = [];
      for (const h of headers) {
        let val = sub[h];
        // Replace Image URL with "See Folder" reference
        if (imageFields.includes(h)) {
           val = sub[h] ? `${sub.serialNumber}.jpg` : "No Image";
        }
        if (h === "submissionDate" && val && val.toDate) {
          val = val.toDate().toLocaleString("en-IN");
        }
        row.push(escapeCsvCell(val));
      }
      csvRows.push(row.join(","));
    }

    // Zip Logic
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

    // Add Images
    for (const sub of allSubmissions) {
        const serial = sub.serialNumber;
        if (!serial) continue;
        
        for (const field of imageFields) {
            const url = sub[field];
            if (!url) continue;
            try {
                // Parse storage path from URL or Stored Path
                // Assuming stored as URL: .../o/submissions%2FformId%2Ffile.jpg...
                const urlObj = new URL(url);
                // Extract path after /o/
                let storagePath = decodeURIComponent(urlObj.pathname.split("/o/")[1]);
                if(storagePath) {
                    const file = storage.file(storagePath);
                    const folderName = field.replace(/[^a-zA-Z0-9]/g, "_");
                    archive.append(file.createReadStream(), { name: `${folderName}/${serial}.jpg` });
                }
            } catch(e) { console.log("Image error", e); }
        }
    }

    await archive.finalize();
    await zipPromise;

    const dest = `temp_zips/${tempZipName}`;
    await storage.upload(tempZipPath, { destination: dest, contentType: "application/zip" });
    fs.unlinkSync(tempZipPath);

    const file = storage.file(dest);
    const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 15 * 60 * 1000 });

    await logSystemEvent(
      actorEmail,
      "DATA",
      "Report Downloaded",
      `Downloaded report for "${form.formName}" (${allSubmissions.length} records).`,
      { formId }
    );

    return { success: true, downloadUrl: url, fileName: `${formName}_Report.zip` };
  }
);

/**
 * 4. Coordinator Management (SECURED)
 */
exports.createCoordinatorAccount = onCall({ cors: true }, async (request) => {
  requireAdmin(request); // LOCK

  const { email, password, name, org, phone, accessList } = request.data;
  
  try {
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name
    });

    // SET CUSTOM CLAIM (CRITICAL FOR RBAC)
    await auth.setCustomUserClaims(userRecord.uid, { role: 'coordinator' });

    await db.collection("coordinators").add({
      uid: userRecord.uid,
      email,
      name,
      org,
      phone,
      accessList: accessList || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await logSystemEvent(request.auth.token.email, "SECURITY", "Coordinator Created", `Created ${email}.`);
    return { success: true };
  } catch (error) {
    throw new HttpsError("internal", error.message);
  }
});

exports.updateCoordinatorAccount = onCall({ cors: true }, async (request) => {
  requireAdmin(request); // LOCK

  const { docId, email, password, name, org, phone, accessList } = request.data;
  
  // ... (Existing update logic) ...
  const coordDoc = await db.collection("coordinators").doc(docId).get();
  if (!coordDoc.exists) throw new HttpsError("not-found", "Not found");
  
  const uid = coordDoc.data().uid;
  
  const authUpdates = {};
  if (email) authUpdates.email = email;
  if (password && password.length >= 6) authUpdates.password = password;
  if (name) authUpdates.displayName = name;
  
  if (Object.keys(authUpdates).length > 0) await auth.updateUser(uid, authUpdates);
  
  const firestoreUpdates = { email, name, org, phone, accessList };
  // Remove undefined keys
  Object.keys(firestoreUpdates).forEach(key => firestoreUpdates[key] === undefined && delete firestoreUpdates[key]);
  
  await db.collection("coordinators").doc(docId).update(firestoreUpdates);
  
  await logSystemEvent(request.auth.token.email, "SECURITY", "Coordinator Updated", `Updated ${email}.`);
  return { success: true };
});

exports.deleteCoordinatorAuth = onCall({ cors: true }, async (request) => {
  requireAdmin(request); // LOCK
  await auth.deleteUser(request.data.uid);
  await logSystemEvent(request.auth.token.email, "SECURITY", "Coordinator Deleted", `Deleted UID: ${request.data.uid}`);
  return { success: true };
});

/**
 * 5. Generate Batch OTPs (SECURED)
 */
exports.generateBatchOTPs = onCall({ cors: true }, async (request) => {
  requireAdmin(request); // LOCK

  const { formId, quantity } = request.data;
  
  // ... (Existing OTP generation logic) ...
  const batch = db.batch();
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  
  for (let i = 0; i < quantity; i++) {
    const newOtpRef = db.collection("otps").doc();
    let code = "";
    for(let j=0; j<6; j++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    
    batch.set(newOtpRef, {
      formId,
      code: code.toLowerCase(),
      isUsed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  await batch.commit();

  await logSystemEvent(request.auth.token.email, "TRAFFIC", "OTPs Generated", `Generated ${quantity} for ${formId}.`);
  return { success: true, count: quantity };
});