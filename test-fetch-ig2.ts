import dotenv from "dotenv";
dotenv.config();

import { getAuthoritativeMetaCredentials } from "./server/services/metaCredentialService";

async function run() {
  const auth = await getAuthoritativeMetaCredentials("instagram");
  const token = auth.accessToken;
  const pageId = auth.pageId || "110414661460391";
  
  const url = `https://graph.facebook.com/v19.0/${pageId}/conversations?platform=instagram&limit=10&fields=id,senders,updated_time,snippet,messages.limit(2){id,message,created_time,from,attachments}&access_token=${encodeURIComponent(token)}`;
  
  const res = await fetch(url);
  const data = await res.json();
  
  if (data.data) {
    console.log(`Fetched ${data.data.length} IG conversations`);
    let pendingCount = 0;
    for (const conv of data.data) {
      if (!conv.messages || !conv.messages.data || conv.messages.data.length === 0) continue;
      const msgs = conv.messages.data;
      const lastMsg = msgs[0];
      const isFromPage = lastMsg.from?.id === pageId || !lastMsg.from; // if it's from the page it might not have 'from' in some IG cases
      
      if (lastMsg.from && lastMsg.from.id !== pageId) {
        pendingCount++;
        console.log(`- Pending IG Conv: ${conv.id} | Customer: ${lastMsg.from?.name || lastMsg.from?.id} | Last msg: "${lastMsg.message}"`);
      } else if (!lastMsg.from) {
        // usually if it's missing 'from', it's from the customer or the business depending on context, let's log it
        console.log(`- Unknown sender IG Conv: ${conv.id} | Last msg: "${lastMsg.message}"`);
      }
    }
    console.log(`Total IG Pending found: ${pendingCount}`);
  } else {
    console.log("Error:", data);
  }
}
run();
