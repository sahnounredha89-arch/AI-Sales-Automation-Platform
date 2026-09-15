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
    
    const igToken = ig.data()?.accessToken;
    const msgToken = msg.data()?.accessToken;
    
    console.log("Testing Messenger Token:");
    if (msgToken) {
        const msgRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,instagram_business_account{id,username}&access_token=${msgToken}`);
        console.log(await msgRes.json());
    }

    console.log("\nTesting Instagram Token:");
    if (igToken) {
        const igRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,instagram_business_account{id,username}&access_token=${igToken}`);
        console.log(await igRes.json());
    }
    
    process.exit(0);
}
run();
