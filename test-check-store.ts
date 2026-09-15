import { conversationStore } from "./server/services/conversationStore";

async function test() {
  const convs = conversationStore.getAllConversations().filter(c => c.platform === "instagram");
  console.log(`Found ${convs.length} IG convs in local store`);
  
  for (const c of convs.slice(0, 3)) {
    console.log("Conv:", c.id, c.platformUserId, c.status);
    const msgs = conversationStore.getMessages(c.id, 5);
    msgs.forEach((m: any) => {
       console.log("  - Msg:", m.id, m.direction, m.text, m.processingStatus, m.error);
    });
  }
  process.exit(0);
}
test();
