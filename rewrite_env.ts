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
  const doc = await db().collection("settings").doc("meta_credentials").get();
  const pageToken = doc.data()?.messenger_access_token;
  
  if (!pageToken) {
    console.log("No page token in DB!");
    return;
  }
  
  let envFile = fs.readFileSync(".env", "utf8");
  envFile = envFile.replace(/META_PAGE_ACCESS_TOKEN=.*\n?/, `META_PAGE_ACCESS_TOKEN="${pageToken}"\n`);
  fs.writeFileSync(".env", envFile);
  console.log("Updated .env file with the Page Access Token.");
}
run().then(()=>process.exit(0)).catch(console.error);
