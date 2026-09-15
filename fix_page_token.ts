import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars, db } from "./server/firebase";

const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

async function run() {
    const metaSettings = (await db().collection("settings").doc("meta").get()).data();
    const token = metaSettings?.instagramAccessToken || metaSettings?.pageAccessToken;
    
    // Fetch accounts
    const accRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(token)}`);
    const accData = await accRes.json();
    
    const shop = accData?.data?.find((d: any) => d.id === "110414661460391");
    if (shop) {
        console.log("Found Dokuni Shop page token!");
        const pageToken = shop.access_token;
        
        console.log("Testing page token for IG link...");
        const igRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`);
        console.log("IG Info:", await igRes.json());
        
        const igConvRes = await fetch(`https://graph.facebook.com/v19.0/110414661460391/conversations?platform=instagram&limit=1&access_token=${encodeURIComponent(pageToken)}`);
        console.log("IG Conv Info:", await igConvRes.json());
        
        await db().collection("settings").doc("meta").set({
            pageAccessToken: pageToken,
            instagramAccessToken: pageToken
        }, { merge: true });
        
        await db().collection("connectors").doc("instagram").set({
            accessToken: pageToken,
            status: "connected",
            accountLinked: true,
            messagingPermission: "ready",
            messagingStatus: "ready"
        }, { merge: true });
        
        await db().collection("connectors").doc("messenger").set({
            accessToken: pageToken,
            status: "connected",
            messagingPermission: "ready",
            messagingStatus: "ready"
        }, { merge: true });
        
        console.log("Saved the page token as the main token!");
    } else {
        console.log("Dokuni Shop not found in /me/accounts");
        console.log(JSON.stringify(accData, null, 2));
    }

    process.exit(0);
}
run();
