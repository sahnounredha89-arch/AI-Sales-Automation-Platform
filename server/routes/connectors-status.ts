import { Router } from "express";
import { requireAdmin } from "../middleware/auth";

const router = Router();

router.get("/status", requireAdmin, async (req, res) => {
  res.json({
    metaAppIdConfigured: !!process.env.META_APP_ID,
    metaAppSecretConfigured: !!process.env.META_APP_SECRET,
    metaVerifyTokenConfigured: !!(process.env.META_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN),
    metaPageConnected: !!process.env.META_PAGE_ID,
    instagramConnected: !!process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
    telegramBotTokenConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
    telegramAdminChatIdConfigured: !!process.env.TELEGRAM_ADMIN_CHAT_ID,
    telegramConnection: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_ADMIN_CHAT_ID,
    publicBaseUrlConfigured: !!process.env.PUBLIC_BASE_URL,
  });
});

export default router;
