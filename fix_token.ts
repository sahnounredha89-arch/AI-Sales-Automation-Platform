import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

import { db } from "./server/firebase";
import { getAuthoritativeMetaCredentials } from "./server/services/metaCredentialService";

async function run() {
  const auth = await getAuthoritativeMetaCredentials("messenger");
  const userToken = auth.accessToken;
  if (!userToken) {
    console.log("No token found.");
    return;
  }
  
  console.log("Fetching accounts (pages) for this user token...");
  const accountsUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`;
  const res = await fetch(accountsUrl);
  const data = await res.json();
  
  if (data.error) {
    console.log("Error fetching accounts:", data.error);
    return;
  }
  
  const pages = data.data || [];
  console.log(`Found ${pages.length} pages.`);
  
  const dokuni = pages.find((p: any) => p.id === "110414661460391" || p.name.includes("Dokuni"));
  if (dokuni) {
    console.log("Found Dokuni Shop:", dokuni.name, dokuni.id);
    const pageToken = dokuni.access_token;
    
    // Save to Firestore!
    await db().collection("settings").doc("meta_credentials").set({
      messenger_access_token: pageToken,
      messenger_page_id: dokuni.id,
      messenger_page_name: dokuni.name,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log("Saved definitive Page Access Token to Firestore.");
    
    // Subscribe page to webhooks
    console.log("Subscribing page to webhooks...");
    const subRes = await fetch(`https://graph.facebook.com/v19.0/${dokuni.id}/subscribed_apps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscribed_fields: "messages,messaging_postbacks",
        access_token: pageToken
      })
    });
    const subData = await subRes.json();
    console.log("Subscribe result:", JSON.stringify(subData, null, 2));
    
  } else {
    console.log("Dokuni Shop not found in the user's accounts.");
    console.log(JSON.stringify(pages, null, 2));
  }
}
run().then(()=>process.exit(0)).catch(console.error);
