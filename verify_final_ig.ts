import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars, db } from "./server/firebase";
import { testInstagramConnection } from "./server/services/metaService";

const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

async function run() {
    console.log("Checking updated token from Firestore...");
    const metaSettings = (await db().collection("settings").doc("meta").get()).data();
    const token = metaSettings?.instagramAccessToken || metaSettings?.pageAccessToken;
    console.log("Token length:", token?.length);
    
    if (!token) {
        console.log("No token found in database!");
        process.exit(1);
    }
    
    // Quick debug scopes check
    const appId = metaSettings?.appId;
    const appSecret = metaSettings?.appSecret;
    if (appId && appSecret) {
        const debugRes = await fetch(`https://graph.facebook.com/debug_token?input_token=${token}&access_token=${appId}|${appSecret}`);
        const debugData = await debugRes.json();
        console.log("Scopes present:", debugData?.data?.scopes);
    }

    console.log("\nTesting Instagram Connection via metaService...");
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
        console.log("Successfully marked IG as connected and ready in DB.");
    } else {
        await db().collection("connectors").doc("instagram").set({
            status: igResult.authStatus === "failed" ? "failed" : "connected",
            accountLinked: igResult.accountLinked,
            messagingPermission: igResult.messagingPermission || "missing",
            messagingStatus: igResult.messagingStatus || "not_ready"
        }, { merge: true });
        console.log("Failed to mark IG as ready.");
    }

    process.exit(0);
}
run().catch(console.error);
