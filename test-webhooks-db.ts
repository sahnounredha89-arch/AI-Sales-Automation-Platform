import { db } from "./server/firebase";
async function test() {
  const diag = await db().collection("diagnostics").doc("lastMetaMessage").get();
  console.log("lastMetaMessage:", diag.data());
}
test();
