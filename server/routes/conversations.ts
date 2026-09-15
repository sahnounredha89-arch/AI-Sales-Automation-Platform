import { Router } from "express";
import { db } from "../firebase";
import { requireAdmin } from "../middleware/auth";
import { processMessageAsAdmin, handleCustomerMessage, replyAllUnrepliedMessages } from "../services/salesAgent";
import { sendMessage, isTelegramConfigured } from "../services/telegramService";
import { sendMetaMessage, syncMetaConversations } from "../services/metaService";
import { conversationStore } from "../services/conversationStore";

const router = Router();

router.get("/", requireAdmin, async (req, res) => {
  try {
    const sourceFilter = req.query.source as string | undefined;
    const platformFilter = req.query.platform as string | undefined;
    const includeTest = req.query.includeTest === "true";

    let dbList: any[] = [];
    try {
      let query: any = db().collection("conversations");
      if (sourceFilter) {
        query = query.where("source", "==", sourceFilter);
      } else if (platformFilter && platformFilter !== "all") {
        query = query.where("platform", "==", platformFilter);
      }
      
      const snapshot = await query.get();
      
      // Batch lookup all customers
      const custSnap = await db().collection("customers").get().catch(() => null);
      const customerMap = new Map<string, any>();
      if (custSnap) {
        custSnap.docs.forEach(doc => {
          customerMap.set(doc.id, doc.data());
        });
      }

      dbList = snapshot.docs
        .filter((doc: any) => {
          const data = doc.data();
          if (!includeTest && (data.isTest === true || data.origin === "test" || data.platform === "simulator" || data.channel === "simulator" || doc.id.startsWith("conv_test") || data.customerName?.toLowerCase().includes("test 100 messages"))) {
            return false;
          }
          return true;
        })
        .map((doc: any) => {
          const data = doc.data();
          let customerName = data.customerName || "Customer";
          let customerUsername = data.customerUsername || "";
          let customerPhone = data.customerPhone || "";

          if (data.customerId && customerMap.has(data.customerId)) {
            const cData = customerMap.get(data.customerId);
            customerName = cData?.name || cData?.username || customerName;
            customerUsername = cData?.username || "";
            customerPhone = cData?.phone || "";
          }

          return {
            id: doc.id,
            ...data,
            customerName,
            customerUsername,
            customerPhone,
            snippet: data.snippet || "",
          };
        });
    } catch (dbErr: any) {
      console.warn("[Conversations] Firestore query notice, using resilient store:", dbErr?.message);
    }

    // Merge with conversationStore
    const storeList = conversationStore.getAllConversations().filter(c => {
      if (sourceFilter && c.source !== sourceFilter) return false;
      if (platformFilter && platformFilter !== "all" && c.platform !== platformFilter) return false;
      if (!includeTest && (c.isTest === true || c.origin === "test" || c.platform === "simulator")) return false;
      return true;
    });

    const combinedMap = new Map<string, any>();
    for (const item of storeList) {
      combinedMap.set(item.id, item);
    }
    for (const item of dbList) {
      combinedMap.set(item.id, { ...(combinedMap.get(item.id) || {}), ...item });
    }

    const conversations = Array.from(combinedMap.values()).sort((a: any, b: any) => {
      const timeA = new Date(a.lastMessageAt || a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.lastMessageAt || b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    res.json(conversations);
  } catch (error: any) {
    console.error("Error fetching conversations:", error);
    res.json(conversationStore.getAllConversations());
  }
});

router.get("/:id/messages", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const includeTest = req.query.includeTest === "true";
    const limitNum = Math.min(Math.max(parseInt(req.query.limit as string) || 30, 1), 100);

    let messages: any[] = [];
    try {
      const snapshot = await db()
        .collection("conversations")
        .doc(id)
        .collection("messages")
        .orderBy("timestamp", "desc")
        .limit(limitNum)
        .get();

      messages = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((m: any) => {
          if (!includeTest && (m.isTest === true || m.origin === "test" || m.source === "simulator" || m.channel === "simulator")) {
            return false;
          }
          return true;
        });
    } catch (dbErr: any) {
      console.warn("[Messages] Firestore query notice, using store:", dbErr?.message);
    }

    // Merge with conversationStore
    const storeMsgs = conversationStore.getMessages(id, limitNum);
    const msgMap = new Map<string, any>();
    for (const m of storeMsgs) {
      msgMap.set(m.id, m);
    }
    for (const m of messages) {
      msgMap.set(m.id, { ...(msgMap.get(m.id) || {}), ...m });
    }

    const result = Array.from(msgMap.values()).sort((a: any, b: any) => {
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      return timeA - timeB;
    });

    res.json(result);
  } catch (error: any) {
    console.error("Error fetching messages:", error);
    res.json(conversationStore.getMessages(req.params.id, 50));
  }
});

router.post("/:id/handoff", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { humanHandoff } = req.body; // boolean
    
    await db().collection("conversations").doc(id).update({
      humanHandoff,
      aiEnabled: !humanHandoff,
      updatedAt: new Date().toISOString()
    });
    
    res.json({ success: true, humanHandoff, aiEnabled: !humanHandoff });
  } catch (error: any) {
    console.error("Error updating handoff:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.post("/:id/messages", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    
    if (!text) return res.status(400).json({ error: "Text is required" });
    
    const message = await processMessageAsAdmin(id, text, req.session.username || "Admin");

    // Forward outbound admin message to the respective platform
    let deliveredToPlatform = false;
    let platformError: string | null = null;
    let platformMessageId: string | null = null;

    try {
      const convDoc = await db().collection("conversations").doc(id).get();
      if (convDoc.exists) {
        const convData = convDoc.data()!;
        
        // 1. Telegram
        if (convData.platform === "telegram" && convData.platformConversationId && isTelegramConfigured()) {
          const sent = await sendMessage(convData.platformConversationId, text);
          if (sent?.message_id) {
            platformMessageId = String(sent.message_id);
            deliveredToPlatform = true;
          }
        }

        // 2. Meta: Facebook Messenger or Instagram Direct
        if (convData.platform === "messenger" || convData.platform === "instagram") {
          // Resolve customer's real PSID
          let recipientPsid = convData.platformUserId;
          if ((!recipientPsid || recipientPsid.startsWith("t_")) && convData.customerId) {
            const custDoc = await db().collection("customers").doc(convData.customerId).get();
            if (custDoc.exists) {
              recipientPsid = custDoc.data()?.platformUserId;
            }
          }

          if (recipientPsid && !recipientPsid.startsWith("t_")) {
            const sentMeta = await sendMetaMessage({
              recipientId: recipientPsid,
              text,
              platform: convData.platform,
            });

            if (sentMeta.ok && sentMeta.message_id) {
              platformMessageId = String(sentMeta.message_id);
              deliveredToPlatform = true;
            } else {
              platformError = sentMeta.error || "Meta delivery failed";
              console.warn(`[Conversations] Meta send warning for conv ${id}:`, platformError);
            }
          } else {
            platformError = "Customer PSID is not available for this Meta conversation.";
            console.warn(`[Conversations] Cannot deliver: No valid PSID for conv ${id}`);
          }
        }

        if (platformMessageId || platformError) {
          await db().collection("conversations").doc(id).collection("messages").doc(message.id).update({
            ...(platformMessageId ? { platformMessageId } : {}),
            ...(platformError ? { platformError } : {}),
          });
        }
      }
    } catch (fwdErr: any) {
      console.warn("[Conversations] Could not forward admin message to external platform:", fwdErr.message);
      platformError = fwdErr.message;
    }

    res.json({
      ...message,
      ...(platformMessageId ? { platformMessageId } : {}),
      deliveredToPlatform,
      platformError,
    });
  } catch (error: any) {
    console.error("Error sending admin message:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * Trigger real-time sync with Meta Graph API to fetch active conversations
 */
router.post("/sync-meta", requireAdmin, async (req, res) => {
  try {
    const result = await syncMetaConversations();
    res.json(result);
  } catch (error: any) {
    console.error("Error syncing Meta conversations:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Alias /load-meta to real sync-meta so any legacy UI trigger executes a real Graph API sync
router.post("/load-meta", requireAdmin, async (req, res) => {
  try {
    const result = await syncMetaConversations();
    res.json(result);
  } catch (error: any) {
    console.error("Error loading Meta conversations:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * Trigger AI sales agent to reply to all unreplied messages (Messenger, Instagram, or all)
 */
router.post("/reply-unreplied", requireAdmin, async (req, res) => {
  try {
    const platform = (req.body.platform as string) || "all";
    if (platform === "all") {
      const msgRes = await replyAllUnrepliedMessages("messenger");
      const igRes = await replyAllUnrepliedMessages("instagram");
      res.json({
        totalChecked: (msgRes?.totalChecked || 0) + (igRes?.totalChecked || 0),
        unrepliedFound: (msgRes?.unrepliedFound || 0) + (igRes?.unrepliedFound || 0),
        repliedCount: (msgRes?.repliedCount || 0) + (igRes?.repliedCount || 0),
        message: `Processed: Messenger (${msgRes?.repliedCount || 0} replied), Instagram (${igRes?.repliedCount || 0} replied)`,
      });
    } else {
      const result = await replyAllUnrepliedMessages(platform);
      res.json(result);
    }
  } catch (error: any) {
    console.error("Error replying to unreplied messages:", error);
    res.status(500).json({ error: error.message || "Failed to process unreplied messages" });
  }
});

// Simulate a customer message to test the AI sales agent directly from the dashboard
router.post("/simulate-message", requireAdmin, async (req, res) => {
  try {
    const { platformUserId, name = "Customer", text, platform: requestedPlatform } = req.body;
    const platform = requestedPlatform === "instagram" ? "instagram" : (requestedPlatform === "messenger" ? "messenger" : "simulator");
    if (!text) return res.status(400).json({ error: "Text is required" });

    const simUserId = platformUserId || (`${platform}_user_` + Date.now().toString().slice(-4));
    
    const result = await handleCustomerMessage({
      isTest: platform === "simulator",
      platform,
      platformUserId: simUserId,
      name,
      text,
      platformMessageId: `${platform}_msg_` + Date.now(),
      type: "text",
      skipDuplicateCheck: true,
    });

    res.json({
      success: true,
      platform,
      platformUserId: simUserId,
      name,
      reply: result?.responseText || null,
      conversationId: result?.conversationId || null,
    });
  } catch (error: any) {
    console.error("Error simulating customer message:", error);
    res.status(500).json({ error: error.message || "Failed to simulate message" });
  }
});

export default router;
