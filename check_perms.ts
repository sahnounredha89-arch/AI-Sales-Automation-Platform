import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars, db } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

async function run() {
    const msgRef = db().collection("connectors").doc("messenger");
    const msg = await msgRef.get();
    const msgToken = msg.data()?.accessToken;
    
    if (msgToken) {
        const appId = "1006322732424651";
        const appSecret = "00aa3483853e2ca301992bcaa380e2ec";
        const debugRes = await fetch(`https://graph.facebook.com/debug_token?input_token=${msgToken}&access_token=${appId}|${appSecret}`);
        console.log("Messenger Token Perms:", JSON.stringify((await debugRes.json())?.data?.scopes, null, 2));
    }
    
    process.exit(0);
}
run();
