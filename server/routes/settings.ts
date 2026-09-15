import { Router } from "express";
import fs from "fs";
import path from "path";
import { requireAdmin } from "../middleware/auth";
import { db, getDatabaseStatus } from "../firebase";
import { getGenAI, getPrimaryModel } from "../services/gemini";
import { testFacebookConnection, testInstagramConnection } from "../services/metaService";

const router = Router();

// Helper to handle standard settings documents
const handleSettingsDoc = (docName: string) => {
  const subRouter = Router();
  
  subRouter.get("/", requireAdmin, async (req, res) => {
    try {
      const doc = await db().collection("settings").doc(docName).get();
      if (doc.exists) {
        res.json(doc.data());
      } else {
        res.json({});
      }
    } catch (error: any) {
      console.error(`Error fetching ${docName} settings:`, error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  subRouter.put("/", requireAdmin, async (req, res) => {
    try {
      const data = req.body;
      await db().collection("settings").doc(docName).set({
        ...data,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error(`Error updating ${docName} settings:`, error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  return subRouter;
};

// Use the helper for different setting sections
router.use("/general", handleSettingsDoc("general"));
router.use("/ai", handleSettingsDoc("ai"));
router.use("/sales-agent", handleSettingsDoc("salesAgent"));
router.use("/notifications", handleSettingsDoc("notifications"));
router.use("/business", handleSettingsDoc("general")); // Legacy support

// Safe status endpoint for environment variables / secrets
router.get("/integrations/status", requireAdmin, async (req, res) => {
  // Test Gemini Connection if key exists
  let geminiConnected = false;
  let geminiInvalid = false;
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = getGenAI();
      // Fast test with primary model (Gemini Flash Latest)
      await ai.models.generateContent({
        model: getPrimaryModel(),
        contents: "test",
        config: { maxOutputTokens: 1 }
      });
      geminiConnected = true;
    } catch (e) {
      geminiInvalid = true;
    }
  }

  // Determine Meta status
  let metaStatus = "NOT CONFIGURED";
  let metaDocData: Record<string, any> = {};
  try {
    const metaDoc = await db().collection("settings").doc("meta").get();
    if (metaDoc.exists) {
      metaDocData = metaDoc.data() || {};
    }
  } catch (e) {}

  try {
    const connectorsSnap = await db().collection("connectors").get();
    const metaConnectors = connectorsSnap.docs.filter(d => d.id === "messenger" || d.id === "instagram");
    if (metaConnectors.length > 0) {
      metaStatus = "CONFIGURED";
    } else {
      const metaAppId = !!(process.env.META_APP_ID || metaDocData.appId);
      const metaAppSecret = !!(process.env.META_APP_SECRET || metaDocData.appSecret);
      if (metaAppId && metaAppSecret) {
        metaStatus = "PARTIALLY CONFIGURED";
      }
    }
  } catch (err) {
    metaStatus = "ERROR";
  }

  // Determine Telegram status
  const tgToken = !!process.env.TELEGRAM_BOT_TOKEN;
  const tgUsername = !!process.env.TELEGRAM_BOT_USERNAME;
  let tgStatus = "NOT CONFIGURED";
  let tgConnected = false;
  let tgInvalid = false;
  
  if (tgToken) {
    tgStatus = "CONFIGURED";
    try {
      // Ping telegram to verify token
      const tgRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
      const tgData = await tgRes.json();
      if (tgData.ok) {
        tgConnected = true;
      } else {
        tgInvalid = true;
      }
    } catch (e) {
      tgInvalid = true;
    }
  }

  // Live test Facebook and Instagram for accurate diagnostic status
  let fbTestResult: any = null;
  let igTestResult: any = null;
  try {
    fbTestResult = await testFacebookConnection();
  } catch (e) {}
  try {
    igTestResult = await testInstagramConnection();
  } catch (e) {}

  const dbStatus = getDatabaseStatus();
  const hasServiceAccountFile = fs.existsSync(path.join(process.cwd(), "serviceAccountKey.json"));

  const pageIdVal = process.env.META_PAGE_ID || metaDocData.pageId || fbTestResult?.pageId || "110414661460391";
  const pageNameVal = metaDocData.pageName || fbTestResult?.pageName || "Dokuni Shop";
  const igAccountIdVal = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || metaDocData.igAccountId || igTestResult?.igAccountId || null;

  let publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!publicBaseUrl) {
    const proto = req.get("x-forwarded-proto") || req.protocol || "https";
    const host = req.get("x-forwarded-host") || req.get("host");
    if (host) {
      publicBaseUrl = `${proto}://${host}`;
    } else {
      publicBaseUrl = "https://ais-dev-7uhztrs5loajhz6jiprpp2-41985141249.europe-west1.run.app";
    }
  }
  const publicWebhookUrl = `${publicBaseUrl}/api/webhooks/meta`;
  const hasWebhookToken = !!(process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || metaDocData.verifyToken);

  res.json({
    auth: {
      adminUsername: !!process.env.ADMIN_USERNAME,
      adminPassword: !!process.env.ADMIN_PASSWORD,
      sessionSecret: !!process.env.SESSION_SECRET,
    },
    firebase: {
      projectId: hasServiceAccountFile || !!(process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID),
      adc: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
      clientEmail: hasServiceAccountFile || !!process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: hasServiceAccountFile || !!process.env.FIREBASE_PRIVATE_KEY,
      firestoreReachable: !dbStatus.quotaExceeded,
      mode: dbStatus.mode,
      quotaExceeded: dbStatus.quotaExceeded,
      message: dbStatus.message,
      resetInfo: dbStatus.resetInfo,
    },
    gemini: {
      apiKey: !!process.env.GEMINI_API_KEY,
      connected: geminiConnected,
      invalid: geminiInvalid
    },
    meta: {
      appId: !!(process.env.META_APP_ID || metaDocData.appId),
      appSecret: !!(process.env.META_APP_SECRET || metaDocData.appSecret),
      pageAccessToken: !!(process.env.META_PAGE_ACCESS_TOKEN || metaDocData.pageAccessToken),
      webhookVerifyToken: hasWebhookToken,
      pageId: !!(process.env.META_PAGE_ID || metaDocData.pageId),
      pageName: pageNameVal,
      pageIdVal: pageIdVal,
      pagesMessaging: fbTestResult?.messagingPermission === "ready" ? "ready" : "missing",
      fbMessagingStatus: fbTestResult?.messagingStatus || "not_ready",
      fbTestMessage: fbTestResult?.message || fbTestResult?.error || null,
      instagramAccountLinked: !!igTestResult?.accountLinked,
      igMessagingStatus: igTestResult?.messagingStatus || "not_ready",
      igAccountId: !!igAccountIdVal,
      igAccountIdVal: igAccountIdVal,
      instagramBasic: igTestResult?.instagramBasic || "missing",
      instagramManageMessages: igTestResult?.instagramManageMessages || "not_verified",
      igTestMessage: igTestResult?.message || igTestResult?.error || null,
      webhookStatus: hasWebhookToken ? "ready" : "not_configured",
      publicWebhookUrl: publicWebhookUrl,
      status: metaStatus
    },
    telegram: {
      botToken: tgToken,
      botUsername: tgUsername,
      connected: tgConnected,
      invalid: tgInvalid,
      status: tgStatus
    }
  });
});

router.post("/meta/test-facebook", requireAdmin, async (req, res) => {
  const result = await testFacebookConnection();
  res.json(result);
});

router.post("/meta/test-instagram", requireAdmin, async (req, res) => {
  const result = await testInstagramConnection();
  res.json(result);
});

/**
 * POST /api/admin/settings/restore-credentials
 * Restores and synchronizes credentials from Firestore, persistent cache, and runtime.
 */
router.post("/restore-credentials", requireAdmin, async (req, res) => {
  try {
    const { restoreSecrets } = await import("../syncSecrets.js");
    const result = await restoreSecrets({ force: true });
    res.json(result);
  } catch (error: any) {
    console.error("Error restoring credentials:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to restore credentials",
    });
  }
});

export default router;

