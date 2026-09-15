import dotenv from "dotenv";
dotenv.config({ override: true });

import { getEnvVars } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

import { replyAllUnrepliedMessages } from "./server/services/salesAgent";

async function run() {
  console.log("Starting batch reply for unreplied Messenger messages...");
  try {
    const result = await replyAllUnrepliedMessages("messenger");
    console.log("Batch Reply Result:", JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error("Error during batch reply:", err.message || err);
  }
}

run().then(() => process.exit(0));
