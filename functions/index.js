/**
 * M23 v22 - (CSV EXTENSION REMOVAL) Cloud Brain
 *
 * Updates:
 * 1. CSV Logic: Image columns in CSV now show ONLY the Serial Number (e.g., "250001").
 * - Removed the ".jpg" extension from the spreadsheet data.
 * 2. Preserved: Strict column ordering and Folder structure inside the zip.
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
 * 3. Create Full Report .zip (UPDATED: EXTENSION REMOVED)
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
            // --- UPDATED: Just the number, NO extension ---
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
                 // File inside zip still keeps .jpg for validity
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