import { db, initFirebaseAdmin } from "./server/firebase.js";

async function inspectDbSecrets() {
  initFirebaseAdmin();
  const firestore = db();
  
  console.log("=== Checking settings/env_backup ===");
  try {
    const envBackupDoc = await firestore.collection("settings").doc("env_backup").get();
    if (envBackupDoc.exists) {
      const data = envBackupDoc.data() || {};
      const keys = Object.keys(data);
      console.log("env_backup exists! Found keys:", keys);
      for (const k of keys) {
        const val = String(data[k]);
        console.log(`  ${k}: length=${val.length}, preview=${val.slice(0, 4)}...${val.slice(-4)}`);
      }
    } else {
      console.log("env_backup doc does not exist.");
    }
  } catch (err: any) {
    console.error("Error reading env_backup:", err.message);
  }

  console.log("\n=== Checking settings/telegram ===");
  try {
    const tgDoc = await firestore.collection("settings").doc("telegram").get();
    if (tgDoc.exists) {
      const data = tgDoc.data() || {};
      console.log("settings/telegram exists! Keys:", Object.keys(data));
      console.log("  botToken length:", data.botToken ? data.botToken.length : 0);
      console.log("  adminChatId:", data.adminChatId);
      console.log("  adminName:", data.adminName);
    } else {
      console.log("settings/telegram doc does not exist.");
    }
  } catch (err: any) {
    console.error("Error reading settings/telegram:", err.message);
  }

  console.log("\n=== Checking connectors collection ===");
  try {
    const connectorsSnap = await firestore.collection("connectors").get();
    console.log(`Found ${connectorsSnap.size} connectors:`);
    for (const doc of connectorsSnap.docs) {
      const d = doc.data();
      console.log(`  Connector ID: ${doc.id}, platform: ${d.platform || doc.id}, status: ${d.status}, hasToken: ${!!(d.accessToken || d.pageAccessToken || d.botToken)}`);
    }
  } catch (err: any) {
    console.error("Error reading connectors:", err.message);
  }

  console.log("\n=== Checking settings collection (all docs) ===");
  try {
    const settingsSnap = await firestore.collection("settings").get();
    console.log(`Found ${settingsSnap.size} settings docs:`);
    for (const doc of settingsSnap.docs) {
      console.log(`  Settings Doc ID: ${doc.id}`);
    }
  } catch (err: any) {
    console.error("Error reading settings collection:", err.message);
  }
}

inspectDbSecrets().catch(console.error);
