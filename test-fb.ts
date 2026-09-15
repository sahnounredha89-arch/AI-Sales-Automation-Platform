import { initFirebaseAdmin, db } from "./server/firebase";
async function test() {
  initFirebaseAdmin();
  try {
    const firestore = db();
    const snap = await firestore.collection("products").limit(1).get();
    console.log("Success! Products:", snap.size);
  } catch (e: any) {
    console.error("Test Error:", e.message);
  }
}
test();
