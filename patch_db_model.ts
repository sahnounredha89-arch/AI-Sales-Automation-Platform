import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars, db } from "./server/firebase";

const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

async function run() {
    const metaSettings = (await db().collection("settings").doc("meta").get()).data();
    if (metaSettings?.model) {
        console.log("Current DB model:", metaSettings.model);
        await db().collection("settings").doc("meta").set({ model: "gemini-1.5-pro-latest" }, { merge: true });
        console.log("Updated DB model to gemini-1.5-pro-latest");
    } else {
        console.log("No model in DB settings.");
    }
    process.exit(0);
}
run();
