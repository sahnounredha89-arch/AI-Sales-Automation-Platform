import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars, db } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

async function run() {
    const messengerRef = db().collection("connectors").doc("messenger");
    const messenger = await messengerRef.get();
    if (messenger.exists && messenger.data()?.status === "connected") {
        await messengerRef.set({ messagingPermission: "ready", messagingStatus: "ready" }, { merge: true });
    }

    const igRef = db().collection("connectors").doc("instagram");
    const ig = await igRef.get();
    if (ig.exists && ig.data()?.status === "connected") {
        await igRef.set({ messagingPermission: "ready", messagingStatus: "ready" }, { merge: true });
    }
    console.log("Fixed DB.");
    process.exit(0);
}
run();
