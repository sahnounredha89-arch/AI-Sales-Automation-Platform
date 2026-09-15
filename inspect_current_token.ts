import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars, db } from "./server/firebase";

const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

async function run() {
    console.log("Fetching DB settings...");
    const metaSettings = (await db().collection("settings").doc("meta").get()).data();
    console.log("Settings token length:", metaSettings?.instagramAccessToken?.length);
    console.log("Settings page token length:", metaSettings?.pageAccessToken?.length);

    console.log("Token:", metaSettings?.instagramAccessToken || metaSettings?.pageAccessToken);

    process.exit(0);
}
run();
