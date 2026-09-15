import { subscribePageToWebhooks } from "./server/services/metaService";
import { initFirebaseAdmin } from "./server/firebase";

async function run() {
  initFirebaseAdmin();
  const res = await subscribePageToWebhooks();
  console.log("Sub:", res);
}
run();
