import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;
import { getAuthoritativeMetaCredentials } from "./server/services/metaCredentialService";
async function run() {
  const auth = await getAuthoritativeMetaCredentials("messenger");
  console.log("Token starts with:", auth.accessToken?.substring(0, 15));
  const res = await fetch(`https://graph.facebook.com/v19.0/${auth.pageId}/subscribed_apps?access_token=${auth.accessToken}`);
  const data = await res.json();
  console.log("Subscriptions:", JSON.stringify(data.data));
}
run().then(()=>process.exit(0));
