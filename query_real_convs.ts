import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

import { db } from "./server/firebase";

async function run() {
  console.log("Looking for real conversations in DB...");
  const snap = await db().collection("conversations")
    .orderBy("updatedAt", "desc")
    .limit(10)
    .get();
    
  if (snap.empty) {
    console.log("No conversations found in DB.");
    return;
  }
  
  snap.docs.forEach(doc => {
    const data = doc.data();
    console.log(`Conv: ${doc.id} | Name: ${data.customerName} | aiEnabled: ${data.aiEnabled} | handoff: ${data.humanHandoff} | snippet: ${data.snippet?.substring(0, 30)}`);
  });
  
  console.log("\nChecking recent webhook events...");
  const webhooks = await db().collection("webhookEvents")
    .orderBy("receivedAt", "desc")
    .limit(5)
    .get();
    
  webhooks.docs.forEach(doc => {
    const data = doc.data();
    console.log(`Webhook: ${doc.id} | Status: ${data.status} | Error: ${data.error} | Payload: ${JSON.stringify(data.payload).substring(0, 80)}`);
  });
}
run().then(()=>process.exit(0)).catch(console.error);
