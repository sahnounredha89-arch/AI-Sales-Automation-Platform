import { getAuthoritativeMetaCredentials } from "./server/services/metaCredentialService";

async function test() {
  const auth = await getAuthoritativeMetaCredentials("messenger");
  const token = auth.accessToken;
  const pageId = auth.pageId || "110414661460391";
  
  const url = `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps?access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log("Subscribed apps:", JSON.stringify(data, null, 2));
}
test();
