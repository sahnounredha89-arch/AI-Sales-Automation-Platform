import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import dotenv from "dotenv";
dotenv.config({ override: true });

async function run() {
  const envVars = process.env;
  let privateKey = envVars.FIREBASE_PRIVATE_KEY!;
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
  
  console.log("Checking recent conversations...");
  const convs = await db.collection("conversations")
    .orderBy("updatedAt", "desc")
    .limit(3)
    .get();

  for (const conv of convs.docs) {
      console.log(`\nConversation: ${conv.id}, platform: ${conv.data().platform}`);
      const snaps = await conv.ref.collection("messages")
        .orderBy("timestamp", "desc")
        .limit(3)
        .get();
        
      snaps.docs.reverse().forEach(d => {
         const data = d.data();
         const age = Math.round((Date.now() - data.timestamp) / 1000);
         console.log(`  [${age}s ago] ${data.direction.toUpperCase()}: ${data.text.substring(0, 50).replace(/\n/g, " ")}...`);
         if (data.direction === "outbound") {
             console.log(`           status: ${data.status}, error: ${data.error || 'none'}`);
         }
      });
  }
}
run().catch(console.error);
