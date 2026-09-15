import { conversationStore } from "./server/services/conversationStore";

function test() {
  const allConvs = conversationStore.getAllConversations();
  const messengerConvs = allConvs.filter(c => c.platform === "messenger");
  
  let unrepliedCount = 0;
  for (const conv of messengerConvs) {
    const msgs = conversationStore.getMessages(conv.id, 5);
    if (msgs.length === 0) continue;
    const lastMsg = msgs[msgs.length - 1] as any;
    if (lastMsg.direction === "inbound") {
      unrepliedCount++;
      console.log(`Unreplied Conv: ${conv.id} - ${lastMsg.text}`);
    }
  }
  console.log(`Total Unreplied: ${unrepliedCount}`);
  process.exit(0);
}
test();
