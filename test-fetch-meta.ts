import dotenv from "dotenv";
dotenv.config();

import { getAuthoritativeMetaCredentials } from "./server/services/metaCredentialService";
import { conversationStore } from "./server/services/conversationStore";

async function run() {
  const auth = await getAuthoritativeMetaCredentials("messenger");
  const token = auth.accessToken;
  const pageId = auth.pageId || "110414661460391";
  
  const url = `https://graph.facebook.com/v19.0/${pageId}/conversations?platform=messenger&limit=25&fields=id,senders,updated_time,snippet,messages.limit(5){id,message,created_time,from,attachments}&access_token=${encodeURIComponent(token)}`;
  
  const res = await fetch(url);
  const data = await res.json();
  
  if (data.data) {
    console.log(`Fetched ${data.data.length} conversations`);
    let pendingCount = 0;
    
    for (const conv of data.data) {
      if (!conv.messages || !conv.messages.data || conv.messages.data.length === 0) continue;
      const msgs = conv.messages.data;
      
      const lastMsg = msgs[0];
      const isFromPage = lastMsg.from?.id === pageId;
      
      if (!isFromPage) {
        pendingCount++;
        console.log(`- Pending Conv: ${conv.id} | Customer: ${lastMsg.from?.name} | Last msg: "${lastMsg.message}" | Time: ${lastMsg.created_time}`);
        
        const customerId = lastMsg.from?.id;
        if (customerId) {
           conversationStore.upsertConversation({
              id: `messenger_${customerId}`,
              customerId: `cust_${customerId}`,
              customerName: lastMsg.from?.name,
              platform: "messenger",
              platformUserId: customerId,
              status: "active",
              aiEnabled: true,
              humanHandoff: false,
              unreadCount: 1,
              lastMessageAt: lastMsg.created_time,
              createdAt: lastMsg.created_time,
              updatedAt: lastMsg.created_time,
              snippet: lastMsg.message,
              channel: "messenger",
              source: "meta_messenger",
              origin: "production",
              isTest: false,
           });
           
           conversationStore.addMessage(`messenger_${customerId}`, {
             id: `msg_${lastMsg.id}`,
             conversationId: `messenger_${customerId}`,
             direction: "inbound",
             sender: lastMsg.from?.name,
             type: "text",
             text: lastMsg.message || "[Media]",
             mediaUrl: null,
             timestamp: lastMsg.created_time,
             platformMessageId: lastMsg.id,
             channel: "messenger",
             source: "meta_messenger",
             origin: "production",
             isTest: false,
           });
        }
      }
    }
    console.log(`Total Pending found: ${pendingCount}`);
    
    if (pendingCount > 0) {
      // Trigger the reply cycle now that they are added to the cache
      console.log("Triggering reply engine...");
    }
  } else {
    console.log("Error:", data);
  }
}
run();
