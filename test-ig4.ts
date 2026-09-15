import { getAuthoritativeMetaCredentials } from "./server/services/metaCredentialService";

async function test() {
  const auth = await getAuthoritativeMetaCredentials("messenger");
  const token = auth.accessToken;
  const pageId = auth.pageId || "110414661460391";
  
  const igUrl = `https://graph.facebook.com/v19.0/${pageId}/conversations?platform=instagram&limit=2&fields=id,updated_time,snippet,senders&access_token=${encodeURIComponent(token!)}`;
  console.log("Fetching...", igUrl);
  
  const res = await fetch(igUrl);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
