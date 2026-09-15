import { db, initFirebaseAdmin } from "./server/firebase";

async function test() {
  initFirebaseAdmin();
  const firestoreDb = db();
  const doc = await firestoreDb.collection("diagnostics").doc("lastMetaMessage").get();
  console.log(doc.data());
  process.exit(0);
}
test();
