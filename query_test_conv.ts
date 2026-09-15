import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

import { db } from "./server/firebase";

async function run() {
  const snap = await db().collection("conversations").where("platformUserId", "==", "1000000000001").get();
  snap.docs.forEach(doc => {
    console.log(doc.id, doc.data());
  });
}
run().then(()=>process.exit(0));
