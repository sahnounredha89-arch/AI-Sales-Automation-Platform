import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;
import { db } from "./server/firebase";

async function run() {
  console.log("Looking for messages stuck in processing/queued...");
  const convs = await db().collection("conversations").limit(5).get();
  for (const doc of convs.docs) {
     const msgs = await db().collection("conversations").doc(doc.id).collection("messages").get();
     for (const m of msgs.docs) {
        const d = m.data();
        if (d.processingStatus !== "processed" && d.direction !== "outbound") {
           console.log(doc.id, "Message:", d.text?.substring(0,20), "Status:", d.processingStatus);
        }
     }
  }
}
run().then(()=>process.exit(0)).catch(console.error);
