import { conversationStore } from "./server/services/conversationStore";

function test() {
  const allConvs = conversationStore.getAllConversations();
  const messengerConvs = allConvs.filter(c => c.platform === "messenger");
  
  for (const conv of messengerConvs) {
    const msgs = conversationStore.getMessages(conv.id, 5);
    if (msgs.length === 0) {
      console.log(`Conv ${conv.id} - NO MESSAGES`);
      continue;
    }
    const lastMsg = msgs[msgs.length - 1] as any;
    console.log(`Conv ${conv.id} - Last Msg [${lastMsg.direction}]: ${lastMsg.text} (aiEnabled: ${conv.aiEnabled}, humanHandoff: ${conv.humanHandoff})`);
  }
  process.exit(0);
}
test();
