import { replyAllUnrepliedMessages } from "./server/services/salesAgent";
import { initFirebaseAdmin } from "./server/firebase";

async function run() {
  initFirebaseAdmin();
  const res = await replyAllUnrepliedMessages("instagram");
  console.log("CRON RESULT:", res);
  process.exit(0);
}
run();
