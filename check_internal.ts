import dotenv from "dotenv";
dotenv.config({ override: true });
import { db } from "./server/firebase";

async function run() {
  const firestore = db();
  console.log("Checking Firestore...");
  const snapshot = await firestore.collection("conversations")
    .doc("messenger_9999999999")
    .collection("messages")
    .orderBy("timestamp", "desc")
    .limit(5)
    .get();

  if (snapshot.empty) {
    console.log("No messages found.");
  } else {
    snapshot.forEach(doc => {
       const data = doc.data();
       console.log(`[${data.direction.toUpperCase()}] ${data.sender}: ${data.text}`);
    });
  }
}
run().catch(console.error);
