import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

import { db } from "./server/firebase";

async function run() {
  const PAGE_TOKEN = "EAARUqn0q1IUBSQIhYWs32DJyWoZA6gwdZC96ydpPRc8mZC5ssBa8p5hx9XkkteROxt7tXwQ3PLDwCdc8PEnJOqtnrlq3TZBDZCZBEGaDZCDbIhVkkNCyHKDSunZAwP22j55VWEAS9F9KPDMu5WL7PkRsF0CUcJY4m0OxHdxRZCy4mAW1djmCUjt4tceZAIzyZB6N9e4UNMZD";
  
  console.log("Fixing .env...");
  let envFile = fs.readFileSync(".env", "utf8");
  envFile = envFile.replace(/META_PAGE_ACCESS_TOKEN=.*/, `META_PAGE_ACCESS_TOKEN="${PAGE_TOKEN}"`);
  fs.writeFileSync(".env", envFile);
  
  console.log("Fixing .credentials_backup.json...");
  if (fs.existsSync(".credentials_backup.json")) {
    let b = JSON.parse(fs.readFileSync(".credentials_backup.json", "utf8"));
    b.META_PAGE_ACCESS_TOKEN = PAGE_TOKEN;
    fs.writeFileSync(".credentials_backup.json", JSON.stringify(b, null, 2));
  }
  
  console.log("Fixing Firestore...");
  await db().collection("settings").doc("env_backup").set({ META_PAGE_ACCESS_TOKEN: PAGE_TOKEN }, { merge: true });
  await db().collection("settings").doc("meta").set({ pageAccessToken: PAGE_TOKEN }, { merge: true });
  await db().collection("connectors").doc("messenger").set({ accessToken: PAGE_TOKEN, isConnected: true }, { merge: true });
  
  // Re-subscribe just to be 100% sure
  console.log("Resubscribing page...");
  const subRes = await fetch(`https://graph.facebook.com/v19.0/110414661460391/subscribed_apps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscribed_fields: "messages,messaging_postbacks",
      access_token: PAGE_TOKEN
    })
  });
  console.log("Sub result:", await subRes.json());
}
run().then(()=>process.exit(0));
