import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars, db } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

async function run() {
    const igRef = db().collection("connectors").doc("instagram");
    const ig = await igRef.get();
    
    const msgRef = db().collection("connectors").doc("messenger");
    const msg = await msgRef.get();
    
    const igData = ig.data();
    const msgData = msg.data();
    
    console.log("IG Token:", igData?.accessToken ? "Exists" : "Missing");
    console.log("MSG Token:", msgData?.accessToken ? "Exists" : "Missing");
    
    const token = igData?.accessToken || msgData?.accessToken;
    
    if (token) {
        // test /me
        const meRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,instagram_business_account{id,username}&access_token=${token}`);
        const meData = await meRes.json();
        console.log("/me:", JSON.stringify(meData, null, 2));
        
        // Let's also check permissions
        const appSecret = process.env.META_APP_SECRET || igData?.appSecret || msgData?.appSecret;
        const appId = process.env.META_APP_ID || igData?.appId || msgData?.appId;
        
        if (appId && appSecret) {
            const debugRes = await fetch(`https://graph.facebook.com/debug_token?input_token=${token}&access_token=${appId}|${appSecret}`);
            const debugData = await debugRes.json();
            console.log("/debug_token permissions:", debugData?.data?.scopes);
        } else {
            console.log("No appSecret/appId to debug token.");
        }
    }
    
    process.exit(0);
}
run();
