import { conversationStore } from "./server/services/conversationStore";

function test() {
  const msgs1 = conversationStore.getMessages("messenger_39053750634223126", 5);
  console.log("39053750634223126:", JSON.stringify(msgs1, null, 2));
  
  const msgs2 = conversationStore.getMessages("messenger_38465875869725683", 5);
  console.log("38465875869725683:", JSON.stringify(msgs2, null, 2));
  process.exit(0);
}
test();
