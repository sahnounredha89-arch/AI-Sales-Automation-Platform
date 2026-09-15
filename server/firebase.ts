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
    
    // Convert all literal backslash-n sequences into actual newlines
    privateKey = privateKey.replace(/\\n/g, "\n");
    // Strip all remaining backslashes
    privateKey = privateKey.replace(/\\/g, "");
    
    // Ensure properly formatted headers and footers
    privateKey = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "-----BEGIN PRIVATE KEY-----\n");
    privateKey = privateKey.replace(/-----END PRIVATE KEY-----/g, "\n-----END PRIVATE KEY-----");
    privateKey = privateKey.replace(/\n\n/g, "\n");

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

export const storage = (): any => {
  if (!adminApp) {
    initFirebaseAdmin();
  }
  if (adminApp && (process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET)) {
    try {
      return getStorage(adminApp);
    } catch (e) {
      console.warn("Firebase Storage initialization error:", e);
    }
  }
  return {
    bucket: () => ({
      name: "local-storage",
      file: (filename: string) => ({
        save: async (buffer: Buffer) => {
          const uploadsDir = path.join(process.cwd(), "public", "uploads");
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }
          const targetPath = path.join(uploadsDir, path.basename(filename));
          fs.writeFileSync(targetPath, buffer);
        },
        makePublic: async () => {},
      }),
    }),
  };
};

let quotaExceededState = false;
let quotaExceededDetectedAt = 0;

export function setFirestoreQuotaExceeded(exceeded: boolean) {
  quotaExceededState = exceeded;
  if (exceeded) {
    quotaExceededDetectedAt = Date.now();
  }
}

export function isFirestoreQuotaExceeded(): boolean {
  // Allow a retry probe if 1 hour has elapsed
  if (quotaExceededState && Date.now() - quotaExceededDetectedAt > 60 * 60 * 1000) {
    return false;
  }
  return quotaExceededState;
}

export function getDatabaseStatus() {
  if (!isInitialized) {
    initFirebaseAdmin();
  }
  const quotaExceeded = isFirestoreQuotaExceeded();
  let mode: "cloud" | "cloud_quota_exceeded" | "local" = "cloud";
  if (!hasValidCredentials) {
    mode = "local";
  } else if (quotaExceeded) {
    mode = "cloud_quota_exceeded";
  }

  return {
    mode,
    connected: !!firestoreInstance && hasValidCredentials,
    quotaExceeded,
    projectId: DEFAULT_PROJECT_ID,
    databaseId,
    hasCredentials: hasValidCredentials,
    message: !hasValidCredentials
      ? `Firebase Firestore credentials required for project ${DEFAULT_PROJECT_ID}. Error: ${lastError}`
      : quotaExceeded
      ? `Cloud Firestore credentials verified for project ${DEFAULT_PROJECT_ID}. Google Cloud daily free-tier read quota (50,000 reads) reached today. Local persistence engine is securely serving and preserving data until automatic midnight PT reset.`
      : `Connected to Google Cloud Firestore (project: ${DEFAULT_PROJECT_ID}).`,
    resetInfo: quotaExceeded
      ? "Daily free read quota resets at 00:00 US Pacific Time (08:00 UTC). Or switch Firebase project to Blaze plan for pay-as-you-go."
      : undefined
  };
}
