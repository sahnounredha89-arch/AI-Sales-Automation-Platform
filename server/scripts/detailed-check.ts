import { db } from "../firebase";

async function detailedCheck() {
  const convSnap = await db().collection("conversations")
    .where("platform", "==", "messenger")
    .get();

  console.log(`Checking ${convSnap.size} messenger conversations for ANY unreplied customer message...`);

  const unrepliedList: any[] = [];
  const docs = convSnap.docs;
  const chunkSize = 20;

  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (doc) => {
      const data = doc.data();
      const convId = doc.id;

      // Get last 5 messages
      const msgsSnap = await doc.ref.collection("messages").orderBy("timestamp", "desc").limit(5).get();
      if (msgsSnap.empty) return;

      const msgs = msgsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as any[];
      const latest = msgs[0];

      if (latest.direction === "inbound") {
        const pendingInbound: any[] = [];
        for (const m of msgs) {
          if (m.direction === "inbound") {
            pendingInbound.unshift(m);
          } else {
            break;
          }
        }

        unrepliedList.push({
          convId,
          platformUserId: data.platformUserId,
          customerName: data.customerName || latest.sender || "Customer",
          customerId: data.customerId,
          aiEnabled: data.aiEnabled,
          humanHandoff: data.humanHandoff,
          pendingMessages: pendingInbound.map(m => ({
            id: m.id,
            text: m.text,
            type: m.type,
            mediaUrl: m.mediaUrl,
            timestamp: m.timestamp,
          })),
          allRecent: msgs.map(m => `[${m.direction}] ${m.text || m.type}`).reverse(),
        });
      }
    }));
  }

  console.log(`\nFound ${unrepliedList.length} unreplied conversations:\n`);
  for (const item of unrepliedList) {
    console.log(`====================================================`);
    console.log(`Conv ID: ${item.convId}`);
    console.log(`Customer: ${item.customerName} (PSID: ${item.platformUserId})`);
    console.log(`AI Enabled: ${item.aiEnabled} | Human Handoff: ${item.humanHandoff}`);
    console.log(`Pending Inbound Messages:`, item.pendingMessages);
    console.log(`Recent conversation context:`);
    item.allRecent.forEach((r: string) => console.log(`  ${r}`));
  }

  process.exit(0);
}

detailedCheck().catch(err => {
  console.error(err);
  process.exit(1);
});
