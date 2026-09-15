import dotenv from "dotenv";
dotenv.config();

import { sendMetaMessage } from "./server/services/metaService";
import { initFirebaseAdmin } from "./server/firebase";

async function test() {
  initFirebaseAdmin();
  const res = await sendMetaMessage({
    recipientId: "38465875869725683", // The customer ID of "طيب بن يحي منير"
    text: "عذرا، هل يمكنني مساعدتك الآن؟ (Test Message)",
    platform: "messenger"
  });
  console.log(res);
  process.exit(0);
}
test();
