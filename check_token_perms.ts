import dotenv from "dotenv";
dotenv.config({ override: true });
import { getAuthoritativeMetaCredentials } from "./server/services/metaCredentialService";

async function run() {
  const auth = await getAuthoritativeMetaCredentials("messenger");
  const token = auth.accessToken;
  console.log("Token:", token?.substring(0, 15) + "...");
  
  const res = await fetch(`https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
run().then(()=>process.exit(0));
