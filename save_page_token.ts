import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars, db } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

const pageToken = "EAARUqn0q1IUBSUnaBvsfND6nPGpIk1lzvlTrXpJ4FnrpTOPehxpnUMA9iePDrojgAgRKYekg89ZBMZBReoG7IZAjL0ZBwZAdV1Odu3CZBFvqV9qTPUdfeMDb9WZCQr5fmM7otljcTSIVDEyjMu8oOAk8lyn9UWRz3jCFiwIHFZBOXsmVo1ZCl2CmNl9ReOVElgcEZCpTZAhNwIZD";
const newAppId = "1218991127975045";
const newAppSecret = "bfe7e335d2484e773add1ac334c276b2";

async function run() {
    // Update messenger (it has pages_messaging so it will work)
    await db().collection("connectors").doc("messenger").set({
        accessToken: pageToken,
        appId: newAppId,
        appSecret: newAppSecret,
        status: "connected",
        messagingPermission: "ready",
        messagingStatus: "ready"
    }, { merge: true });

    // Update instagram (it lacks permissions so it fails)
    await db().collection("connectors").doc("instagram").set({
        accessToken: pageToken,
        appId: newAppId,
        appSecret: newAppSecret,
        status: "connected", 
        accountLinked: false,
        messagingPermission: "missing",
        messagingStatus: "not_ready"
    }, { merge: true });

    await db().collection("settings").doc("meta").set({
        pageAccessToken: pageToken,
        appId: newAppId,
        appSecret: newAppSecret
    }, { merge: true });

    console.log("Tokens saved to DB");
    process.exit(0);
}
run();
