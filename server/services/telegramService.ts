import { db } from "../firebase";

let telegramConfig: { botToken: string | null; adminChatId: string | null } = {
  botToken: null,
  adminChatId: null,
};

export async function initTelegramService() {
  try {
    const doc = await db().collection("settings").doc("telegram").get();
    if (doc.exists) {
      const data = doc.data();
      if (data?.botToken) telegramConfig.botToken = data.botToken;
      if (data?.adminChatId) telegramConfig.adminChatId = data.adminChatId;
    }
  } catch (err) {
    console.error("[Telegram] Init error", err);
  }
}

export function isTelegramConfigured() {
  return !!(process.env.TELEGRAM_BOT_TOKEN || telegramConfig.botToken);
}

export async function isAdminChatConfigured() {
  return !!(process.env.TELEGRAM_CHAT_ID || telegramConfig.adminChatId);
}

export async function getTelegramAdminChatId() {
  return process.env.TELEGRAM_CHAT_ID || telegramConfig.adminChatId;
}

function getBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN || telegramConfig.botToken;
}

export async function getMe() {
  const token = getBotToken();
  if (!token) throw new Error("Bot token missing");
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  if (!res.ok) throw new Error("Failed to getMe");
  const data = await res.json();
  return data.result;
}

export async function sendMessage(chatId: string, text: string, options: any = {}) {
  const token = getBotToken();
  if (!token) throw new Error("Bot token missing");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...options }),
  });
  if (!res.ok) throw new Error("Failed to send message: " + await res.text());
  return res.json();
}

export async function sendAdminTestNotification() {
  try {
    const chatId = await getTelegramAdminChatId();
    if (!chatId) throw new Error("Admin chat ID missing");
    await sendMessage(chatId, "🔔 <b>Test Notification</b>\nThis is a test from your AI Sales Agent.", { parse_mode: "HTML" });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendTelegramNotification(message: string) {
  try {
    const chatId = await getTelegramAdminChatId();
    if (!chatId) return false;
    await sendMessage(chatId, message, { parse_mode: "HTML" });
    return true;
  } catch (err) {
    console.error("[Telegram] Notification error", err);
    return false;
  }
}

export async function getTelegramStatus() {
  const botToken = getBotToken();
  const chatId = await getTelegramAdminChatId();
  return {
    configured: !!(botToken && chatId),
    botConnected: !!botToken,
    botTokenConfigured: !!botToken,
    botTokenMasked: botToken ? botToken.slice(0, 5) + "..." : null,
    botTokenStoredInDb: !!telegramConfig.botToken,
    adminChatConfigured: !!chatId,
    adminChatId: chatId,
    adminChatIdStatus: chatId ? "CONFIGURED" : "NOT_CONFIGURED",
    connectionError: null,
  };
}

export async function setTelegramAdminChatId(chatId: string) {
  await db().collection("settings").doc("telegram").set({ adminChatId: chatId }, { merge: true });
  telegramConfig.adminChatId = chatId;
}

export async function getLatestAdminChatCandidate() {
  const token = getBotToken();
  if (!token) return { found: false };
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=10`);
  if (!res.ok) return { found: false };
  const data = await res.json();
  const updates = data.result || [];
  if (updates.length > 0) {
    const last = updates[updates.length - 1];
    if (last.message && last.message.chat) {
      return { found: true, chatId: last.message.chat.id, username: last.message.chat.username };
    }
  }
  return { found: false };
}

export async function saveTelegramCredentials({ botToken, adminChatId, adminName }: any) {
  const payload: any = {};
  if (botToken) { payload.botToken = botToken; telegramConfig.botToken = botToken; }
  if (adminChatId) { payload.adminChatId = adminChatId; telegramConfig.adminChatId = adminChatId; }
  if (adminName) payload.adminName = adminName;
  await db().collection("settings").doc("telegram").set(payload, { merge: true });
  return { success: true };
}

export async function sendAdminPaymentNotification(orderId: string, options: { forceRetry?: boolean } = {}): Promise<any> {
  try {
    const { db } = await import("../firebase");
    const orderDoc = await db().collection("orders").doc(orderId).get();
    if (!orderDoc.exists) return { success: false, error: "Order not found" };
    
    const orderData = orderDoc.data()!;
    const customerName = orderData.customerName || "Customer";
    
    const result = await sendTelegramNotification(`💳 <b>Payment Confirmed!</b>

Order for ${customerName} has been paid.

Product: ${orderData.productNameSnapshot}`);
    return { success: true, messageId: result };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function answerCallbackQuery(callbackQueryId: string, options: any = {}) {
  const token = getBotToken();
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, ...options }),
  });
}

export async function editMessageText(chatId: string, messageId: number, text: string, options: any = {}) {
  const token = getBotToken();
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, ...options }),
  });
}

export async function sendAdminNewMessageNotification(msgDetails: any) {
  return sendTelegramNotification(`💬 <b>New Message Received!</b>\n\nFrom: ${msgDetails.customerName}\n\n${msgDetails.text}`);
}
