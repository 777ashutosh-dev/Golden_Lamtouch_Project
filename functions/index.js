/**
 * M26 v3 - (FULL CLOUD BRAIN + UPDATE LOGIC)
 *
 * Includes:
 * 1. Serial Number Generator (India Region)
 * 2. Cascading Delete (Forms + Data)
 * 3. Smart Data Download (Ranges + Organized Zip + CSV Order)
 * 4. Coordinator Engine:
 * - createCoordinatorAccount (Create Auth + Doc)
 * - updateCoordinatorAccount (Update Auth + Doc + Access)
 * - deleteCoordinatorAuth (Cleanup Auth)
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
const auth = admin.auth(); // Access to Auth Management
const storage = admin.storage().bucket(BUCKET_NAME);

/**
 * 1. Serial Number Generator
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

      // --- ROBUST TRANSACTION BLOCK ---
      const finalSerial = await db.runTransaction(async (t) => {
          // 1. Read Global Prefix (Default to "25")
          const configDoc = await t.get(configRef);
          const prefix = configDoc.exists ? (configDoc.data().serialPrefix || "25") : "25";
          
          // 2. Read Last Number (Default to 0)
          const counterDoc = await t.get(counterRef);
          const lastNumber = counterDoc.exists ? (counterDoc.data().lastNumber || 0) : 0;
          
          // 3. Increment
          const newNumber = lastNumber + 1;
          const paddedNumber = String(newNumber).padStart(4, "0");
          
          // 4. WRITE back to DB
          t.set(counterRef, { lastNumber: newNumber }, { merge: true });
          
          return `${prefix}${paddedNumber}`;
      });

      console.log(`Generated Serial: ${finalSerial}`);
      
      // Update the submission with the new ID
      return snap.ref.update({ serialNumber: finalSerial, status: "Submitted" });

    } catch (error) {
      console.error("Serial Error:", error);
      return snap.ref.update({ status: "Error: No Serial" });
    }
  }
);

/**
 * 2. Cascading Delete
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
  
  const formDocRef = db.collection("forms").doc(formId);
  const submissionsQuery = db.collection("submissions").where("formId", "==", formId);
  const otpsQuery = db.collection("otps").where("formId", "==", formId);
  const storagePrefix = `submissions/${formId}/`;
  const privateCounterQuery = db.collection("forms").doc(formId).collection("private");

  await Promise.all([
    formDocRef.delete(),
    deleteCollectionByQuery(submissionsQuery),
    deleteCollectionByQuery(otpsQuery),
    storage.deleteFiles({ prefix: storagePrefix }),
    deleteCollectionByQuery(privateCounterQuery),
  ]);

  return { success: true };
});

function escapeCsvCell(cell) {
  if (cell === null || cell === undefined) return '""';
  let str = String(cell).replace(/"/g, '""');
  if (str.search(/("|,|\n)/g) >= 0) str = '"' + str + '"';
  return str;
}

/**
 * 3. Create Full Report .zip
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
    
    // --- CSV COLUMN ORDERING LOGIC ---
    
    // 1. Identify Field Types
    const formFields = form.fields.filter(f => f.dataType !== "hidden" && f.dataType !== "header");
    const imageFields = formFields.filter(f => f.dataType === "image" || f.dataType === "signature").map(f => f.fieldName);
    
    // 2. Build Header Row (Strict Order)
    let headers = ["serialNumber"];
    headers = headers.concat(formFields.map(f => f.fieldName));
    headers.push("submissionDate");
    headers.push("otp");
    if (form.isPrepaid) headers.push("paymentStatus");
    
    // 3. Generate CSV Rows
    const csvRows = [headers.map(escapeCsvCell).join(",")];
    let imageCount = 0;

    for (const sub of allSubmissions) {
      const row = [];
      for (const h of headers) {
        let val = sub[h];
        
        // Special Handling for Image Columns in CSV
        if (imageFields.includes(h)) {
            val = sub["serialNumber"] || ""; 
            if (sub[h]) imageCount++;
        }
        
        // Date Formatting
        if (h === "submissionDate" && val && val.toDate) {
            val = val.toDate().toLocaleString("en-IN");
        }
        
        // Payment Logic
        if (h === "paymentStatus") val = "Paid";
        
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
                 
                 // Folder Logic
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
    
    return { success: true, downloadUrl: url, fileName: `${formName}_Report.zip` };
  }
);

/**
 * 4. Create Coordinator Account (NEW)
 */
exports.createCoordinatorAccount = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Admin only.");
    }
    
    const { email, password, name, org, phone, accessList } = request.data;

    try {
        // 1. Create User in Firebase Auth
        const userRecord = await auth.createUser({
            email: email,
            password: password,
            displayName: name || "Coordinator"
        });

        // 2. Create Coordinator Document in Firestore
        await db.collection("coordinators").add({
            uid: userRecord.uid,
            email: email,
            name: name || "",
            org: org || "",
            phone: phone || "",
            accessList: accessList || [],
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // 3. Set Custom Claims (Crucial for future RBAC logic)
        await auth.setCustomUserClaims(userRecord.uid, { role: 'coordinator' });

        return { success: true, uid: userRecord.uid };

    } catch (error) {
        console.error("Error creating coordinator:", error);
        throw new HttpsError("internal", error.message);
    }
});

/**
 * 5. Update Coordinator Account (NEW)
 * Handles updates to email, password, and profile data.
 */
exports.updateCoordinatorAccount = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Admin only.");
    }
    
    const { docId, email, password, name, org, phone, accessList } = request.data;
    
    try {
        // 1. Get the existing Firestore Doc to find the UID
        const coordDoc = await db.collection("coordinators").doc(docId).get();
        if (!coordDoc.exists) {
            throw new HttpsError("not-found", "Coordinator profile not found.");
        }
        const uid = coordDoc.data().uid;

        // 2. Update Firebase Auth (if email/password provided)
        const authUpdates = {};
        if (email) authUpdates.email = email;
        if (password && password.length >= 6) authUpdates.password = password;
        if (name) authUpdates.displayName = name;
        
        if (Object.keys(authUpdates).length > 0) {
            await auth.updateUser(uid, authUpdates);
        }

        // 3. Update Firestore Document
        const firestoreUpdates = {
            email: email,
            name: name,
            org: org,
            phone: phone,
            accessList: accessList
        };
        
        // Remove undefined keys
        Object.keys(firestoreUpdates).forEach(key => firestoreUpdates[key] === undefined && delete firestoreUpdates[key]);

        await db.collection("coordinators").doc(docId).update(firestoreUpdates);

        return { success: true };

    } catch (error) {
        console.error("Error updating coordinator:", error);
        throw new HttpsError("internal", error.message);
    }
});

/**
 * 6. Delete Coordinator Auth
 */
exports.deleteCoordinatorAuth = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Admin only.");
    }
    
    const { uid } = request.data;
    try {
        await auth.deleteUser(uid);
        return { success: true };
    } catch (error) {
         console.warn("Error deleting auth user:", error);
         return { success: false };
    }
});