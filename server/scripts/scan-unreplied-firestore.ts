import { db } from "../firebase";

async function scan() {
  console.log("=== Scanning Firestore Messenger Conversations for Unreplied Messages ===");
  const convSnap = await db().collection("conversations")
    .where("platform", "==", "messenger")
    .get();

  console.log(`Total Messenger conversations: ${convSnap.size}`);

  const unreplied: any[] = [];
  const replied: any[] = [];

  const docs = convSnap.docs;
  const chunkSize = 15;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (doc) => {
      const data = doc.data();
      const convId = doc.id;
      // Get the last 2 messages
      const msgsSnap = await doc.ref.collection("messages").orderBy("timestamp", "desc").limit(2).get();
      if (msgsSnap.empty) return;

      const latestDoc = msgsSnap.docs[0];
      const latest = latestDoc.data();

      if (latest.direction === "inbound") {
        unreplied.push({
          convId,
          platformUserId: data.platformUserId,
          customerName: data.customerName || latest.sender || "Customer",
          aiEnabled: data.aiEnabled !== false,
          humanHandoff: data.humanHandoff === true,
          lastMsgText: latest.text,
          lastMsgTime: latest.timestamp,
        });
      } else {
        replied.push({
          convId,
          customerName: data.customerName || "Customer",
          lastReply: latest.text?.slice(0, 40),
          lastTime: latest.timestamp,
        });
      }
    }));
  }

  console.log(`\nFound ${unreplied.length} UNREPLIED conversations:`);
  for (const item of unreplied) {
    console.log(`- Conv ${item.convId} | Customer: ${item.customerName} (PSID: ${item.platformUserId})`);
    console.log(`  aiEnabled: ${item.aiEnabled} | humanHandoff: ${item.humanHandoff}`);
    console.log(`  Last Message (${item.lastMsgTime}): "${item.lastMsgText}"`);
  }

  console.log(`\nTotal replied conversations: ${replied.length}`);
  process.exit(0);
}

scan().catch(err => {
  console.error(err);
  process.exit(1);
});
