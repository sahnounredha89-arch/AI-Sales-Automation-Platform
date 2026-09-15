import { db } from "./server/firebase";

async function main() {
  const igSnap = await db().collection("connectors").doc("instagram").get();
  console.log("Instagram Connector:", igSnap.exists ? JSON.stringify(igSnap.data(), null, 2) : "DOES NOT EXIST");

  const fbSnap = await db().collection("connectors").doc("messenger").get();
  console.log("Messenger Connector:", fbSnap.exists ? JSON.stringify(fbSnap.data(), null, 2) : "DOES NOT EXIST");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
