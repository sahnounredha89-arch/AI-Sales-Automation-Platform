import { conversationStore } from "./server/services/conversationStore";

function test() {
  const allConvs = conversationStore.getAllConversations();
  const messengerConvs = allConvs.filter(c => c.platform === "messenger");
  
  console.log(`Total Messenger Convs: ${messengerConvs.length}`);
  let pendingCount = 0;
  
  for (const conv of messengerConvs) {
    if (conv.aiEnabled === false || conv.humanHandoff === true) continue;
    
    const msgs = conversationStore.getMessages(conv.id, 5);
    if (msgs.length === 0) continue;
    
    const lastMsg = msgs[msgs.length - 1] as any;
    const isLatestInbound = lastMsg.direction === "inbound" || lastMsg.direction === "incoming";
    
    if (isLatestInbound) {
      pendingCount++;
      console.log(`- Pending Conv: ${conv.id} | Last msg: "${lastMsg.text}"`);
    }
  }
  
  console.log(`Total Pending Messenger: ${pendingCount}`);
  process.exit(0);
}
test();
