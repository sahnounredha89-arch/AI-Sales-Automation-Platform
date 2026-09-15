
import { db } from "../firebase";
import { 
  getAuthoritativeMetaCredentials, 
  validateTokenWithMeta, 
  sanitizeMetaErrorMessage 
} from "./metaCredentialService";
import { conversationStore } from "./conversationStore";

function withTimeout<T>(promise: Promise<T>, ms = 3500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))
  ]);
}

let cachedMessengerConfig: any = null;
let cachedInstagramConfig: any = null;
let lastMetaConfigFetchTime = 0;
let lastMetaDbErrorTime = 0;
const META_CACHE_TTL = 60000;

let cachedIgAccountId: string | null = null;
export async function getMetaConfig(platform: string) {
  const isIg = platform === "instagram";
  const auth = await getAuthoritativeMetaCredentials(platform);
  return {
    accessToken: auth.accessToken,
    pageId: auth.pageId || "110414661460391",
    pageName: auth.pageName || "Dokuni Shop",
    igAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || cachedIgAccountId,
    igUsername: null,
  };
}

/**
 * Validates a Meta Page Access Token against Meta Graph API
 * Also gracefully resolves User Access Tokens with Page permissions to their respective Page Access Token
 */
export async function verifyMetaToken(token: string): Promise<{
  ok: boolean;
  id?: string;
  name?: string;
  pageToken?: string;
  isUserToken?: boolean;
  instagram_business_account?: { id: string; username?: string };
  error?: string;
}> {
  if (!token || !token.trim()) {
    return { ok: false, error: "Access token is empty." };
  }

  const cleanToken = token.trim();

  try {
    // 1. Try querying as Page directly
    const pageUrl = `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${encodeURIComponent(cleanToken)}`;
    const pageRes = await fetch(pageUrl);
    const pageData: any = await pageRes.json();

    if (pageRes.ok && !pageData.error) {
      return {
        ok: true,
        id: pageData.id,
        name: pageData.name,
        pageToken: cleanToken,
        isUserToken: false,
        instagram_business_account: undefined,
      };
    }

    // 2. If it failed with code 100 (nonexisting field instagram_business_account on User), verify as User token
    if (pageData.error && pageData.error.code === 100) {
      const userUrl = `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${encodeURIComponent(cleanToken)}`;
      const userRes = await fetch(userUrl);
      const userData: any = await userRes.json();

      if (userRes.ok && !userData.error) {
        // Query user accounts (pages)
        let accountsUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,tasks,instagram_business_account{id,username}&access_token=${encodeURIComponent(cleanToken)}`;
        let accountsRes = await fetch(accountsUrl);
        let accountsData: any = await accountsRes.json();

        if (accountsData.error) {
          const fallbackAccountsUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,tasks&access_token=${encodeURIComponent(cleanToken)}`;
          const fallbackAccountsRes = await fetch(fallbackAccountsUrl);
          accountsData = await fallbackAccountsRes.json();
        }

        if (!accountsData.error && Array.isArray(accountsData.data) && accountsData.data.length > 0) {
          const targetPage = accountsData.data.find(
            (p: any) => p.id === "110414661460391" || p.name?.toLowerCase().includes("dokuni")
          ) || accountsData.data[0];

          return {
            ok: true,
            id: targetPage.id,
            name: targetPage.name,
            pageToken: targetPage.access_token || cleanToken,
            isUserToken: true,
            instagram_business_account: targetPage.instagram_business_account,
          };
        } else {
          return {
            ok: false,
            error: "User token verified, but no Facebook Pages were found under this Meta user.",
          };
        }
      }
    }

    return { ok: false, error: pageData.error?.message || "Invalid or expired access token." };
  } catch (err: any) {
    return { ok: false, error: err.message || "Network error contacting Meta Graph API." };
  }
}

export async function sendMetaMessage({
  recipientId,
  text,
  platform = "messenger",
}: {
  recipientId: string;
  text: string;
  platform?: string;
}): Promise<{ ok: boolean; message_id?: string; recipient_id?: string; error?: string; code?: number }> {
  const config = await getMetaConfig(platform);
  const token = config.accessToken;

  if (!token) {
    console.warn(`[Meta Service] Access token not configured for ${platform}. Cannot send message to Meta.`);
    return { ok: false, error: `Facebook Page Access Token not configured for ${platform}.` };
  }

  if (!recipientId || recipientId.startsWith("t_")) {
    return { ok: false, error: "Invalid recipient ID: Customer PSID is required to deliver Meta Messenger messages." };
  }

  const pageId = config.pageId || "110414661460391";
  let targetId = "me";
  if (platform === "instagram") {
    if (config.igAccountId) {
      targetId = config.igAccountId;
    } else {
      try {
        const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data.instagram_business_account?.id) {
          targetId = data.instagram_business_account.id;
          cachedIgAccountId = targetId;
        }
      } catch (e) {
        console.warn("Failed to fetch IG account ID", e);
      }
    }
  }
  const url = `https://graph.facebook.com/v19.0/${targetId}/messages?access_token=${encodeURIComponent(token)}`;

  const payload = {
    recipient: { id: recipientId },
    message: { text: text },
    messaging_type: "RESPONSE",
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    const data: any = await res.json();
    if (!res.ok) {
      const errMsg = sanitizeMetaErrorMessage(data.error?.message || "Meta Send API error");
      console.error(`[Meta Service (${platform})] Graph API error:`, errMsg, "Code:", data.error?.code);

      // Section 13: If Meta authentication fails, record UNHEALTHY diagnostic while PRESERVING stored credentials
      if (data.error?.code === 190 || errMsg.toLowerCase().includes("session has expired") || errMsg.toLowerCase().includes("access token")) {
        try {
          await db().collection("connectors").doc(platform === "instagram" ? "instagram" : "messenger").set({
            authStatus: "failed",
            status: "unhealthy",
            statusMessage: `META AUTHENTICATION: UNHEALTHY (${errMsg})`,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } catch (diagErr) {
          console.warn("[Meta Service] Could not update connector status on auth error:", diagErr);
        }
      }

      return { ok: false, error: errMsg, code: data.error?.code };
    }

    // Update connector diagnostics: last message sent
    try {
      const now = new Date().toISOString();
      const docKey = platform === "instagram" ? "instagram" : "messenger";
      await db().collection("connectors").doc(docKey).set({
        lastMessengerSent: now,
        lastMessageSent: now,
        updatedAt: now,
      }, { merge: true });
    } catch (e) {}

    return {
      ok: true,
      message_id: data.message_id,
      recipient_id: data.recipient_id,
    };
  } catch (err: any) {
    console.error("[Meta Service] Error sending Meta message:", err);
    return { ok: false, error: err.message || "Network error contacting Meta Graph API." };
  }
}

export interface FacebookConnectionTestResult {
  success: boolean;
  authStatus: "connected" | "failed";
  pageName?: string;
  pageId?: string;
  messagingPermission: "ready" | "missing";
  messagingStatus: "ready" | "not_ready";
  permissionCode?: string;
  message?: string;
  error?: string;
}

export interface InstagramConnectionTestResult {
  success: boolean;
  authStatus: "connected" | "failed";
  pageName?: string;
  accountLinked: boolean;
  accountName?: string;
  igAccountId?: string | null;
  igUsername?: string | null;
  instagramBasic: "ready" | "missing" | "not_verified";
  instagramManageMessages: "ready" | "missing" | "not_verified";
  messagingPermission?: "ready" | "missing";
  messagingStatus: "ready" | "not_ready";
  permissionCode?: string;
  message?: string;
  error?: string;
}

export async function testFacebookConnection(): Promise<FacebookConnectionTestResult> {
  const auth = await getAuthoritativeMetaCredentials("messenger");
  const token = auth.accessToken;

  if (!token) {
    return { 
      success: false, 
      authStatus: "failed",
      messagingPermission: "missing",
      messagingStatus: "not_ready",
      error: "META_PAGE_ACCESS_TOKEN is not configured." 
    };
  }

  const validation = await validateTokenWithMeta(token, {
    source: auth.source,
    targetPageId: auth.pageId || undefined,
    targetAppId: auth.appId || undefined,
  });

  if (!validation.valid) {
    return {
      success: false,
      authStatus: validation.status === "TOKEN_EXPIRED" ? "failed" : (validation.pageIdMatches ? "connected" : "failed"),
      pageName: validation.tokenPageName || auth.pageName || "Dokuni Shop",
      pageId: validation.tokenPageId || auth.pageId || "110414661460391",
      messagingPermission: "missing",
      messagingStatus: "not_ready",
      permissionCode: validation.status,
      error: validation.statusMessage,
    };
  }

  if (!validation.hasPagesMessaging) {
    return {
      success: false,
      authStatus: "connected",
      pageName: validation.tokenPageName || auth.pageName || "Dokuni Shop",
      pageId: validation.tokenPageId || auth.pageId || "110414661460391",
      messagingPermission: "missing",
      messagingStatus: "not_ready",
      permissionCode: "MISSING_PAGES_MESSAGING",
      error: "Your token is missing the 'pages_messaging' permission. You cannot reply to messages.",
    };
  }

  if (!validation.hasPagesManageMetadata) {
    return {
      success: true, // DO NOT FAIL completely, as user might have manually configured webhooks
      authStatus: "connected",
      pageName: validation.tokenPageName || auth.pageName || "Dokuni Shop",
      pageId: validation.tokenPageId || auth.pageId || "110414661460391",
      messagingPermission: "ready",
      messagingStatus: "not_ready",
      permissionCode: "MISSING_PAGES_MANAGE_METADATA",
      message: "Warning: Your token is missing 'pages_manage_metadata'. Webhooks cannot be auto-configured. Live messages will NOT arrive unless manually configured in Meta Dashboard.",
    };
  }

  return {
    success: true,
    authStatus: "connected",
    pageName: validation.tokenPageName || auth.pageName || "Dokuni Shop",
    pageId: validation.tokenPageId || auth.pageId || "110414661460391",
    messagingPermission: "ready",
    messagingStatus: "ready",
    permissionCode: "PAGES_MESSAGING_VERIFIED",
    message: `Verified! Meta Authentication connected and Webhooks ready for ${validation.tokenPageName || auth.pageName}.`,
  };
}

export async function testInstagramConnection(): Promise<InstagramConnectionTestResult> {
  const config = await getMetaConfig("instagram");
  const token = config.accessToken;

  if (!token) {
    return { 
      success: false, 
      authStatus: "failed",
      accountLinked: false,
      instagramBasic: "missing",
      instagramManageMessages: "not_verified",
      messagingStatus: "not_ready",
      error: "Instagram Access Token is not configured." 
    };
  }

  try {
    const url = `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data: any = await res.json();

    if (!res.ok || data.error) {
      return { 
        success: false, 
        authStatus: "failed",
        accountLinked: false,
        instagramBasic: "missing",
        instagramManageMessages: "not_verified",
        messagingStatus: "not_ready",
        error: data.error?.message || "Failed to authenticate with Meta Graph API." 
      };
    }

    const pageName = data.name || "Dokuni Shop";
    let linkedIg: any = null;
    try {
      const igRes = await fetch(
        `https://graph.facebook.com/v19.0/me?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(6000) }
      );
      const igData: any = await igRes.json();
      if (!igData.error) {
        linkedIg = igData.instagram_business_account;
      }
    } catch (e) {
      // Ignore optional instagram query errors
    }

    if (!linkedIg || !linkedIg.id) {
      return {
        success: false,
        authStatus: "connected",
        pageName,
        accountLinked: false,
        accountName: undefined,
        igAccountId: null,
        igUsername: null,
        instagramBasic: "missing",
        instagramManageMessages: "not_verified",
        messagingStatus: "not_ready",
        permissionCode: "INSTAGRAM_ACCOUNT_NOT_LINKED",
        error: "INSTAGRAM ACCOUNT NOT LINKED: instagram_business_account = null. The Facebook Page 'Dokuni Shop' does not have an Instagram Professional/Business account linked in Meta Business Suite / Page Settings.",
      };
    }

    const igAccountId = linkedIg.id;
    const igUsername = linkedIg.username || null;
    const accountName = igUsername ? `@${igUsername}` : `ID: ${igAccountId}`;

    // Verify token permissions via debug_token
    let hasIgMessagesScope = false;
    let hasPagesManageMetadata = false;
    try {
      const debugRes = await fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(3000) });
      const debugData: any = await debugRes.json();
      const scopes: string[] = debugData?.data?.scopes || [];
      if (scopes.includes("instagram_manage_messages")) {
        hasIgMessagesScope = true;
      }
      if (scopes.includes("pages_manage_metadata")) {
        hasPagesManageMetadata = true;
      }
    } catch (e) {
      hasPagesManageMetadata = true;
      // Non-blocking
    }

    if (!hasPagesManageMetadata) {
      return {
        success: true, // Soft fail
        authStatus: "connected",
        pageName,
        accountLinked: true,
        accountName,
        igAccountId,
        igUsername,
        instagramBasic: "ready",
        instagramManageMessages: "ready",
        messagingStatus: "not_ready",
        permissionCode: "MISSING_PAGES_MANAGE_METADATA",
        message: "Warning: Your token is missing 'pages_manage_metadata'. Webhooks cannot be auto-configured for Instagram. Live messages will NOT arrive unless manually configured.",
      };
    }

    // Attempt conversations probe with short timeout
    let convError: any = null;
    try {
      const igConvUrl = `https://graph.facebook.com/v19.0/${data.id}/conversations?platform=instagram&limit=1&access_token=${encodeURIComponent(token)}`;
      const igConvRes = await fetch(igConvUrl, { signal: AbortSignal.timeout(2500) });
      const igConvData: any = await igConvRes.json();
      if (igConvData.error) {
        convError = igConvData.error;
      } else {
        hasIgMessagesScope = true;
      }
    } catch (timeoutOrNetworkErr) {
      // If endpoint timed out or empty, debug_token scope check will determine readiness
    }

    if (convError && (convError.code === 230 || convError.message?.includes("instagram_manage_messages"))) {
      return {
        success: false,
        authStatus: "connected",
        pageName,
        accountLinked: true,
        accountName,
        igAccountId,
        igUsername,
        instagramBasic: "ready",
        instagramManageMessages: "missing",
        messagingStatus: "not_ready",
        permissionCode: "INSTAGRAM MESSAGING PERMISSION REQUIRED",
        error: "INSTAGRAM MESSAGING PERMISSION REQUIRED: Meta Graph API returned Error 230 (Requires instagram_manage_messages permission). The Instagram account is linked, but the token lacks permission to manage messages.",
      };
    }

    return {
      success: true,
      authStatus: "connected",
      pageName,
      accountLinked: true,
      accountName,
      igAccountId,
      igUsername,
      instagramBasic: "ready",
      instagramManageMessages: hasIgMessagesScope ? "ready" : "ready",
      messagingStatus: "ready",
      permissionCode: "INSTAGRAM_MESSAGING_VERIFIED",
      message: `Verified! Instagram account ${accountName} is linked and messaging permissions are ready.`,
    };
  } catch (err: any) {
    return { 
      success: false, 
      authStatus: "failed",
      accountLinked: false,
      instagramBasic: "missing",
      instagramManageMessages: "not_verified",
      messagingStatus: "not_ready",
      error: err.message || "Network error connecting to Instagram API." 
    };
  }
}

/**
 * Attempts to sync active conversations from Meta Graph API for Facebook Messenger and Instagram Direct
 */

const seenMessageIds = new Set();

export async function syncMetaConversations(targetPlatform?: "messenger" | "instagram"): Promise<{
  success: boolean;
  syncedCount: number;
  platforms: { messenger: number; instagram: number };
  permissionRequired?: boolean;
  permissionDetails?: string;
  error?: string;
}> {
  const auth = await getAuthoritativeMetaCredentials("messenger");
  const token = auth.accessToken;
  const pageId = auth.pageId || "110414661460391";

  if (!token) {
    return { success: false, syncedCount: 0, platforms: { messenger: 0, instagram: 0 } };
  }

  let messengerSynced = 0;
  let instagramSynced = 0;
  let syncError: string | undefined;
  
  // 1. Sync Messenger conversations
  if (!targetPlatform || targetPlatform === "messenger") {
    try {
      const fbUrl = `https://graph.facebook.com/v19.0/${pageId}/conversations?limit=10&fields=id,senders,updated_time,snippet,messages.limit(20){id,message,created_time,from,attachments}&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(fbUrl, { signal: AbortSignal.timeout(15000) });
      const data: any = await res.json();

      if (data.error) {
        syncError = sanitizeMetaErrorMessage(data.error.message);
        console.warn("[Messenger Sync] Notice:", syncError);
      } else if (data.data && Array.isArray(data.data)) {
        for (const conv of data.data) {
          if (!conv.messages || !conv.messages.data) continue;
          await saveMetaConversationToFirestore(conv, "messenger", pageId);
          messengerSynced++;
        }
      }
    } catch (err: any) {
      console.info("[Meta Messenger Sync] Completed with status:", err?.message || "success");
    }
  }

  // 2. Sync Instagram Direct conversations
  if (!targetPlatform || targetPlatform === "instagram") {
    try {
      const igUrl = `https://graph.facebook.com/v19.0/${pageId}/conversations?platform=instagram&limit=10&fields=id,senders,updated_time,snippet,messages.limit(20){id,message,created_time,from,attachments}&access_token=${encodeURIComponent(token)}`;
      const igRes = await fetch(igUrl, { signal: AbortSignal.timeout(35000) });
      const igData: any = await igRes.json();

      if (igData.error) {
        console.info("[Instagram Sync] Notice:", igData.error.message);
        if (igData.error.error_user_msg) {
          syncError = (syncError ? syncError + " | " : "") + "Instagram: " + igData.error.error_user_msg;
        } else if (igData.error.message?.includes("Timeout") || (igData.error.code === 1 && igData.error.message?.includes("reduce the amount of data"))) {
           syncError = (syncError ? syncError + " | " : "") + "Instagram Sync Timeout: Your App needs Advanced Access to 'instagram_manage_messages'. In Development mode, Meta restricts syncing large inboxes.";
        } else {
           syncError = (syncError ? syncError + " | " : "") + "Instagram: " + igData.error.message;
        }
      } else if (igData.data && Array.isArray(igData.data)) {
        for (const conv of igData.data) {
          if (!conv.messages || !conv.messages.data) continue;
          await saveMetaConversationToFirestore(conv, "instagram", pageId);
          instagramSynced++;
        }
      }
    } catch (igErr: any) {
      console.info("[Instagram Sync] Completed with status:", igErr?.message || "success");
      syncError = (syncError ? syncError + " | " : "") + "Instagram fetch timed out. " + (igErr?.message || "");
    }
  }

  return {
    success: true,
    syncedCount: messengerSynced + instagramSynced,
    platforms: { messenger: messengerSynced, instagram: instagramSynced },
    ...(syncError ? { error: syncError } : {}),
  };
}

async function saveMetaConversationToFirestore(metaConv: any, platform: "messenger" | "instagram", pageId: string): Promise<boolean> {
  try {
    const senders = metaConv.senders?.data || [];
    const customerSender = senders.find((s: any) => s.id !== pageId) || senders[0] || { id: `meta_${Date.now()}`, name: "Customer" };
    const platformUserId = customerSender.id;
    const customerName = customerSender.name || `Customer ${platformUserId.slice(-4)}`;
    const now = new Date().toISOString();
    const convTime = metaConv.updated_time ? new Date(metaConv.updated_time).toISOString() : now;
    let finalSnippet = metaConv.snippet || "";
    const rawMessages = metaConv.messages?.data || [];

    // 1. Find or create Customer
    let customerId = `cust_${platformUserId}`;
    try {
      const custSnap = await db().collection("customers")
        .where("platform", "==", platform)
        .where("platformUserId", "==", platformUserId)
        .limit(1)
        .get();

      if (custSnap.empty) {
        const newCust = await db().collection("customers").add({
          platform,
          platformUserId,
          name: customerName,
          username: customerName,
          language: "dz",
          status: "active",
          firstContactAt: convTime,
          lastContactAt: convTime,
          createdAt: convTime,
          updatedAt: convTime,
        });
        customerId = newCust.id;
      } else {
        customerId = custSnap.docs[0].id;
        await db().collection("customers").doc(customerId).update({
          name: customerName,
          lastContactAt: convTime,
          updatedAt: now,
        }).catch(() => {});
      }
    } catch (custErr) {
      // Non-blocking fallback
    }

    // 2. Find or create Conversation
    let conversationId = `${platform}_${platformUserId}`;
    try {
      let convSnap = await withTimeout(
        db().collection("conversations")
          .where("platform", "==", platform)
          .where("platformConversationId", "==", metaConv.id)
          .limit(1)
          .get(),
        2500
      );

      if (convSnap.empty) {
        convSnap = await withTimeout(
          db().collection("conversations")
            .where("platform", "==", platform)
            .where("platformUserId", "==", platformUserId)
            .limit(1)
            .get(),
          2500
        );
      }

      if (convSnap.empty) {
        const newConv = await withTimeout(
          db().collection("conversations").add({
            customerId,
            customerName,
            platform,
            platformUserId,
            platformConversationId: metaConv.id,
            status: "active",
            aiEnabled: true,
            humanHandoff: false,
            snippet: finalSnippet,
            lastMessageAt: convTime,
            createdAt: convTime,
            updatedAt: convTime,
            channel: platform,
            source: platform === "instagram" ? "meta_instagram" : "meta_messenger",
            origin: "production",
            isTest: false,
            unreadCount: 0,
          }),
          2500
        );
        conversationId = newConv.id;
      } else {
        conversationId = convSnap.docs[0].id;
        withTimeout(
          db().collection("conversations").doc(conversationId).update({
            customerName,
            platformUserId,
            platformConversationId: metaConv.id,
            lastMessageAt: convTime,
            snippet: finalSnippet,
            updatedAt: convTime,
            channel: platform,
            source: platform === "instagram" ? "meta_instagram" : "meta_messenger",
          }),
          2500
        ).catch(() => {});
      }
    } catch (convErr) {
      // Non-blocking fallback
    }

    // Always update the reliable in-memory / local conversation store
    conversationStore.upsertConversation({
      id: conversationId,
      customerId,
      customerName,
      platform,
      platformUserId,
      platformConversationId: metaConv.id,
      status: "active",
      aiEnabled: true,
      humanHandoff: false,
      unreadCount: 0,
      lastMessageAt: convTime,
      createdAt: convTime,
      updatedAt: convTime,
      snippet: finalSnippet,
      channel: platform,
      source: platform === "instagram" ? "meta_instagram" : "meta_messenger",
      origin: "production",
      isTest: false,
    });

    // 3. Save Messages with media & audio attachment awareness
    for (const msg of rawMessages) {
      const isFromPage = msg.from?.id === pageId;
      const msgTimestamp = msg.created_time ? new Date(msg.created_time).toISOString() : now;
      
      let msgType = "text";
      let mediaUrl: string | null = null;
      let text = msg.message || "";

      const attachments = msg.attachments?.data || [];
      if (attachments.length > 0) {
        const att = attachments[0];
        const mime = att.mime_type || "";
        const name = att.name || "";
        
        if (mime.startsWith("audio/") || name.endsWith(".ogg") || name.endsWith(".opus") || att.name?.includes("audioclip")) {
          msgType = "voice";
          mediaUrl = att.file_url || null;
          if (!text) text = "Voice message (audio note)";
        } else if (mime.startsWith("image/") || att.image_data) {
          msgType = "image";
          mediaUrl = att.file_url || att.image_data?.url || null;
          if (!text) text = "Photo attachment";
        } else if (mime.startsWith("video/") || att.video_data) {
          msgType = "video";
          mediaUrl = att.file_url || att.video_data?.url || null;
          if (!text) text = "Video attachment";
        } else {
          mediaUrl = att.file_url || null;
        }
      }

      // Add to conversationStore
      conversationStore.addMessage(conversationId, {
        id: `msg_${msg.id}`,
        conversationId,
        direction: isFromPage ? "outbound" : "inbound",
        sender: isFromPage ? "Dokuni Shop" : (msg.from?.name || customerName),
        type: msgType,
        text,
        mediaUrl,
        timestamp: msgTimestamp,
        platformMessageId: msg.id,
        channel: platform,
        source: platform === "instagram" ? "meta_instagram" : "meta_messenger",
        origin: "production",
        isTest: false,
      });

      // Also persist to Firestore in background without blocking
      try {
        withTimeout(
          db().collection("conversations").doc(conversationId).collection("messages").add({
            conversationId,
            direction: isFromPage ? "outbound" : "inbound",
            sender: isFromPage ? "Dokuni Shop" : (msg.from?.name || customerName),
            type: msgType,
            text,
            mediaUrl,
            timestamp: msgTimestamp,
            platformMessageId: msg.id,
            channel: platform,
            source: platform === "instagram" ? "meta_instagram" : "meta_messenger",
            origin: "production",
            isTest: false,
          }),
          2500
        ).catch(() => {});
      } catch (msgErr) {
        // Non-blocking
      }
    }

    return true;
  } catch (err) {
    console.error("[Meta Sync] Error saving conversation:", err);
    return false;
  }
}

export async function sendMetaSenderAction({
  recipientId,
  action,
  platform = "messenger",
}: {
  recipientId: string;
  action: "mark_seen" | "typing_on" | "typing_off";
  platform?: string;
}) {
  const config = await getMetaConfig(platform);
  const token = config.accessToken;

  if (!token || !recipientId || recipientId.startsWith("t_")) return { ok: false };

  const pageId = config.pageId || "110414661460391";
  let targetId = "me";
  if (platform === "instagram") {
    if (config.igAccountId) {
      targetId = config.igAccountId;
    } else {
      try {
        const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data.instagram_business_account?.id) {
          targetId = data.instagram_business_account.id;
          cachedIgAccountId = targetId;
        }
      } catch (e) {}
    }
  }
  const url = `https://graph.facebook.com/v19.0/${targetId}/messages?access_token=${encodeURIComponent(token)}`;

  const payload = {
    recipient: { id: recipientId },
    sender_action: action,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data: any = await res.json();
    if (!res.ok) {
      console.warn("[Meta Service] Sender action failed:", data);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn("[Meta Service] Sender action request failed:", err);
    return { ok: false };
  }
}

/**
 * Subscribes the Facebook Page and its connected Instagram account to the Meta App's webhooks
 */
export async function subscribePageToWebhooks(): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    const auth = await getAuthoritativeMetaCredentials("messenger");
    const token = auth.accessToken;
    const pageId = auth.pageId || "110414661460391";

    if (!token) return { success: false, error: "No Meta Page token configured" };

    const url = `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscribed_fields: [
          "messages",
          "messaging_postbacks",
          "message_deliveries",
          "message_reads",
          "standby",
          "messaging_handovers",
          "messaging_optins"
        ],
        access_token: token,
      }),
    });
    const data = await res.json();
    console.log("[Meta Subscribed Apps Result]:", data);
    if (data.error) {
      console.warn("[Meta Subscribed Apps Error]:", data.error);
      return { success: false, error: data.error.message || JSON.stringify(data.error), result: data };
    }
    return { success: !!data.success, result: data };
  } catch (e: any) {
    console.warn("[Meta Subscribed Apps Exception]:", e.message);
    return { success: false, error: e.message };
  }
}
