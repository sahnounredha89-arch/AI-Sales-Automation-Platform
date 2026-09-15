import { getAuthoritativeMetaCredentials } from "./server/services/metaCredentialService";
async function test() {
  const auth = await getAuthoritativeMetaCredentials("messenger");
  const token = auth.accessToken;
  const res = await fetch(`https://graph.facebook.com/v19.0/debug_token?input_token=${token}&access_token=${token}`);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
