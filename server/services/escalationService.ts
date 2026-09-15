import { db } from "../firebase";
import { getTelegramAdminChatId, sendMessage, isTelegramConfigured } from "./telegramService";

const activeTimers = new Map<string, NodeJS.Timeout>();

export async function evaluateAndEscalateMessage({
  conversationId,
  customerId,
  customerName,
  platform,
  text,
}: {
  conversationId: string;
  customerId: string;
  customerName: string;
  platform: string;
  text: string;
}) {
  try {
    const lower = (text || "").toLowerCase();

    let isHumanRequested = false;
    let isBotAsked = false;
    let isProblem = false;
    let priority: "HIGH" | "MEDIUM" | "LOW" = "LOW";
    let reason = "General inquiry";

    // 1. Check if customer is asking if agent is human / AI / bot or requesting human
    const botAskKeywords = ["بوت", "ai", "bot", "انسان", "human", "real person", "شخص حقيقي", "ادمين", "admin", "المسؤول", "مع بشري", "بشري", "ممثّل"];
    if (botAskKeywords.some(kw => lower.includes(kw))) {
      if (lower.includes("بوت") || lower.includes("ai") || lower.includes("bot") || lower.includes("انسان") || lower.includes("human") || lower.includes("real person") || lower.includes("شخص حقيقي")) {
        isBotAsked = true;
        priority = "HIGH";
        reason = "Customer explicitly asked whether agent is AI or human";
      }
      if (lower.includes("ادمين") || lower.includes("admin") || lower.includes("المسؤول") || lower.includes("نهدر مع") || lower.includes("كلم واحد") || lower.includes("شخص حقيقي") || lower.includes("ممثّل")) {
        isHumanRequested = true;
        priority = "HIGH";
        reason = "Customer requested human intervention / admin";
      }
    }

    // 2. Check for problems, complaints, payment/delivery issues, frustration
    const problemKeywords = [
      "مشكل", "ممشكل", "ماتخدمش", "ماخدمليش", "خدمة ما خداماش", "خلصت وما وصلني والو", 
      "فين راه الحساب", "ما فهمتش", "ماقدرتش", "غلطتو", "ماعجبنيش", "مخسر", "مشكلة", "راكمو غلطتو",
      "problem", "issue", "not working", "paid", "didn't receive", "refund", "complaint", "frustrated"
    ];
    if (problemKeywords.some(kw => lower.includes(kw))) {
      isProblem = true;
      priority = "HIGH";
      reason = "Customer reported a payment, order, delivery, or technical problem";
    }

    // 3. Check for confusion / medium priority
    const confusionKeywords = ["مفهمت", "كيفاش نسجل", "صعب", "معقد", "confused", "how to", "ما فهمتش"];
    if (!isProblem && !isHumanRequested && !isBotAsked && confusionKeywords.some(kw => lower.includes(kw))) {
      priority = "MEDIUM";
      reason = "Customer appears confused or needs clarification";
    }

    // If human is explicitly requested or bot asked or high priority problem, trigger human handoff
    if (isHumanRequested || isBotAsked || isProblem) {
      if (isHumanRequested || isBotAsked) {
        try {
          await db().collection("conversations").doc(conversationId).update({
            humanHandoff: true,
            aiEnabled: false,
            updatedAt: new Date().toISOString(),
          });
        } catch (e: any) {
          console.warn("[Escalation Service] Could not update conversation handoff:", e.message);
        }
      }
    }

    // If priority is HIGH or MEDIUM, send Telegram notification with duplicate protection
    if (priority === "HIGH" || priority === "MEDIUM") {
      const adminChatId = await getTelegramAdminChatId();
      if (adminChatId) {
        let shouldSend = true;
        try {
          const notifRef = db().collection("escalationNotifications");
          const dupCheck = await notifRef
            .where("conversationId", "==", conversationId)
            .where("reason", "==", reason)
            .where("textSnippet", "==", text.substring(0, 30))
            .limit(1)
            .get();
          
          if (!dupCheck.empty) {
            shouldSend = false;
          }
        } catch (e: any) {
          // If DB is offline/quota exceeded, still proceed to notify admin
          console.warn("[Escalation Service] DB check skipped during escalation:", e.message);
        }
        
        if (shouldSend) {
          const baseUrl = process.env.PUBLIC_BASE_URL || "https://ais-dev-7uhztrs5loajhz6jiprpp2-41985141249.europe-west1.run.app";
          const chatLink = `${baseUrl}/conversations/${conversationId}`;
          const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);

          const title = isBotAsked 
            ? "🤖 CUSTOMER ASKED IF HUMAN / AI"
            : isHumanRequested
            ? "👤 HUMAN HANDOFF REQUESTED"
            : "⚠️ CUSTOMER ISSUE / ESCALATION";

          const telegramText =
            `${title}\n\n` +
            `🚨 Priority: ${priority}\n` +
            `👤 Customer: ${customerName || customerId}\n` +
            `🌐 Platform: ${platform || "Web"}\n` +
            `🆔 Conversation ID: ${conversationId}\n` +
            `💬 Latest Message: "${text}"\n` +
            `📌 Reason: ${reason}\n` +
            `📅 Time: ${nowStr}\n\n` +
            `🔗 Client Chat:\n${chatLink}\n\n` +
            `⚠️ ACTION REQUIRED: Review conversation in admin dashboard and take over if necessary.`;

          if (isTelegramConfigured()) {
            await sendMessage(adminChatId, telegramText).catch((err) => {
              console.warn("[Escalation Service] Could not send Telegram alert:", err.message);
            });
          }

          try {
            await db().collection("escalationNotifications").add({
              conversationId,
              customerId,
              priority,
              reason,
              textSnippet: text.substring(0, 30),
              createdAt: new Date().toISOString(),
            });
          } catch (e) {}
        }
      }
    }
  } catch (err: any) {
    if (err.code === 8 || err.message?.includes("RESOURCE_EXHAUSTED") || err.message?.includes("Quota exceeded")) {
      console.warn("[Escalation Service] Firestore quota exceeded during evaluation.");
    } else {
      console.error("[Escalation Service] Error evaluating message:", err);
    }
  }
}

export function cancelUnansweredTimer(conversationId: string) {
  const timer = activeTimers.get(conversationId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(conversationId);
  }
}

export async function scheduleUnansweredTimer({
  conversationId,
  customerName,
  platform,
  aiMessageText,
}: {
  conversationId: string;
  customerName: string;
  platform: string;
  aiMessageText: string;
}) {
  cancelUnansweredTimer(conversationId);

  // Store the deadline in Firestore if accessible
  const deadline = Date.now() + 5 * 60 * 1000;
  try {
    await db().collection("conversations").doc(conversationId).update({
      unansweredDeadline: deadline,
      unansweredAlertSent: false,
      lastAiMessageSnippet: aiMessageText.substring(0, 30),
    });
  } catch (e: any) {
    // Database might be throttled or unavailable
  }

  // Keep the in-memory timer for immediate execution
  const timeoutId = setTimeout(async () => {
    activeTimers.delete(conversationId);

    try {
      let alreadySent = false;
      let customerReplied = false;
      try {
        const convDoc = await db().collection("conversations").doc(conversationId).get();
        if (!convDoc.exists) return;
        
        const data = convDoc.data();
        if (data?.unansweredAlertSent) return;

        const msgsSnap = await db().collection("conversations").doc(conversationId).collection("messages").orderBy("timestamp", "desc").limit(2).get();
        if (!msgsSnap.empty) {
          const latestMsg = msgsSnap.docs[0].data();
          if (latestMsg.sender === "customer") {
            customerReplied = true;
          }
        }
      } catch (e: any) {
        // If DB read fails, ignore and don't spam
        return;
      }

      if (customerReplied) return;

      try {
        await db().collection("conversations").doc(conversationId).update({ unansweredAlertSent: true });
      } catch (e) {}

      const adminChatId = await getTelegramAdminChatId();
      if (adminChatId) {
        const baseUrl = process.env.PUBLIC_BASE_URL || "https://ais-dev-7uhztrs5loajhz6jiprpp2-41985141249.europe-west1.run.app";
        const chatLink = `${baseUrl}/conversations/${conversationId}`;
        const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);

        const telegramText =
          `⏳ CUSTOMER NOT RESPONDING\n\n` +
          `🚨 Priority: MEDIUM\n` +
          `👤 Customer: ${customerName || "Customer"}\n` +
          `🌐 Platform: ${platform || "Web"}\n` +
          `🆔 Conversation ID: ${conversationId}\n` +
          `🤖 Last message from agent: "${aiMessageText}"\n` +
          `⏱️ Waiting time: 5 minutes without reply\n` +
          `📅 Time: ${nowStr}\n\n` +
          `🔗 Client Chat:\n${chatLink}\n\n` +
          `⚠️ ACTION REQUIRED: Check conversation and follow up if needed.`;

        if (isTelegramConfigured()) {
          await sendMessage(adminChatId, telegramText).catch((err) => {
            console.warn("[Escalation Service] Could not send Telegram alert:", err.message);
          });
        }

        try {
          await db().collection("escalationNotifications").add({
            type: "UNANSWERED",
            conversationId,
            aiMessageSnippet: aiMessageText.substring(0, 30),
            createdAt: new Date().toISOString(),
          });
        } catch (e) {}
      }
    } catch (err: any) {
      if (err.code === 8 || err.message?.includes("RESOURCE_EXHAUSTED") || err.message?.includes("Quota exceeded")) {
        console.warn("[Escalation Service] Firestore quota exceeded during unanswered timer.");
      } else {
        console.warn("[Escalation Service] Unanswered timer warning:", err.message || err);
      }
    }
  }, 5 * 60 * 1000);

  activeTimers.set(conversationId, timeoutId);
}

// Periodic background check to catch missed unanswered deadlines
let bgCheckInterval: NodeJS.Timeout | null = null;

function startBackgroundCheck() {
  if (bgCheckInterval) clearInterval(bgCheckInterval);
  
  bgCheckInterval = setInterval(async () => {
    try {
      const now = Date.now();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("DB timeout")), 1500));
      const pendingRef: any = await Promise.race([
        db().collection("conversations")
          .where("unansweredAlertSent", "==", false)
          .limit(10)
          .get(),
        timeoutPromise
      ]);
        
      const missedDocs = pendingRef.docs.filter(doc => doc.data().unansweredDeadline && doc.data().unansweredDeadline <= now);
        
      for (const doc of missedDocs) {
        const data = doc.data();
        const conversationId = doc.id;
        
        // Double check customer hasn't replied
        const msgsSnap = await db().collection("conversations").doc(conversationId).collection("messages").orderBy("timestamp", "desc").limit(1).get();
        if (!msgsSnap.empty) {
          const latestMsg = msgsSnap.docs[0].data();
          if (latestMsg.sender === "customer") {
            try {
              await doc.ref.update({ unansweredAlertSent: true });
            } catch (e) {}
            continue; 
          }
        }

        try {
          await doc.ref.update({ unansweredAlertSent: true });
        } catch (e) {}

        const adminChatId = await getTelegramAdminChatId();
        if (adminChatId && data.lastAiMessageSnippet) {
          const baseUrl = process.env.PUBLIC_BASE_URL || "https://ais-dev-7uhztrs5loajhz6jiprpp2-41985141249.europe-west1.run.app";
          const chatLink = `${baseUrl}/conversations/${conversationId}`;
          const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);
          const telegramText =
            `⏳ CUSTOMER NOT RESPONDING\n\n` +
            `🚨 Priority: MEDIUM\n` +
            `🌐 Platform: ${data.platform || "Web"}\n` +
            `🆔 Conversation ID: ${conversationId}\n` +
            `🤖 Last message snippet: "${data.lastAiMessageSnippet}"\n` +
            `⏱️ Waiting time: > 5 minutes without reply (Background Check)\n` +
            `📅 Time: ${nowStr}\n\n` +
            `🔗 Client Chat:\n${chatLink}\n\n` +
            `⚠️ ACTION REQUIRED: Check conversation and follow up if needed.`;
          if (isTelegramConfigured()) {
            await sendMessage(adminChatId, telegramText).catch((err) => {
              console.warn("[Escalation Service] Could not send Telegram alert:", err.message);
            });
          }
          
          try {
            await db().collection("escalationNotifications").add({
              type: "UNANSWERED",
              conversationId,
              aiMessageSnippet: data.lastAiMessageSnippet,
              createdAt: new Date().toISOString(),
            });
          } catch (e) {}
        }
      }
    } catch (err: any) {
      if (err.code === 7 || err.message?.includes("PERMISSION_DENIED")) {
        console.warn("[Escalation Service] Database access denied (Missing credentials). Pausing background check.");
        if (bgCheckInterval) clearInterval(bgCheckInterval);
      } else if (err.code === 8 || err.message?.includes("RESOURCE_EXHAUSTED") || err.message?.includes("Quota exceeded")) {
        console.warn("[Escalation Service] Firestore quota exceeded. Pausing background check to prevent resource exhaustion.");
        if (bgCheckInterval) clearInterval(bgCheckInterval);
      } else {
        console.warn("[Escalation Service] Background check notice:", err.message || err);
      }
    }
  }, 15 * 60 * 1000); // Check every 15 minutes instead of every 60 seconds
}

// Start with initial delay to avoid startup quota stampede
setTimeout(startBackgroundCheck, 30000);
