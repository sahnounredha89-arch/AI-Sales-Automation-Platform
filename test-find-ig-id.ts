import { db, initFirebaseAdmin } from "./server/firebase";

async function test() {
  initFirebaseAdmin();
  const firestoreDb = db();
  const msgs = await firestoreDb.collection("webhookEvents").where("platform", "==", "instagram").orderBy("eventTimestamp", "desc").limit(5).get();
  msgs.forEach(m => console.log("ID:", m.id, m.data().senderPsid, m.data().text));
  process.exit(0);
}
test();
