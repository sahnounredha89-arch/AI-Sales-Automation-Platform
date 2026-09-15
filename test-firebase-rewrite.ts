import { initializeApp, getApps, getApp, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

let isInitialized = false;
const DEFAULT_PROJECT_ID = "ai-sales-automation-ada3a";
let databaseId = "(default)";
let adminApp: App | null = null;
let firestoreInstance: Firestore | null = null;
let hasValidCredentials = false;
let lastError = "";

export const getEnvVars = () => {
  let envConfig: any = {};
  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), '.env'));
    envConfig = dotenv.parse(envFile);
  } catch (e) {}
    
  return {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || envConfig.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || envConfig.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY || envConfig.FIREBASE_PRIVATE_KEY,
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || envConfig.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
  };
};

export function initFirebaseAdmin(): App | null {
  if (getApps().length > 0) {
    adminApp = getApp();
    isInitialized = true;
    if (!firestoreInstance) firestoreInstance = getFirestore(adminApp, databaseId);
    hasValidCredentials = true;
    return adminApp;
  }

  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (config.firestoreDatabaseId) databaseId = config.firestoreDatabaseId;
    }
  } catch (e) {
    console.warn("Could not read firebase-applet-config.json:", e);
  }

  const envVars = getEnvVars();
  const projectId = envVars.FIREBASE_PROJECT_ID;
  const clientEmail = envVars.FIREBASE_CLIENT_EMAIL;
  let rawPrivateKey = envVars.FIREBASE_PRIVATE_KEY;

  if (!clientEmail || !rawPrivateKey) {
    const missing = [];
    if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
    if (!rawPrivateKey) missing.push("FIREBASE_PRIVATE_KEY");
    lastError = `Missing required environment variables: ${missing.join(", ")}. Please add them to your environment variables (Settings > Secrets).`;
    console.error(`❌ CRITICAL: ${lastError}`);
    isInitialized = true;
    return null;
  }

  try {
    let privateKey = rawPrivateKey.trim();
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.substring(1, privateKey.length - 1);
    }
    if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
      privateKey = privateKey.substring(1, privateKey.length - 1);
    }
    
    privateKey = privateKey.replace(/\\-----END PRIVATE KEY-----/g, "\\n-----END PRIVATE KEY-----");
    privateKey = privateKey.replace(/-----END PRIVATE KEY-----\\/g, "-----END PRIVATE KEY-----\\n");
    privateKey = privateKey.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");

    adminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail: clientEmail.trim(),
        privateKey,
      }),
      projectId,
      storageBucket: envVars.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
    });
    
    isInitialized = true;
    hasValidCredentials = true;
    firestoreInstance = getFirestore(adminApp, databaseId);
    console.log(`✅ Firebase Admin successfully initialized for project: ${projectId}`);
    return adminApp;
  } catch (error: any) {
    lastError = `Failed to initialize Firebase Admin SDK: ${error.message}`;
    console.error(`❌ CRITICAL: ${lastError}`);
    isInitialized = true;
    return null;
  }
}

export const db = (): Firestore => {
  if (!firestoreInstance) {
    initFirebaseAdmin();
  }
  if (!firestoreInstance) {
    throw new Error(`Firestore Permission Denied. The backend cannot connect to your Firebase Project. Please add FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY to your environment variables (Settings > Secrets) to allow the backend to authenticate properly. Details: ${lastError}`);
  }
  return firestoreInstance;
};

// ... storage and getDatabaseStatus ...
