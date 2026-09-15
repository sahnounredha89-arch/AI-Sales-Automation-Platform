import dotenv from "dotenv";
dotenv.config();

import { sendMetaMessage } from "./server/services/metaService";
import { initFirebaseAdmin } from "./server/firebase";

async function test() {
  initFirebaseAdmin();
  const res = await sendMetaMessage({
    recipientId: "654321", // Just a dummy ID, but should return a different error if it reaches IG endpoint
    text: "Test Instagram message",
    platform: "instagram"
  });
  console.log(res);
  process.exit(0);
}
test();
