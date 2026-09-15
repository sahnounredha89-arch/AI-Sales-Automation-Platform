import { syncMetaConversations } from "./server/services/metaService";
import { initFirebaseAdmin } from "./server/firebase";

async function run() {
  initFirebaseAdmin();
  const res = await syncMetaConversations("messenger");
  console.log("Sync result:", res);
  process.exit(0);
}
run();
