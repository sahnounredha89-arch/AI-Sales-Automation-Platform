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
    
    const url = `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const data: any = await res.json();
    console.log("me data:", data);

    const igConvUrl = `https://graph.facebook.com/v19.0/${data.id}/conversations?platform=instagram&limit=1&access_token=${encodeURIComponent(token)}`;
    console.log("Fetching:", igConvUrl.substring(0, 50) + "...");
    const igConvRes = await fetch(igConvUrl);
    const igConvData: any = await igConvRes.json();
    
    console.log("igConvData:", JSON.stringify(igConvData, null, 2));

    process.exit(0);
}
run();
