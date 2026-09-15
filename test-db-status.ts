import { db } from "./server/firebase";
async function test() {
  const doc = await db().collection("connectors").doc("messenger").get();
  console.log("Messenger status:", doc.data());
  const doc2 = await db().collection("connectors").doc("instagram").get();
  console.log("Instagram status:", doc2.data());
}
test();
