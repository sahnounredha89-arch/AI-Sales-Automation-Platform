import { db } from "./server/firebase";

async function main() {
  try {
    const snap = await db().collection("connectors").limit(1).get();
    console.log("Firestore success! Docs count:", snap.docs.length);
  } catch (err: any) {
    console.log("Firestore error code:", err.code, err.message);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
