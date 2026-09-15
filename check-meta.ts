import { testFacebookConnection } from "./server/services/metaService";
import { initFirebaseAdmin } from "./server/firebase";

async function main() {
  initFirebaseAdmin();
  const res = await testFacebookConnection();
  console.log("Result:", res);
  process.exit(0);
}
main();
