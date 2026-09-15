import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars, db } from "./server/firebase";
import { testInstagramConnection, testFacebookConnection } from "./server/services/metaService";

const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

async function run() {
    const metaSettings = (await db().collection("settings").doc("meta").get()).data();
    console.log("Settings token length:", metaSettings?.instagramAccessToken?.length);
    console.log("Settings page token length:", metaSettings?.pageAccessToken?.length);

    console.log("\nTesting Facebook Connection...");
    const fbResult = await testFacebookConnection();
    console.log("FB Result:", JSON.stringify(fbResult, null, 2));

    console.log("\nTesting Instagram Connection...");
    const igResult = await testInstagramConnection();
    console.log("IG Result:", JSON.stringify(igResult, null, 2));

    // Update connector status based on result
    if (igResult.success) {
        await db().collection("connectors").doc("instagram").set({
            status: "connected",
            accountLinked: igResult.accountLinked,
            igAccountId: igResult.igAccountId || null,
            igUsername: igResult.igUsername || null,
            messagingPermission: igResult.messagingPermission || "ready",
            messagingStatus: igResult.messagingStatus || "ready"
        }, { merge: true });
    }

    process.exit(0);
}
run().catch(console.error);
