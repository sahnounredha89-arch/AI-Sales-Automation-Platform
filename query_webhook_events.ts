import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

import { db } from "./server/firebase";

async function run() {
  console.log("Checking recent webhook events to see what Meta is actually sending...");
  const webhooks = await db().collection("webhookEvents")
    .orderBy("receivedAt", "desc")
    .limit(10)
    .get();
    
  if (webhooks.empty) {
    console.log("No webhooks found in the last batch.");
    return;
  }
  
  webhooks.docs.forEach(doc => {
    const data = doc.data();
    console.log(`Webhook ID: ${doc.id}`);
    console.log(`Status: ${data.status} | ProcessingStatus: ${data.processingStatus}`);
    console.log(`Error: ${data.error || "None"}`);
    if (data.payload) {
      // Just print the first part of the payload safely
      try {
         const payloadStr = JSON.stringify(data.payload);
         console.log(`Payload snippet: ${payloadStr.substring(0, 150)}...`);
      } catch(e) {}
    }
    console.log("------------------------");
  });
}
run().then(()=>process.exit(0)).catch(console.error);
