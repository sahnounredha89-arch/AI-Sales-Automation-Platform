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
        const permsRes = await fetch(`https://graph.facebook.com/v19.0/me/permissions?access_token=${msgToken}`);
        console.log("Messenger Token Perms:", JSON.stringify(await permsRes.json(), null, 2));
    }
    
    process.exit(0);
}
run();
