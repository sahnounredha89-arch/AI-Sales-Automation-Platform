import { testFacebookConnection, testInstagramConnection } from "./server/services/metaService";
import { initFirebaseAdmin } from "./server/firebase";

async function test() {
  initFirebaseAdmin();
  const res1 = await testFacebookConnection();
  console.log("Facebook:", res1);
  const res2 = await testInstagramConnection();
  console.log("Instagram:", res2);
}
test();
