import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { initFirebaseAdmin, db, getEnvVars } from "../firebase";

const router = Router();

router.get("/status", requireAdmin, async (req, res) => {
  const envVars = getEnvVars();
  let firebaseConfigured = false;
  let credentialSource = "none";
  let serviceAccountConfigured = !!envVars.FIREBASE_CLIENT_EMAIL;
  let firestoreDatabaseReachable = false;
  let firestoreReadTest = false;
  let firestoreWriteTest = false;

  try {
    const app = initFirebaseAdmin();
    firebaseConfigured = !!app;
    
    if (envVars.FIREBASE_CLIENT_EMAIL && envVars.FIREBASE_PRIVATE_KEY) {
      credentialSource = "environment";
    }

    if (app) {
      const firestore = db();
      
      // 1. Read test
      const readSnap = await firestore.collection("products").limit(1).get();
      firestoreDatabaseReachable = true;
      firestoreReadTest = true;

      // 2. Temporary write test & cleanup
      const tempRef = firestore.collection("_diagnostic_test").doc("temp_probe");
      await tempRef.set({ test: true, timestamp: new Date().toISOString() });
      const checkDoc = await tempRef.get();
      if (checkDoc.exists) {
        firestoreWriteTest = true;
      }
      await tempRef.delete();
    }
  } catch (err: any) {
    console.error("Firebase status diagnostic error:", err.message);
  }

  res.json({
    firebaseProjectId: envVars.FIREBASE_PROJECT_ID || "ai-sales-automation-ada3a",
    firebaseConfigured,
    credentialSource,
    serviceAccountConfigured,
    firestoreDatabaseReachable,
    firestoreReadTest,
    firestoreWriteTest,
  });
});

export default router;
