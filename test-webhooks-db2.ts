import { db } from "./server/firebase";
async function test() {
  const q = await db().collection("webhookEvents").orderBy("eventTimestamp", "desc").limit(5).get();
  q.forEach(doc => console.log(doc.id, doc.data()));
}
test();
