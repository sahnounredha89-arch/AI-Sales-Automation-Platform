import { db } from "../firebase";
import { generateSalesAgentResponse } from "../services/salesAgent";
import { sendMetaMessage, getMetaConfig } from "../services/metaService";

interface ProcessResult {
  convId: string;
  customerName: string;
  platformUserId: string;
  customerMessage: string;
  replyText: string;
  modelUsed: string;
  metaSent: boolean;
  metaError?: string;
}

export async function processAllUnreplied(targetPlatform = "messenger"): Promise<{
  totalChecked: number;
  unrepliedFound: number;
  repliedCount: number;
  results: ProcessResult[];
}> {
  console.log(`[Batch Reply] Starting scan for unreplied ${targetPlatform} conversations...`);

  const convSnap = await db().collection("conversations")
    .where("platform", "==", targetPlatform)
    .get();

  console.log(`[Batch Reply] Found ${convSnap.size} total conversations.`);

  const unrepliedConversations: any[] = [];
  const docs = convSnap.docs;
  const chunkSize = 20;

  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (doc) => {
      const data = doc.data();
      const convId = doc.id;

      // Skip if AI disabled or human handoff active
      if (data.aiEnabled === false || data.humanHandoff === true) {
        return;
      }

      // Fetch last 3 messages to determine state
      const msgsSnap = await doc.ref.collection("messages")
        .orderBy("timestamp", "desc")
        .limit(3)
        .get();

      if (msgsSnap.empty) return;

      const msgs = msgsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as any[];
      const latest = msgs[0];

      // Check if last message was from the customer
      if (latest.direction === "inbound" || latest.direction === "incoming") {
        unrepliedConversations.push({
          convId,
          convData: data,
          lastMsg: latest,
        });
      }
    }));
  }

  console.log(`[Batch Reply] Found ${unrepliedConversations.length} unreplied conversations!`);

  const results: ProcessResult[] = [];

  // Process sequentially to be gentle on rate limits and quota
  for (const item of unrepliedConversations) {
    const { convId, convData, lastMsg } = item;
    const customerName = convData.customerName || lastMsg.sender || "Customer";
    const platformUserId = convData.platformUserId;
    const customerId = convData.customerId || `cust_${platformUserId}`;
    const userText = lastMsg.text || (lastMsg.type === "image" ? "Photo attachment / Reçu de paiement" : "Salam");

    console.log(`\n--------------------------------------------------`);
    console.log(`Processing Conv ${convId} for ${customerName} (PSID: ${platformUserId})`);
    console.log(`Inbound text: "${userText}"`);

    try {
      // 1. Generate AI sales response using Gemini Flash-Lite / Fallback / Deterministic
      const genResult = await generateSalesAgentResponse(convId, customerId, userText);
      const replyText = genResult.responseText;
      const modelUsed = genResult.modelUsed;

      console.log(`AI Response (${modelUsed}): "${replyText}"`);

      // 2. Deliver to Meta Messenger platform
      let metaSent = false;
      let metaError: string | undefined;

      if (platformUserId && platformUserId !== "123456" && !platformUserId.startsWith("test_")) {
        try {
          const metaRes = await sendMetaMessage({
            recipientId: platformUserId,
            text: replyText,
            platform: targetPlatform,
          });

          if (metaRes.ok) {
            metaSent = true;
            console.log(`✓ Delivered to Meta Messenger (Msg ID: ${metaRes.message_id})`);
          } else {
            metaError = metaRes.error;
            console.warn(`⚠ Meta Graph delivery notice: ${metaRes.error}`);
          }
        } catch (mErr: any) {
          metaError = mErr.message;
          console.warn(`⚠ Meta Graph API send error: ${mErr.message}`);
        }
      } else {
        console.log(`(Test user ID ${platformUserId}, skipped external Meta call)`);
      }

      // 3. Save outbound response to Firestore
      const now = new Date().toISOString();
      await db().collection("conversations").doc(convId).collection("messages").add({
        conversationId: convId,
        direction: "outbound",
        sender: "ai",
        type: "text",
        text: replyText,
        timestamp: now,
        modelUsed,
        metaSent,
        ...(metaError ? { metaError } : {}),
      });

      // 4. Update conversation metadata
      await db().collection("conversations").doc(convId).update({
        snippet: replyText.slice(0, 120),
        lastMessageAt: now,
        updatedAt: now,
        unreadCount: 0,
      });

      results.push({
        convId,
        customerName,
        platformUserId,
        customerMessage: userText,
        replyText,
        modelUsed,
        metaSent,
        metaError,
      });

      // Brief delay between requests to be gentle on quota
      await new Promise(r => setTimeout(r, 600));

    } catch (procErr: any) {
      console.error(`Error processing conversation ${convId}:`, procErr.message || procErr);
    }
  }

  console.log(`\n==================================================`);
  console.log(`[Batch Reply Complete] Successfully replied to ${results.length} of ${unrepliedConversations.length} unreplied conversations.`);

  return {
    totalChecked: convSnap.size,
    unrepliedFound: unrepliedConversations.length,
    repliedCount: results.length,
    results,
  };
}

// Allow direct execution
if (process.argv[1]?.endsWith("execute-reply-unreplied.ts")) {
  processAllUnreplied("messenger")
    .then((summary) => {
      console.log("\nSummary:", JSON.stringify(summary, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
