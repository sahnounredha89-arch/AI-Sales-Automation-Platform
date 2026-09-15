import { getAuthoritativeMetaCredentials } from "./server/services/metaCredentialService";

async function test() {
  const auth = await getAuthoritativeMetaCredentials("messenger");
  const token = auth.accessToken;
  
  const debugUrl = `https://graph.facebook.com/v19.0/debug_token?input_token=${token}&access_token=${token}`;
  const res = await fetch(debugUrl);
  const data = await res.json();
  console.log("Scopes:", data.data.scopes);
}
test();
