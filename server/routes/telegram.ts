import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import {
  getTelegramStatus,
  getMe,
  isTelegramConfigured,
  sendAdminTestNotification,
  setTelegramAdminChatId,
  getLatestAdminChatCandidate,
  isAdminChatConfigured,
  saveTelegramCredentials,
} from "../services/telegramService";

const router = Router();

/**
 * GET /api/admin/telegram/status
 * Returns current status of Telegram Admin Notifications.
 * Exposes zero sensitive tokens or credentials.
 */
router.get("/status", requireAdmin, async (req, res) => {
  try {
    const status = await getTelegramStatus();
    res.json(status);
  } catch (error: any) {
    if (error.code === 8 || error.message?.includes("RESOURCE_EXHAUSTED") || error.message?.includes("Quota exceeded")) {
      console.warn("[Telegram Route] Quota exceeded fetching status. Returning fallback status.");
      return res.json({
        configured: false,
        botConnected: false,
        botTokenConfigured: false,
        botTokenMasked: null,
        botTokenStoredInDb: false,
        adminChatConfigured: false,
        adminChatId: null,
        adminChatIdStatus: "NOT_CONFIGURED",
        connectionError: "Database quota limit temporarily reached. Please retry in a few moments.",
      });
    }
    console.error("Error fetching Telegram status:", error);
    res.status(500).json({ error: error.message || "Failed to fetch Telegram status" });
  }
});

/**
 * POST /api/admin/telegram/test
 * Checks connection to the Telegram Bot API via getMe().
 */
router.post("/test", requireAdmin, async (req, res) => {
  try {
    if (!isTelegramConfigured()) {
      return res.status(400).json({
        success: false,
        error: "TELEGRAM_BOT_TOKEN is not configured in server environment.",
      });
    }

    const bot = await getMe();
    const adminChatReady = await isAdminChatConfigured();

    res.json({
      success: true,
      bot: {
        id: bot.id,
        first_name: bot.first_name,
        username: bot.username,
      },
      adminChatConfigured: adminChatReady,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || "Telegram connection test failed",
    });
  }
});

/**
 * POST /api/admin/telegram/test-notify
 * Sends a test notification to the configured Telegram Admin Chat.
 * Does not create or touch orders.
 */
router.post("/test-notify", requireAdmin, async (req, res) => {
  try {
    const result = await sendAdminTestNotification();
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || "Failed to send test notification",
    });
  }
});

/**
 * POST /api/admin/telegram/chat-id
 * Configures the Telegram Admin Chat ID in Firestore.
 */
router.post("/chat-id", requireAdmin, async (req, res) => {
  try {
    const { chatId } = req.body;
    if (!chatId || String(chatId).trim() === "") {
      return res.status(400).json({ error: "chatId is required" });
    }

    await setTelegramAdminChatId(String(chatId).trim());
    res.json({
      success: true,
      adminChatIdStatus: "CONFIGURED",
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || "Failed to configure admin chat ID",
    });
  }
});

/**
 * GET /api/admin/telegram/detect-chat-id
 * Inspects recent messages sent to the bot to detect the admin's Telegram Chat ID.
 */
router.get("/detect-chat-id", requireAdmin, async (req, res) => {
  try {
    const candidate = await getLatestAdminChatCandidate();
    res.json(candidate);
  } catch (error: any) {
    res.status(500).json({
      found: false,
      error: error.message || "Failed to inspect updates",
    });
  }
});

/**
 * POST /api/admin/telegram/credentials
 * Permanently saves Telegram credentials (botToken, adminChatId) to Firestore database.
 */
router.post("/credentials", requireAdmin, async (req, res) => {
  try {
    const { botToken, adminChatId, adminName } = req.body;
    if (!botToken && !adminChatId) {
      return res.status(400).json({ error: "Either botToken or adminChatId must be provided" });
    }

    const result = await saveTelegramCredentials({
      botToken,
      adminChatId,
      adminName,
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || "Failed to save Telegram credentials",
    });
  }
});

export default router;
