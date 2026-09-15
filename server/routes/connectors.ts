import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import { db, setFirestoreQuotaExceeded } from "../firebase";
import { logAudit } from "../services/auditService";
import { 
  verifyMetaToken, 
  testFacebookConnection, 
  testInstagramConnection,
  subscribePageToWebhooks
} from "../services/metaService";
import {
  validateMetaCredentials,
  replaceMetaToken,
  hashToken,
  getSafeTokenMetadata,
  compareCredentialSources,
  getAuthoritativeMetaCredentials,
} from "../services/metaCredentialService";
import { localDataCache } from "../services/localDataCache";

const router = Router();

/**
 * GET /api/admin/connectors/meta/credential-health
 * Returns comprehensive safe diagnostic health status of Meta credentials
 */
router.get("/meta/credential-health", requireAdmin, async (req, res) => {
  try {
    const force = req.query.force === "true";
    const health = await validateMetaCredentials({ force });
    res.json(health);
  } catch (error: any) {
    console.error("Error checking Meta credential health:", error);
    res.status(500).json({ error: error.message || "Failed to check credential health." });
  }
});

/**
 * POST /api/admin/connectors/meta/validate-now
 * Force runs a fresh live validation against Meta Graph API
 */
router.post("/meta/validate-now", requireAdmin, async (req, res) => {
  try {
    const health = await validateMetaCredentials({ force: true });
    res.json(health);
  } catch (error: any) {
    console.error("Error validating Meta credentials:", error);
    res.status(500).json({ error: error.message || "Failed to validate credentials." });
  }
});

/**
 * POST /api/admin/connectors/meta/replace-token
 * Two-step safe token replacement with validation before activation
 */
router.post("/meta/replace-token", requireAdmin, async (req, res) => {
  try {
    const { newToken, pageId, pageName } = req.body;
    if (!newToken || typeof newToken !== "string" || !newToken.trim()) {
      return res.status(400).json({ error: "New Meta Page Access Token is required." });
    }

    const adminUser = (req.session as any)?.adminUser || "ADMIN";
    const result = await replaceMetaToken(newToken.trim(), {
      pageId: pageId?.trim(),
      pageName: pageName?.trim(),
      adminUsername: adminUser,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    console.error("Error replacing Meta token:", error);
    res.status(500).json({ error: error.message || "Failed to replace token." });
  }
});

/**
 * GET /api/admin/connectors
 * Returns status of all configured platform connectors
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const snap = await db().collection("connectors").get();
    const connectors = snap.docs.map(doc => {
      const data = doc.data();
      return { 
        id: doc.id,
        type: data.type,
        platform: data.platform,
        name: data.name,
        pageId: data.pageId,
        pageName: data.pageName,
        igAccountId: data.igAccountId,
        igUsername: data.igUsername,
        status: data.status,
        messagingPermission: data.messagingPermission,
        messagingStatus: data.messagingStatus,
        connectedAt: data.connectedAt,
        tokenMasked: data.accessToken 
          ? `${data.accessToken.substring(0, 8)}...${data.accessToken.slice(-4)}` 
          : null,
      };
    });
    setFirestoreQuotaExceeded(false);
    localDataCache.saveConnectors(connectors);
    res.json(connectors);
  } catch (error: any) {
    if (error.code === 8 || error.message?.includes("RESOURCE_EXHAUSTED") || error.message?.includes("Quota exceeded")) {
      console.warn("[Connectors] Firestore quota reached. Returning cached or authoritative connectors.");
      setFirestoreQuotaExceeded(true);
      const cached = localDataCache.getConnectors();
      if (cached && cached.length > 0) {
        return res.json(cached);
      }

      // Synthesize based on authoritative credentials
      const messengerAuth = await getAuthoritativeMetaCredentials("messenger");
      const igAuth = await getAuthoritativeMetaCredentials("instagram");
      const fallbackList: any[] = [];

      if (messengerAuth.accessToken) {
        fallbackList.push({
          id: "messenger",
          type: "messenger",
          platform: "facebook",
          name: messengerAuth.pageName || "Dokuni Shop",
          pageId: messengerAuth.pageId || "110414661460391",
          pageName: messengerAuth.pageName || "Dokuni Shop",
          status: "connected",
          messagingPermission: "ready",
          messagingStatus: "ready",
          connectedAt: new Date().toISOString(),
          tokenMasked: `${messengerAuth.accessToken.substring(0, 8)}...${messengerAuth.accessToken.slice(-4)}`,
        });
      }

      if (igAuth.accessToken || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
        fallbackList.push({
          id: "instagram",
          type: "instagram",
          platform: "instagram",
          name: "@dokuni.shop",
          pageId: messengerAuth.pageId || "110414661460391",
          pageName: messengerAuth.pageName || "Dokuni Shop",
          igAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || "17841450302428612",
          igUsername: "dokuni.shop",
          status: "connected",
          messagingPermission: "ready",
          messagingStatus: "ready",
          connectedAt: new Date().toISOString(),
          tokenMasked: messengerAuth.accessToken
            ? `${messengerAuth.accessToken.substring(0, 8)}...${messengerAuth.accessToken.slice(-4)}`
            : null,
        });
      }

      localDataCache.saveConnectors(fallbackList);
      return res.json(fallbackList);
    }
    console.error("Error fetching connectors:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/connectors/meta/direct-connect
 * Connects Facebook Messenger or Instagram Direct directly using Page Access Token
 */
router.post("/meta/direct-connect", requireAdmin, async (req, res) => {
  try {
    const { type, pageId, pageName, igAccountId, igUsername, accessToken } = req.body;

    if (!accessToken || typeof accessToken !== "string" || !accessToken.trim()) {
      return res.status(400).json({ error: "Page Access Token is required." });
    }

    const cleanToken = accessToken.trim();
    const targetType = type === "instagram" ? "instagram" : "messenger";

    // 1. Verify token with Meta Graph API
    const verifyResult = await verifyMetaToken(cleanToken);
    if (!verifyResult.ok) {
      return res.status(400).json({
        error: `Meta Graph API rejected token: ${verifyResult.error || "Invalid token"}`,
      });
    }

    const resolvedPageId = pageId?.trim() || verifyResult.id;
    const resolvedPageName = pageName?.trim() || verifyResult.name || "Facebook Page";
    const linkedIg = verifyResult.instagram_business_account;
    const resolvedIgAccountId = igAccountId?.trim() || linkedIg?.id || null;
    const resolvedIgUsername = igUsername?.trim() || linkedIg?.username || null;
    const effectiveToken = verifyResult.pageToken || cleanToken;

    if (targetType === "instagram" && !resolvedIgAccountId && !resolvedIgUsername) {
      // If user is trying to connect Instagram directly, warn if no IG account found on this token
      console.warn("[Connectors] Connecting Instagram but no Instagram Business Account linked to this page token.");
    }

    // 2. Save into Firestore connectors collection
    const connectorRef = db().collection("connectors").doc(targetType);
    const now = new Date().toISOString();

    const connectorData: Record<string, any> = {
      id: targetType,
      type: targetType,
      platform: targetType === "instagram" ? "instagram" : "facebook",
      name: targetType === "instagram"
        ? (resolvedIgUsername ? `@${resolvedIgUsername}` : `Instagram (${resolvedPageName})`)
        : resolvedPageName,
      pageId: resolvedPageId,
      pageName: resolvedPageName,
      igAccountId: resolvedIgAccountId,
      igUsername: resolvedIgUsername,
      accessToken: effectiveToken,
      status: "connected",
      connectedAt: now,
      updatedAt: now,
    };
    if (verifyResult.isUserToken) {
      connectorData.userAccessToken = cleanToken;
    }

    await connectorRef.set(connectorData, { merge: true });

    // 3. Update settings/meta in Firestore as well for unified lookup
    const metaSettingsUpdate: Record<string, any> = {
      updatedAt: now,
    };
    if (targetType === "messenger") {
      metaSettingsUpdate.pageId = resolvedPageId;
      metaSettingsUpdate.pageName = resolvedPageName;
      metaSettingsUpdate.pageAccessToken = effectiveToken;
      if (verifyResult.isUserToken) {
        metaSettingsUpdate.userAccessToken = cleanToken;
      }
    } else {
      metaSettingsUpdate.igAccountId = resolvedIgAccountId;
      metaSettingsUpdate.igUsername = resolvedIgUsername;
      metaSettingsUpdate.instagramAccessToken = effectiveToken;
      if (verifyResult.isUserToken) {
        metaSettingsUpdate.userAccessToken = cleanToken;
      }
    }
    await db().collection("settings").doc("meta").set(metaSettingsUpdate, { merge: true });

    if (effectiveToken) {
      process.env.META_PAGE_ACCESS_TOKEN = effectiveToken;
    }
    if (resolvedPageId) {
      process.env.META_PAGE_ID = resolvedPageId;
    }
    if (resolvedIgAccountId) {
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = resolvedIgAccountId;
    }

    // Sync to .env and local backup
    try {
      const { restoreSecrets } = await import("../syncSecrets.js");
      await restoreSecrets();
    } catch (syncErr) {
      // Non-blocking
    }

    // 4. Audit Log
    await logAudit("ADMIN", "CONNECTOR_CONNECTED", "Connectors", targetType, {
      type: targetType,
      pageId: resolvedPageId,
      pageName: resolvedPageName,
      igAccountId: resolvedIgAccountId,
      igUsername: resolvedIgUsername,
    });

    res.json({
      success: true,
      connector: {
        ...connectorData,
        accessToken: `${cleanToken.substring(0, 8)}...${cleanToken.slice(-4)}`,
      },
      message: `Successfully connected ${targetType === "instagram" ? "Instagram Direct" : "Facebook Page"}!`,
    });
  } catch (error: any) {
    console.error("Direct connect error:", error);
    res.status(500).json({ error: error.message || "Failed to connect Meta platform." });
  }
});

/**
 * POST /api/admin/connectors/meta/test/:type
 * Runs live connection test against Meta Graph API
 */
router.post("/meta/test/:type", requireAdmin, async (req, res) => {
  const { type } = req.params;
  try {
    if (type === "messenger" || type === "facebook") {
      const result = await testFacebookConnection();
      if (result.success) {
         // Opportunistically ensure Meta Page webhook subscription is verified
         subscribePageToWebhooks().catch((subErr) => {
           console.warn("[Connectors] Subscribing webhooks warning:", subErr);
         });
         await db().collection("connectors").doc("messenger").set({
           status: "connected",
           messagingPermission: result.messagingPermission || "ready",
           messagingStatus: result.messagingStatus || "ready"
         }, { merge: true });
      } else {
         await db().collection("connectors").doc("messenger").set({
           status: result.authStatus === "failed" ? "failed" : "connected",
           messagingPermission: "missing",
           messagingStatus: "not_ready"
         }, { merge: true });
      }
      return res.json(result);
    } else if (type === "instagram") {
      const result = await testInstagramConnection();
      if (result.success) {
         subscribePageToWebhooks().catch(() => {});
         await db().collection("connectors").doc("instagram").set({
           status: "connected",
           accountLinked: result.accountLinked,
           messagingPermission: result.messagingPermission || "ready",
           messagingStatus: result.messagingStatus || "ready"
         }, { merge: true });
      } else {
         await db().collection("connectors").doc("instagram").set({
           status: result.authStatus === "failed" ? "failed" : "connected",
           accountLinked: result.accountLinked,
           messagingPermission: "missing",
           messagingStatus: "not_ready"
         }, { merge: true });
      }
      return res.json(result);
    }
    res.status(400).json({ error: "Unknown connector type" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/connectors/meta/subscribe-webhooks
 * Subscribes Page to Webhook events (messages, postbacks, standby)
 */
router.post("/meta/subscribe-webhooks", requireAdmin, async (req, res) => {
  try {
    const result = await subscribePageToWebhooks();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/connectors/meta/oauth/start
 * Starts Meta OAuth flow
 */
router.post("/meta/oauth/start", requireAdmin, async (req, res) => {
  let appId = process.env.META_APP_ID;
  if (!appId) {
    const metaDoc = await db().collection("settings").doc("meta").get();
    if (metaDoc.exists && metaDoc.data()?.appId) {
      appId = metaDoc.data()?.appId;
    }
  }

  if (!appId) {
    return res.status(400).json({ 
      error: "META_APP_ID is not configured. Please use the Direct Token tab to connect with your Page Access Token, or configure your Meta App ID in Meta Settings." 
    });
  }

  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const redirectUri = `${baseUrl}/api/admin/connectors/meta/oauth/callback`;
  
  const state = Math.random().toString(36).substring(7);
  if (req.session) {
    req.session.metaOauthState = state;
  }

  const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata,instagram_basic,instagram_manage_messages`;
  
  res.json({ url });
});

router.get("/meta/oauth/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect("/connectors?meta_auth=error");
  }

  if (state !== req.session?.metaOauthState) {
    return res.redirect("/connectors?meta_auth=state_mismatch");
  }

  let appId = process.env.META_APP_ID;
  let appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    const metaDoc = await db().collection("settings").doc("meta").get();
    if (metaDoc.exists) {
      const data = metaDoc.data();
      appId = appId || data?.appId;
      appSecret = appSecret || data?.appSecret;
    }
  }

  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const redirectUri = `${baseUrl}/api/admin/connectors/meta/oauth/callback`;

  try {
    // Exchange code for token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData: any = await tokenRes.json();

    if (tokenData.error) {
      console.error("Meta OAuth token error:", tokenData.error);
      return res.redirect("/connectors?meta_auth=error");
    }

    if (req.session) {
      req.session.metaOAuthToken = tokenData.access_token;
    }
    res.redirect("/connectors?meta_auth=success");
  } catch (err) {
    console.error("Meta OAuth callback error:", err);
    res.redirect("/connectors?meta_auth=error");
  }
});

router.get("/meta/pages", requireAdmin, async (req, res) => {
  const token = req.session?.metaOAuthToken;
  if (!token) return res.status(401).json({ error: "Not authenticated with Meta OAuth" });

  try {
    let pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(token)}&fields=id,name,access_token,instagram_business_account{id,username}`;
    let pagesRes = await fetch(pagesUrl);
    let pagesData: any = await pagesRes.json();

    if (pagesData.error) {
      // Fallback without instagram_business_account if error code 100 or nonexisting field
      const fallbackUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(token)}&fields=id,name,access_token`;
      const fallbackRes = await fetch(fallbackUrl);
      pagesData = await fallbackRes.json();
    }

    if (pagesData.error) {
      return res.status(400).json({ error: pagesData.error.message });
    }

    res.json(pagesData.data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/meta/connect", requireAdmin, async (req, res) => {
  const { id, type, name, pageId, pageName, igAccountId, igUsername, accessToken } = req.body;
  const targetType = type === "instagram" ? "instagram" : "messenger";
  
  try {
    const connectorRef = db().collection("connectors").doc(id || targetType);
    const now = new Date().toISOString();
    await connectorRef.set({
      id: id || targetType,
      type: targetType,
      platform: targetType === "instagram" ? "instagram" : "facebook",
      name,
      pageId,
      pageName,
      igAccountId: igAccountId || null,
      igUsername: igUsername || null,
      accessToken,
      status: "connected",
      connectedAt: now,
      updatedAt: now,
    });

    await logAudit("ADMIN", "CONNECTOR_CONNECTED", "Connectors", targetType, {
      type: targetType,
      pageId,
      pageName,
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/meta/disconnect", requireAdmin, async (req, res) => {
  const { id } = req.body;
  try {
    await db().collection("connectors").doc(id).delete();
    // Also mark in settings
    const docId = id === "instagram" ? "instagram" : "messenger";
    if (docId === "messenger") {
      await db().collection("settings").doc("meta").set({
        pageAccessToken: null,
        pageId: null,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } else {
      await db().collection("settings").doc("meta").set({
        instagramAccessToken: null,
        igAccountId: null,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

    await logAudit("ADMIN", "CONNECTOR_DISCONNECTED", "Connectors", id, {});
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET & POST /api/admin/connectors/meta/config
 * Manage Meta App ID, Secret, and Webhook Verify Token in Firestore
 */
router.get("/meta/config", requireAdmin, async (req, res) => {
  try {
    const doc = await db().collection("settings").doc("meta").get();
    const data = doc.exists ? doc.data() : {};

    const host = req.headers["x-forwarded-host"] || req.headers.host || "";
    const proto = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
    const rawBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
    const effectiveBaseUrl = (rawBaseUrl && !rawBaseUrl.includes("localhost"))
      ? rawBaseUrl.replace(/\/$/, "")
      : (host ? `${proto}://${host}` : "");
    const webhookUrl = effectiveBaseUrl ? `${effectiveBaseUrl}/api/webhooks/meta` : "/api/webhooks/meta";

    res.json({
      appId: data?.appId || process.env.META_APP_ID || "",
      hasAppSecret: !!(data?.appSecret || process.env.META_APP_SECRET),
      verifyToken: data?.verifyToken || process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || "ai_sales_meta_verify_token",
      webhookUrl: webhookUrl,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/meta/config", requireAdmin, async (req, res) => {
  try {
    const { appId, appSecret, verifyToken } = req.body;
    const updateData: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (appId !== undefined) updateData.appId = appId.trim();
    if (verifyToken !== undefined) updateData.verifyToken = verifyToken.trim();

    await db().collection("settings").doc("meta").set(updateData, { merge: true });

    if (updateData.appId) process.env.META_APP_ID = updateData.appId;
    if (updateData.verifyToken) process.env.META_WEBHOOK_VERIFY_TOKEN = updateData.verifyToken;

    try {
      const { restoreSecrets } = await import("../syncSecrets.js");
      await restoreSecrets();
    } catch (syncErr) {
      // Non-blocking
    }

    await logAudit("ADMIN", "META_CONFIG_SAVED", "Settings", "meta", {
      hasAppId: !!updateData.appId,
      hasAppSecret: !!updateData.appSecret,
      hasVerifyToken: !!updateData.verifyToken,
    });

    res.json({ success: true, message: "Meta configuration saved successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/meta/diagnostic", async (req, res) => {
  let diagnostic = {
    httpClientInitialized: typeof fetch === "function" ? "YES" : "NO",
    metaRequestExecuted: "NO",
    metaHttpStatus: null as number | null,
    metaResponseSuccess: "NO",
    metaErrorMessage: null as string | null
  };
  try {
    diagnostic.metaRequestExecuted = "YES";
    const resTest = await fetch("https://graph.facebook.com/v19.0/me?access_token=dummy_token_test");
    diagnostic.metaHttpStatus = resTest.status;
    const data = await resTest.json().catch(() => null);
    if (resTest.ok) diagnostic.metaResponseSuccess = "YES";
    else diagnostic.metaErrorMessage = data?.error?.message || "Unknown Meta Error";
  } catch (err: any) {
    diagnostic.metaErrorMessage = err.message;
  }
  res.json(diagnostic);
});

export default router;

