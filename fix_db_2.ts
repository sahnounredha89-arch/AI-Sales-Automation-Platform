import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars, db } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

async function run() {
    const igRef = db().collection("connectors").doc("instagram");
    await igRef.set({ status: "failed", accountLinked: false, igAccountId: null, messagingStatus: "not_ready", messagingPermission: "missing" }, { merge: true });
    console.log("Updated IG DB status to failed.");
    process.exit(0);
}
run();
