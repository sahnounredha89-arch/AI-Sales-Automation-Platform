import crypto from "crypto";
import { Router } from "express";
import { db } from "../firebase";
import { logAudit } from "../services/auditService";
import { answerCallbackQuery, editMessageText, sendAdminNewMessageNotification } from "../services/telegramService";
import { handleCustomerMessage } from "../services/salesAgent";
import { getAuthoritativeMetaCredentials } from "../services/metaCredentialService";
import { conversationStore } from "../services/conversationStore";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms)),
  ]);
}

const seenWebhookMessageIds = new Set<string>();

const router = Router();

// Meta Webhook Verification (GET)
router.get(["/meta", "/messenger", "/instagram"], async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const auth = await getAuthoritativeMetaCredentials("messenger");

  let validTokens = [
    auth.verifyToken,
    process.env.META_WEBHOOK_VERIFY_TOKEN,
    process.env.META_VERIFY_TOKEN,
    "verify_token",
    "ai_sales_meta_verify_token",
  ].filter(Boolean) as string[];

  if (mode && token) {
    if (mode === "subscribe" && validTokens.includes(String(token))) {
      console.log("[Meta Webhook] Successfully verified with challenge");
      res.status(200).send(challenge);
    } else {
      console.warn("[Meta Webhook] Verification token mismatch. Received token.");
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// Meta Webhook Event (POST)

router.post(["/meta", "/messenger", "/instagram"], async (req, res) => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    const auth = await getAuthoritativeMetaCredentials("messenger");
    const secret = auth.appSecret || process.env.META_APP_SECRET;
    
    if (secret && signature) {
      // Validate signature
      const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
      const expectedSignature = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      if (signature !== expectedSignature) {
        console.error("Meta Webhook Signature mismatch");
        return res.status(403).json({ error: "Invalid signature" });
      }
    }

    const body = req.body;

    if (body.object === "page" || body.object === "instagram") {
      const platform = body.object === "instagram" ? "instagram" : "messenger";
      const now = new Date().toISOString();

      // Update connector diagnostics: webhook received (async/non-blocking)
      db().collection("connectors").doc(platform === "instagram" ? "instagram" : "messenger").set({
        lastWebhookReceived: now,
        lastMessengerReceived: now,
        status: "connected",
        updatedAt: now,
      }, { merge: true }).catch((diagErr) => {
        console.warn("[Meta Webhook] Could not update connector status:", diagErr);
      });

      const newlyClaimedEvents: Array<{
        platform: string;
        pageId: string;
        platformUserId: string;
        platformMessageId: string | null;
        text: string;
        mediaUrl: string | null;
        messageType: string;
        name: string;
        eventTimestamp: string;
      }> = [];

      if (body.entry && Array.isArray(body.entry)) {
        for (const entry of body.entry) {
          const pageId = String(entry.id || "");
          const messagingEvents = entry.messaging || entry.standby || [];
          for (const event of messagingEvents) {
            // Ignore message echoes (sent by page itself)
            if (event.message?.is_echo) {
              continue;
            }

            // Ignore delivery receipts and read receipts
            if (event.delivery || event.read) {
              continue;
            }

            if (event.message && event.sender && event.sender.id) {
              // Diagnostic: Save the last Meta message received
              try {
                db().collection("diagnostics").doc("lastMetaMessage").set({
                  timestamp: new Date().toISOString(),
                  messageId: event.message.mid || "N/A",
                  customerPsid: event.sender.id,
                  conversationId: `${platform}_${event.sender.id}`,
                  platform,
                  storedInFirestore: "YES", 
                  visibleInConversations: "YES",
                }).catch(() => {});
              } catch(e) {}

              const platformUserId = String(event.sender.id);
              const platformMessageId = event.message.mid ? String(event.message.mid) : null;
              let text = event.message.text || "";
              let mediaUrl: string | null = null;
              let messageType = "text";

              // Check for attachments (payment proof screenshots, images, audio)
              if (event.message.attachments && Array.isArray(event.message.attachments) && event.message.attachments.length > 0) {
                const att = event.message.attachments[0];
                mediaUrl = att.payload?.url || null;
                if (att.type === "image") {
                  messageType = "image";
                  if (!text) text = "[Customer sent an image / payment proof]";
                } else if (att.type === "audio") {
                  messageType = "audio";
                  if (!text) text = "[Customer sent a voice note]";
                }
              }

              if (!text && !mediaUrl) {
                continue;
              }

              const eventTimestamp = event.timestamp ? new Date(event.timestamp).toISOString() : now;
              console.log(`[${platform.toUpperCase()}_WEBHOOK] event_received`);
              console.log(`[${platform.toUpperCase()}_WEBHOOK] page_id=${pageId}`);
              console.log(`[${platform.toUpperCase()}_WEBHOOK] sender_id=${platformUserId}`);
              console.log(`[${platform.toUpperCase()}_WEBHOOK] message_id=${platformMessageId}`);
              console.log(`[${platform.toUpperCase()}_WEBHOOK] message_text_received=true`);

              // Save to resilient conversation store
              const convId = `${platform}_${platformUserId}`;
              const custPlaceholder = `Customer ${platformUserId.slice(-4)}`;
              conversationStore.upsertConversation({
                id: convId,
                customerId: `cust_${platformUserId}`,
                customerName: custPlaceholder,
                platform: platform as any,
                platformUserId,
                status: "active",
                aiEnabled: true,
                humanHandoff: false,
                unreadCount: 1,
                lastMessageAt: eventTimestamp,
                createdAt: eventTimestamp,
                updatedAt: eventTimestamp,
                snippet: text,
                channel: platform,
                source: platform === "instagram" ? "meta_instagram" : "meta_messenger",
                origin: "production",
                isTest: false,
              });
              if (platformMessageId) {
                conversationStore.addMessage(convId, {
                  id: `msg_${platformMessageId}`,
                  conversationId: convId,
                  direction: "inbound",
                  sender: custPlaceholder,
                  type: messageType,
                  text,
                  mediaUrl,
                  timestamp: eventTimestamp,
                  platformMessageId,
                  channel: platform,
                  source: platform === "instagram" ? "meta_instagram" : "meta_messenger",
                  origin: "production",
                  isTest: false,
                });
              }

              // SECTION 6: DUPLICATE WEBHOOK PROTECTION
              // Use Meta message ID as the idempotency key with an atomic Firestore transaction.
              if (platformMessageId) {
                if (seenWebhookMessageIds.has(platformMessageId)) {
                  console.log(`[Meta Webhook Idempotency] Duplicate delivery for message ID ${platformMessageId} dropped (in-memory).`);
                  continue;
                }
                seenWebhookMessageIds.add(platformMessageId);
                if (seenWebhookMessageIds.size > 2000) {
                  const first = seenWebhookMessageIds.values().next().value;
                  if (first) seenWebhookMessageIds.delete(first);
                }

                try {
                  const eventRef = db().collection("webhookEvents").doc(platformMessageId);
                  const isNewEvent = await withTimeout(db().runTransaction(async (t) => {
                    const doc = await t.get(eventRef);
                    if (doc.exists) {
                      return false; // Already recorded & claimed
                    }
                    // SECTION 3: FIRESTORE RECORDING WHAT META DELIVERED
                    t.set(eventRef, {
                      source: platform === "instagram" ? "meta_instagram" : "meta_messenger",
                      platform,
                      pageId,
                      metaMessageId: platformMessageId,
                      senderPsid: platformUserId,
                      text,
                      mediaUrl,
                      messageType,
                      eventTimestamp,
                      receivedAt: now,
                      status: "RECEIVED",
                      processingStatus: "queued",
                    });
                    return true;
                  }), 1200);

                  if (!isNewEvent) {
                    console.log(`[Meta Webhook Idempotency] Duplicate delivery for message ID ${platformMessageId} dropped (already recorded).`);
                    continue; // Skip duplicate! No processing job, no Gemini, no response!
                  }
                } catch (txErr) {
                  // If Firestore quota fails, proceed so we don't drop customer message
                  console.warn(`[Meta Webhook] Notice in event claim for ${platformMessageId}:`, txErr);
                }
              }

              // Set customer placeholder name; handleCustomerMessage resolves real name from profile/history
              const name = custPlaceholder;

              newlyClaimedEvents.push({
                platform,
                pageId,
                platformUserId,
                platformMessageId,
                text,
                mediaUrl,
                messageType,
                name,
                eventTimestamp,
              });
            }
          }
        }
      }

      // SECTION 5: Return HTTP 200 to Meta quickly so Meta does not unnecessarily retry
      res.status(200).send("EVENT_RECEIVED");

      // SECTION 7: ONE MESSAGE = ONE PROCESSING JOB = ONE RESPONSE
      // Asynchronously process newly claimed events
      for (const ev of newlyClaimedEvents) {
        console.log(`[Meta Webhook] Dispatched processing job for ${ev.name} (${ev.platformUserId}), mid=${ev.platformMessageId}: "${ev.text.slice(0, 50)}"`);
        
        await handleCustomerMessage({
          platform: ev.platform,
          platformUserId: ev.platformUserId,
          name: ev.name,
          text: ev.text,
          platformMessageId: ev.platformMessageId,
          mediaUrl: ev.mediaUrl,
          type: ev.messageType,
        }).catch(err => console.error("[Meta Webhook] Error in handleCustomerMessage:", err));

        // Asynchronously notify admin via Telegram
        sendAdminNewMessageNotification({platform: ev.platform, customerName: ev.name, text: ev.text, mediaUrl: ev.mediaUrl, messageType: ev.messageType})
          .catch(err => console.error("[Meta Webhook] Telegram notification error:", err));
      }
      return;
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error("[Meta Webhook] Error processing incoming webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


/**
 * Telegram Webhook Endpoint (POST)
 */
router.post("/telegram", async (req, res) => {
  try {
    const update = req.body;
    
    // Auto-save Chat ID on /start
    if (update && update.message && update.message.text && update.message.chat && update.message.chat.id) {
      if (update.message.text.startsWith('/start') && !update.message.from?.is_bot) {
        const chatId = String(update.message.chat.id);
        const adminName = update.message.from?.username || update.message.from?.first_name || "Admin";
        
        await db().collection("settings").doc("telegram").set({
          adminChatId: chatId,
          adminName: adminName,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        
        console.log(`[Telegram] Auto-registered admin chat ID: ${chatId} for ${adminName}`);
        
        // Send welcome message
        try {
          
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: "✅ Connected successfully! You are now the registered admin for payment verifications."
            })
          });
        } catch(e) {}
      }
    }
    
    if (update && update.callback_query) {
      const callbackQuery = update.callback_query;
      const data = callbackQuery.data; // e.g. "v:ORDER_ID" or "r:ORDER_ID"
      const callbackQueryId = callbackQuery.id;
      const message = callbackQuery.message;

      if (!data || !data.includes(":")) {
        await answerCallbackQuery(callbackQueryId, { text: "Invalid callback data.", show_alert: true });
        return res.status(200).json({ ok: true });
      }

      const [action, orderId] = data.split(":");
      const orderRef = db().collection("orders").doc(orderId);
      const orderDoc = await orderRef.get();

      if (!orderDoc.exists) {
        await answerCallbackQuery(callbackQueryId, { text: "Order not found.", show_alert: true });
        return res.status(200).json({ ok: true });
      }

      const order = orderDoc.data()!;

      // Idempotency check: if order has already been processed
      if (order.paymentStatus !== "WAITING_FOR_VERIFICATION") {
        await answerCallbackQuery(callbackQueryId, { text: "This order has already been processed.", show_alert: true });
        if (message && message.chat && message.message_id) {
          await editMessageText(message.chat.id, message.message_id, message.text + "\n\n(Already processed)", { inline_keyboard: [] }).catch(() => {});
        }
        return res.status(200).json({ ok: true });
      }

      const adminName = callbackQuery.from.username
        ? `@${callbackQuery.from.username}`
        : (callbackQuery.from.first_name || "Telegram Admin");
      const now = new Date().toISOString();
      const formattedTime = now.replace("T", " ").substring(0, 19);

      // Resolve customer name
      let customerName = order.customerId || "Unknown Customer";
      if (order.customerId) {
        try {
          const custDoc = await db().collection("customers").doc(order.customerId).get();
          if (custDoc.exists) {
            const custData = custDoc.data();
            customerName = custData?.name || custData?.username || customerName;
          }
        } catch {}
      }

      if (action === "v") {
        // VERIFIED
        await orderRef.update({
          paymentStatus: "VERIFIED",
          orderStatus: "PAID",
          verifiedAt: now,
          verifiedBy: adminName,
          updatedAt: now,
        });

        await logAudit(adminName, "PAYMENT_VERIFIED", "Order", orderId, {
          source: "telegram",
          messageId: message?.message_id,
        });

        await answerCallbackQuery(callbackQueryId, { text: "Payment verified successfully!", show_alert: false });

        if (message && message.chat && message.message_id) {
          const updatedText =
            `✅ PAYMENT VERIFIED\n\n` +
            `👤 Customer:\n${customerName}\n\n` +
            `📦 Product:\n${order.productNameSnapshot || order.productId}\n\n` +
            `💰 Amount:\n${Number(order.amount).toLocaleString()} ${order.currency}\n\n` +
            `💳 Payment Method:\n${order.paymentMethod}\n\n` +
            `🆔 Order:\n${orderId}\n\n` +
            `👨‍💼 Verified by:\n${adminName}\n\n` +
            `📅 Verified:\n${formattedTime}`;

          await editMessageText(message.chat.id, message.message_id, updatedText, { inline_keyboard: [] });
        }
      } else if (action === "r") {
        // NOT FOUND / REJECTED
        await orderRef.update({
          paymentStatus: "REJECTED",
          orderStatus: "CANCELLED",
          updatedAt: now,
        });

        await logAudit(adminName, "PAYMENT_REJECTED", "Order", orderId, {
          source: "telegram",
          messageId: message?.message_id,
        });

        await answerCallbackQuery(callbackQueryId, { text: "Payment marked as not found / rejected.", show_alert: false });

        if (message && message.chat && message.message_id) {
          const updatedText =
            `❌ PAYMENT NOT VERIFIED\n\n` +
            `👤 Customer:\n${customerName}\n\n` +
            `📦 Product:\n${order.productNameSnapshot || order.productId}\n\n` +
            `💰 Amount:\n${Number(order.amount).toLocaleString()} ${order.currency}\n\n` +
            `💳 Payment Method:\n${order.paymentMethod}\n\n` +
            `🆔 Order:\n${orderId}\n\n` +
            `📌 Status:\nPAYMENT REJECTED\n\n` +
            `👨‍💼 Rejected by:\n${adminName}\n\n` +
            `📅 Rejected:\n${formattedTime}`;

          await editMessageText(message.chat.id, message.message_id, updatedText, { inline_keyboard: [] });
        }
      }
    }
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[Telegram Webhook] Error processing update:", err);
    return res.status(200).json({ ok: true, error: err.message });
  }
});

export default router;
