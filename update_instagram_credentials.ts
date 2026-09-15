import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars, db } from "./server/firebase";
import { testInstagramConnection } from "./server/services/metaService";

const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

const newAppId = "1218991127975045";
const newAppSecret = "bfe7e335d2484e773add1ac334c276b2";
const newToken = "EAARUqn0q1IUBSSFFnIpKcRq9fNpAywsZAjW38eHBc7hMXrz82MShunmOJOgqUP44bMEZC7DP4m4Rkx3SZAbOz1Ldyjhwx5uDrqjLC4lHg9jZBpKxXekBahTpOGX4NMKjI1JAsuSzvwvsylCcy9y0RzS367YQYXGAojauk7EmuFeIhxMsxjlHhQZB9mzaJXN1ZACeUufRAepBrBMbNmUYNfD9b3mDmfkvPcTcbiQrBSD38LdLhS1AZDZD";

async function run() {
    console.log("Updating Firestore...");

    // Update global meta settings
    await db().collection("settings").doc("meta").set({
        appId: newAppId,
        appSecret: newAppSecret,
        instagramAccessToken: newToken,
        updatedAt: new Date().toISOString()
    }, { merge: true });

    // Update connector
    await db().collection("connectors").doc("instagram").set({
        accessToken: newToken,
        appId: newAppId,
        appSecret: newAppSecret,
        updatedAt: new Date().toISOString()
    }, { merge: true });
    
    // Also update messenger app id/secret just in case they share the Meta App
    await db().collection("connectors").doc("messenger").set({
        appId: newAppId,
        appSecret: newAppSecret
    }, { merge: true });

    console.log("Credentials updated. Running testInstagramConnection()...");
    
    // Force environment variables for the test if it relies on process.env
    process.env.META_APP_ID = newAppId;
    process.env.META_APP_SECRET = newAppSecret;
    
    const result = await testInstagramConnection();
    console.log("Instagram Test Result:", JSON.stringify(result, null, 2));

    // Update connector status based on result
    if (result.success) {
        await db().collection("connectors").doc("instagram").set({
            status: "connected",
            accountLinked: result.accountLinked,
            igAccountId: result.igAccountId || null,
            igUsername: result.igUsername || null,
            messagingPermission: result.messagingPermission || "ready",
            messagingStatus: result.messagingStatus || "ready"
        }, { merge: true });
    } else {
        await db().collection("connectors").doc("instagram").set({
            status: result.authStatus === "failed" ? "failed" : "connected",
            accountLinked: result.accountLinked,
            messagingPermission: "missing",
            messagingStatus: "not_ready"
        }, { merge: true });
    }

    process.exit(0);
}
run().catch(console.error);
