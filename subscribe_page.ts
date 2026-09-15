import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

import { getAuthoritativeMetaCredentials } from "./server/services/metaCredentialService";

async function run() {
  console.log("Checking Meta Page Subscription...");
  const auth = await getAuthoritativeMetaCredentials("messenger");
  if (!auth.accessToken || !auth.pageId) {
    console.log("Missing token or page ID.");
    return;
  }
  
  const token = auth.accessToken;
  const pageId = auth.pageId;
  
  // 1. Check current subscriptions
  console.log("Fetching current subscriptions...");
  const checkRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/subscribed_apps?access_token=${encodeURIComponent(token)}`);
  const checkData = await checkRes.json();
  console.log("Current subscriptions:", JSON.stringify(checkData, null, 2));
  
  // 2. Add subscription if missing
  console.log("\nAttempting to subscribe page to app webhooks (messages, messaging_postbacks)...");
  const subRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscribed_fields: "messages,messaging_postbacks",
      access_token: token
    })
  });
  
  const subData = await subRes.json();
  console.log("Subscribe result:", JSON.stringify(subData, null, 2));
}
run().then(()=>process.exit(0)).catch(console.error);
