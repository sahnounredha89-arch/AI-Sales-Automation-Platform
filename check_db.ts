import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import dotenv from "dotenv";
dotenv.config({ override: true });

async function run() {
  const envVars = process.env;
  let privateKey = envVars.FIREBASE_PRIVATE_KEY!;
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) privateKey = privateKey.substring(1, privateKey.length - 1);
  if (privateKey.startsWith("'") && privateKey.endsWith("'")) privateKey = privateKey.substring(1, privateKey.length - 1);
  privateKey = privateKey.replace(/\\n/g, "\n").replace(/\\/g, "");
  privateKey = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "-----BEGIN PRIVATE KEY-----\n");
  privateKey = privateKey.replace(/-----END PRIVATE KEY-----/g, "\n-----END PRIVATE KEY-----");
  privateKey = privateKey.replace(/\n\n/g, "\n");

  const app = initializeApp({
    credential: cert({
      projectId: envVars.FIREBASE_PROJECT_ID,
      clientEmail: envVars.FIREBASE_CLIENT_EMAIL,
      privateKey,
    })
  });

  const db = getFirestore(app);
  
  console.log("Checking recent outbound messages...");
  const recent = await db.collection("webhookEvents").orderBy("receivedAt", "desc").limit(3).get();
  
  const snaps = await db.collectionGroup("messages")
    .where("direction", "==", "outbound")
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();

  if (snaps.empty) {
     console.log("No outbound messages found.");
  } else {
     snaps.forEach(d => {
       const data = d.data();
       const age = Math.round((Date.now() - data.timestamp) / 1000);
       console.log(`[${age}s ago] to ${data.recipient || 'unknown'}: ${data.text.substring(0, 50)}...`);
       console.log(`         status: ${data.status}, error: ${data.error || 'none'}`);
     });
  }
}
run().catch(console.error);
