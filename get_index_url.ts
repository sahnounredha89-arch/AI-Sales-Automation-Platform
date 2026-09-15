import { db } from "./server/firebase";

async function run() {
  try {
    const firestore = db();
    await firestore.collection("conversations")
      .where("channel", "==", "messenger")
      .orderBy("lastMessageAt", "desc")
      .limit(1)
      .get();
    console.log("No index required or it already exists.");
  } catch (err: any) {
    console.error("Index required! Error:");
    console.error(err.message);
  }
}
run().catch(console.error);
