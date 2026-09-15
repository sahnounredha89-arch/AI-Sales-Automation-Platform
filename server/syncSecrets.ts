import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const KNOWN_SECRET_KEYS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_STORAGE_BUCKET",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "SESSION_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_ADMIN_CHAT_ID",
  "TELEGRAM_BOT_USERNAME",
  "META_APP_ID",
  "META_APP_SECRET",
  "META_PAGE_ID",
  "META_PAGE_ACCESS_TOKEN",
  "META_WEBHOOK_VERIFY_TOKEN",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID",
  "PUBLIC_BASE_URL",
];

const BACKUP_JSON_PATH = path.resolve(process.cwd(), ".credentials_backup.json");
const ENV_PATH = path.resolve(process.cwd(), ".env");

/**
 * Restores and synchronizes all credentials from Firestore database,
 * local backup cache, and runtime environment.
 */
export async function restoreSecrets(options?: { force?: boolean }) {
  console.log("[Secrets Sync] Initiating credential restoration from database & environment...");

  const restoredSecrets: Record<string, string> = {};
  let firestoreReachable = false;
  let firestoreQuotaExceeded = false;
  const sourcesUsed: string[] = [];

  // 1. Ingest existing .env if present
  if (fs.existsSync(ENV_PATH)) {
    try {
      const rawEnv = fs.readFileSync(ENV_PATH, "utf-8");
      const parsed = dotenv.parse(rawEnv);
      for (const [k, v] of Object.entries(parsed)) {
        if (v) restoredSecrets[k] = v;
      }
      sourcesUsed.push("local_dotenv");
    } catch (e) {}
  }

  // 2. Ingest active process.env credentials
  for (const key of KNOWN_SECRET_KEYS) {
    if (process.env[key] && !restoredSecrets[key]) {
      restoredSecrets[key] = process.env[key]!;
      sourcesUsed.push("runtime_process_env");
    }
  }

  // 3. Ingest from local persistent backup file (.credentials_backup.json) if present
  let existingBackup: Record<string, any> = {};
  if (fs.existsSync(BACKUP_JSON_PATH)) {
    try {
      existingBackup = JSON.parse(fs.readFileSync(BACKUP_JSON_PATH, "utf-8"));
      for (const [k, v] of Object.entries(existingBackup)) {
        if (typeof v === "string" && v && !restoredSecrets[k]) {
          restoredSecrets[k] = v;
          if (!sourcesUsed.includes("backup_file")) sourcesUsed.push("backup_file");
        }
      }
    } catch (e) {}
  }

  // 4. Ingest from Firestore database
  try {
    const { db, initFirebaseAdmin } = await import("./firebase.js");
    initFirebaseAdmin();
    const firestore = db();

    // 4a. Fetch settings/env_backup
    try {
      const envBackupDoc = await firestore.collection("settings").doc("env_backup").get();
      if (envBackupDoc.exists) {
        const data = envBackupDoc.data() || {};
        for (const [k, v] of Object.entries(data)) {
          if (k !== "backedUpAt" && k !== "updatedAt" && typeof v === "string" && v) {
            restoredSecrets[k] = v;
          }
        }
        sourcesUsed.push("firestore_env_backup");
      }
      firestoreReachable = true;
    } catch (err: any) {
      if (err?.code === 8 || err?.message?.includes("Quota exceeded") || err?.message?.includes("RESOURCE_EXHAUSTED")) {
        firestoreQuotaExceeded = true;
      }
    }

    // 4b. Fetch settings/telegram
    if (!firestoreQuotaExceeded) {
      try {
        const tgDoc = await firestore.collection("settings").doc("telegram").get();
        if (tgDoc.exists) {
          const data = tgDoc.data() || {};
          if (data.botUsername) restoredSecrets["TELEGRAM_BOT_USERNAME"] = data.botUsername;
          if (data.botToken) restoredSecrets["TELEGRAM_BOT_TOKEN"] = data.botToken;
          if (data.adminChatId) restoredSecrets["TELEGRAM_ADMIN_CHAT_ID"] = data.adminChatId;
          sourcesUsed.push("firestore_telegram");
        }
        firestoreReachable = true;
      } catch (err: any) {
        if (err?.code === 8 || err?.message?.includes("Quota exceeded") || err?.message?.includes("RESOURCE_EXHAUSTED")) {
          firestoreQuotaExceeded = true;
        }
      }
    }

    // 4c. Fetch settings/meta
    if (!firestoreQuotaExceeded) {
      try {
        const metaDoc = await firestore.collection("settings").doc("meta").get();
        if (metaDoc.exists) {
          const data = metaDoc.data() || {};
          if (data.appId) restoredSecrets["META_APP_ID"] = data.appId;
          if (data.pageId) restoredSecrets["META_PAGE_ID"] = data.pageId;
          if (data.pageAccessToken) restoredSecrets["META_PAGE_ACCESS_TOKEN"] = data.pageAccessToken;
          if (data.verifyToken) restoredSecrets["META_WEBHOOK_VERIFY_TOKEN"] = data.verifyToken;
          if (data.appSecret) restoredSecrets["META_APP_SECRET"] = data.appSecret;
          if (data.igAccountId) restoredSecrets["INSTAGRAM_BUSINESS_ACCOUNT_ID"] = data.igAccountId;
          sourcesUsed.push("firestore_meta");
        }
        firestoreReachable = true;
      } catch (err: any) {
        if (err?.code === 8 || err?.message?.includes("Quota exceeded") || err?.message?.includes("RESOURCE_EXHAUSTED")) {
          firestoreQuotaExceeded = true;
        }
      }
    }

    // 4d. Fetch connectors collection
    if (!firestoreQuotaExceeded) {
      try {
        const messengerDoc = await firestore.collection("connectors").doc("messenger").get();
        if (messengerDoc.exists) {
          const data = messengerDoc.data() || {};
          if (data.accessToken && !restoredSecrets["META_PAGE_ACCESS_TOKEN"]) {
            restoredSecrets["META_PAGE_ACCESS_TOKEN"] = data.accessToken;
          }
          if (data.pageId && !restoredSecrets["META_PAGE_ID"]) {
            restoredSecrets["META_PAGE_ID"] = data.pageId;
          }
          sourcesUsed.push("firestore_connectors_messenger");
        }

        const igDoc = await firestore.collection("connectors").doc("instagram").get();
        if (igDoc.exists) {
          const data = igDoc.data() || {};
          if (data.igAccountId && !restoredSecrets["INSTAGRAM_BUSINESS_ACCOUNT_ID"]) {
            restoredSecrets["INSTAGRAM_BUSINESS_ACCOUNT_ID"] = data.igAccountId;
          }
          sourcesUsed.push("firestore_connectors_instagram");
        }
        firestoreReachable = true;
      } catch (err: any) {
        if (err?.code === 8 || err?.message?.includes("Quota exceeded") || err?.message?.includes("RESOURCE_EXHAUSTED")) {
          firestoreQuotaExceeded = true;
        }
      }
    }
  } catch (dbErr: any) {
    console.warn("[Secrets Sync] Database inspection notice:", dbErr.message);
  }

  // 5. Merge with existing local backup cache so absent environment variables NEVER erase known credentials
  const mergedSecrets: Record<string, string> = { ...existingBackup, ...restoredSecrets };

  // 6. Inject all restored credentials into process.env runtime
  for (const [k, v] of Object.entries(mergedSecrets)) {
    if (v && typeof v === "string") {
      process.env[k] = v;
    }
  }

  // 7. Write out .env file safely
  let envFileContent = "";
  for (const [k, v] of Object.entries(mergedSecrets)) {
    if (!v || typeof v !== "string") continue;
    if (v.includes("\n") || v.includes(" ") || v.includes('"')) {
      const escaped = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
      envFileContent += `${k}="${escaped}"\n`;
    } else {
      envFileContent += `${k}=${v}\n`;
    }
  }
  fs.writeFileSync(ENV_PATH, envFileContent, "utf-8");
  console.log(`[Secrets Sync] Successfully preserved & written ${Object.keys(mergedSecrets).length} secrets to .env`);

  // 8. Persist merged secrets to local backup cache file (.credentials_backup.json)
  fs.writeFileSync(BACKUP_JSON_PATH, JSON.stringify(mergedSecrets, null, 2), "utf-8");

  // 9. Try updating Firestore env_backup if write is possible
  try {
    const { db } = await import("./firebase.js");
    await db().collection("settings").doc("env_backup").set({
      ...mergedSecrets,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    console.log("[Secrets Sync] Successfully backed up secrets to Firestore settings/env_backup");
  } catch (wErr: any) {
    // Non-blocking
  }

  // 9. Re-initialize Telegram service if Telegram credentials exist
  if (restoredSecrets["TELEGRAM_BOT_TOKEN"] || restoredSecrets["TELEGRAM_ADMIN_CHAT_ID"]) {
    try {
      const { initTelegramService } = await import("./services/telegramService.js");
      await initTelegramService();
    } catch (e) {}
  }

  const restoredKeyList = Object.keys(restoredSecrets);

  return {
    success: true,
    totalKeys: restoredKeyList.length,
    restoredKeys: restoredKeyList,
    sourcesUsed: Array.from(new Set(sourcesUsed)),
    firestoreReachable,
    firestoreQuotaExceeded,
    message: firestoreQuotaExceeded
      ? `Restored ${restoredKeyList.length} credentials into active .env and memory. Note: Cloud Firestore free-tier daily read quota is temporarily active (resets daily at midnight PT). All runtime credentials remain fully active.`
      : `Successfully restored ${restoredKeyList.length} credentials from database and environment into .env and runtime memory.`,
  };
}

/**
 * Main startup sync routine.
 */
export async function syncSecrets() {
  return restoreSecrets();
}

