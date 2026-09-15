import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

import { db } from "./server/firebase";

async function run() {
  console.log("Checking recent webhook events...");
  const webhooks = await db().collection("webhookEvents")
    .orderBy("receivedAt", "desc")
    .limit(10)
    .get();
    
  if (webhooks.empty) {
    console.log("No webhooks found.");
    return;
  }
  
  webhooks.docs.forEach(doc => {
    const data = doc.data();
    console.log(`Webhook: ${doc.id} | Status: ${data.status} | Error: ${data.error}`);
  });
}
run().then(()=>process.exit(0)).catch(console.error);
