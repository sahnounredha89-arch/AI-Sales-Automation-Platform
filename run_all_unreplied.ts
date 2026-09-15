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
    const resultMessenger = await replyAllUnrepliedMessages("messenger");
    console.log("Messenger Batch Reply Result:", JSON.stringify(resultMessenger, null, 2));
  } catch (err: any) {
    console.error("Error during Messenger batch reply:", err.message || err);
  }

  console.log("Starting batch reply for unreplied Instagram messages...");
  try {
    const resultIg = await replyAllUnrepliedMessages("instagram");
    console.log("Instagram Batch Reply Result:", JSON.stringify(resultIg, null, 2));
  } catch (err: any) {
    console.error("Error during Instagram batch reply:", err.message || err);
  }
}
run().then(() => process.exit(0));
