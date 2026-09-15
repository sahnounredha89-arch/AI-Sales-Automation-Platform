import { restoreSecrets } from "./server/syncSecrets";
import { initFirebaseAdmin } from "./server/firebase";

async function run() {
  initFirebaseAdmin();
  await restoreSecrets();
  console.log("Restored secrets");
}
run();
