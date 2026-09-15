import dotenv from "dotenv";
dotenv.config({ override: true });
import { getEnvVars } from "./server/firebase";
const envVars = getEnvVars();
process.env.FIREBASE_PROJECT_ID = envVars.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = envVars.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = envVars.FIREBASE_PRIVATE_KEY;

import { getAuthoritativeMetaCredentials, getSafeTokenMetadata } from "./server/services/metaCredentialService";

async function run() {
  const auth = await getAuthoritativeMetaCredentials("messenger");
  const meta = getSafeTokenMetadata(auth.accessToken);
  console.log("Authoritative token source:", auth.source);
  console.log("Prefix:", meta.prefix);
  
  // Test if it's a user token or page token
  const checkRes = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${auth.accessToken}`);
  const data = await checkRes.json();
  console.log("Token identity:", data);
}
run().then(()=>process.exit(0)).catch(console.error);
