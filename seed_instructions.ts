import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars, db } from "./server/firebase";

const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

async function run() {
    await db().collection("settings").doc("ai").set({
        customInstructions: "Always be friendly. End messages with a polite emoji.",
        updatedAt: new Date().toISOString()
    }, { merge: true });
    process.exit(0);
}
run();
