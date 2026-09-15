import { Router } from "express";
import { initFirebaseAdmin, db } from "../firebase";

const router = Router();

router.get("/", async (req, res) => {
  const diagnostic = {
    FIREBASE_PROJECT_ID_STATUS: !!process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL_STATUS: !!process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY_STATUS: !!process.env.FIREBASE_PRIVATE_KEY,
    ENV_KEYS: Object.keys(process.env).filter(k => k.includes("FIREBASE") || k.includes("ADMIN")),
    FIREBASE_ADMIN_SDK_STATUS: false,
    FIRESTORE_READ_STATUS: false,
    AUTH_USERNAME_SOURCE: process.env.ADMIN_USERNAME ? "env" : "missing",
    AUTH_STATUS: process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD ? "configured" : "missing",
    ERROR: null as string | null
  };
  
  try {
    const app = initFirebaseAdmin();
    diagnostic.FIREBASE_ADMIN_SDK_STATUS = !!app;
    
    const firestore = db();
    const testDoc = await firestore.collection("settings").doc("general").get();
    diagnostic.FIRESTORE_READ_STATUS = testDoc.exists || !testDoc.exists; // just means it didn't throw
  } catch (e: any) {
    diagnostic.ERROR = e.message;
  }
  
  res.json(diagnostic);
});

export default router;
