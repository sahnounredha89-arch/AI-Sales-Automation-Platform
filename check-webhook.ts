import { db, initFirebaseAdmin } from "./server/firebase";

async function test() {
  initFirebaseAdmin();
  try {
    const firestoreDb = db();
    const msgs = await firestoreDb.collection("webhookEvents").orderBy("eventTimestamp", "desc").limit(5).get();
    msgs.forEach(m => console.log(m.data().platform, m.data().eventTimestamp));
  } catch (e) {
    console.log("Error:", e.message);
  }
  process.exit(0);
}
test();
