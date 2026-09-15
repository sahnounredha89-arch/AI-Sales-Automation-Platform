import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { db } from "../firebase";
import { logAudit } from "./auditService";

export type MetaTokenStatus =
  | "TOKEN_VALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALID"
  | "TOKEN_REVOKED_OR_INVALIDATED"
  | "TOKEN_PERMISSION_ERROR"
  | "TOKEN_APP_MISMATCH"
  | "TOKEN_PAGE_MISMATCH"
  | "TOKEN_NOT_CONFIGURED"
  | "META_API_UNAVAILABLE"
  | "META_RATE_LIMITED"
  | "UNKNOWN_META_ERROR";

export interface SafeTokenMetadata {
  present: boolean;
  length: number;
  prefix: string;
  suffix: string;
  fingerprint: string;
}

export interface CredentialSourceInfo {
  source: string;
  displayName: string;
  present: boolean;
  length: number;
  prefix: string;
  suffix: string;
  fingerprint: string;
  matchesAuthoritative: boolean;
}

export interface MetaValidationResult {
  valid: boolean;
  status: MetaTokenStatus;
  statusMessage: string;
  tokenFingerprint: string;
  tokenPrefix: string;
  tokenSuffix: string;
  tokenLength: number;
  tokenSource: string;
  configuredAppId: string | null;
  configuredPageId: string | null;
  appIdMatches: boolean;
  pageIdMatches: boolean;
  tokenAppId: string | null;
  tokenUserId: string | null;
  tokenPageId: string | null;
  tokenPageName: string | null;
  tokenType: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  dataAccessExpiresAt: string | null;
  permissions: string[];
  hasPagesMessaging: boolean;
  hasPagesManageMetadata: boolean;
  hasInstagramManageMessages: boolean;
  lastValidatedAt: string;
  lastValidationErrorCode: number | null;
  lastValidationErrorSubcode: number | null;
  lastValidationErrorType: string | null;
  lastValidationErrorMessage: string | null;
}

export interface MetaCredentialHealthReport extends MetaValidationResult {
  configured: boolean;
  sources: CredentialSourceInfo[];
  allSourcesMatch: boolean;
  hasAppSecret: boolean;
  hasVerifyToken: boolean;
  verifyToken: string;
  webhookUrl: string;
}

// In-memory cache for safe validation diagnostic
let cachedValidationResult: MetaValidationResult | null = null;
let lastValidationTimestamp = 0;
const VALIDATION_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache to protect Meta rate limits

/**
 * Generate a deterministic SHA-256 fingerprint for a credential string
 */
export function hashToken(token: string | null | undefined): string {
  if (!token || typeof token !== "string" || !token.trim()) {
    return "";
  }
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * Produce safe token metadata without revealing the raw secret
 */
export function getSafeTokenMetadata(token: string | null | undefined): SafeTokenMetadata {
  if (!token || typeof token !== "string" || !token.trim()) {
    return {
      present: false,
      length: 0,
      prefix: "",
      suffix: "",
      fingerprint: "",
    };
  }
  const clean = token.trim();
  return {
    present: true,
    length: clean.length,
    prefix: clean.length >= 6 ? clean.substring(0, 6) : clean,
    suffix: clean.length >= 4 ? clean.slice(-4) : clean,
    fingerprint: hashToken(clean),
  };
}

/**
 * Sanitize error messages from Meta to prevent any accidental token leakage
 */
export function sanitizeMetaErrorMessage(msg: string | null | undefined): string {
  if (!msg) return "";
  // Strip any access_token= query parameters or long EAA strings
  return msg
    .replace(/access_token=[a-zA-Z0-9_-]+/gi, "access_token=[REDACTED]")
    .replace(/EA[A-Za-z0-9_-]{20,}/g, "[REDACTED_META_TOKEN]");
}

/**
 * Get authoritative Meta credentials following a strict hierarchy:
 * 1. Runtime process.env (Server Configuration Loader)
 * 2. Firestore connectors document (Persistent store)
 * 3. Firestore settings/meta document
 * 4. Local persistent backup file
 */
export async function getAuthoritativeMetaCredentials(platform: string = "messenger"): Promise<{
  accessToken: string | null;
  pageId: string | null;
  pageName: string | null;
  appId: string | null;
  appSecret: string | null;
  verifyToken: string | null;
  source: string;
  fingerprint: string;
  isConfigured: boolean;
}> {
  const isIg = platform === "instagram";
  let token: string | null = null;
  let pageId: string | null = process.env.META_PAGE_ID || "110414661460391";
  let pageName: string | null = process.env.META_PAGE_NAME || "Dokuni Shop";
  let appId: string | null = process.env.META_APP_ID || "1006322732424651";
  let appSecret: string | null = process.env.META_APP_SECRET || null;
  let verifyToken: string | null =
    process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || "ai_sales_meta_verify_token";
  let source = "none";

  // Check 1: Runtime process.env (Top priority)
  const envToken = isIg
    ? (process.env.META_INSTAGRAM_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN)
    : process.env.META_PAGE_ACCESS_TOKEN;

  if (envToken && typeof envToken === "string" && envToken.trim().length > 0) {
    token = envToken.trim();
    source = "runtime_environment";
  }

  // Check 2: Firestore connectors collection
  if (!token) {
    try {
      const doc = await db().collection("connectors").doc(isIg ? "instagram" : "messenger").get();
      if (doc.exists) {
        const data = doc.data();
        const docToken = data?.accessToken || data?.pageAccessToken;
        if (docToken && typeof docToken === "string" && docToken.trim().length > 0) {
          token = docToken.trim();
          source = "firestore_connectors";
          if (data?.pageId) pageId = data.pageId;
          if (data?.pageName) pageName = data.pageName;
        }
      }
    } catch (err) {
      // Ignore database read errors
    }
  }

  // Check 3: Firestore settings/meta
  if (!token) {
    try {
      const doc = await db().collection("settings").doc("meta").get();
      if (doc.exists) {
        const data = doc.data();
        const docToken = isIg ? data?.instagramAccessToken : data?.pageAccessToken;
        if (docToken && typeof docToken === "string" && docToken.trim().length > 0) {
          token = docToken.trim();
          source = "firestore_settings";
          if (data?.pageId) pageId = data.pageId;
          if (data?.pageName) pageName = data.pageName;
          if (data?.appId) appId = data.appId;
          if (data?.appSecret) appSecret = data.appSecret;
          if (data?.verifyToken) verifyToken = data.verifyToken;
        }
      }
    } catch (err) {
      // Ignore
    }
  }

  // Check 4: Local persistent backup file
  if (!token) {
    try {
      const backupPath = path.resolve(process.cwd(), ".credentials_backup.json");
      if (fs.existsSync(backupPath)) {
        const backup = JSON.parse(fs.readFileSync(backupPath, "utf-8"));
        const bToken = isIg
          ? (backup.META_INSTAGRAM_ACCESS_TOKEN || backup.META_PAGE_ACCESS_TOKEN)
          : backup.META_PAGE_ACCESS_TOKEN;
        if (bToken && typeof bToken === "string" && bToken.trim().length > 0) {
          token = bToken.trim();
          source = "backup_file";
          if (backup.META_PAGE_ID) pageId = backup.META_PAGE_ID;
          if (backup.META_PAGE_NAME) pageName = backup.META_PAGE_NAME;
          if (backup.META_APP_ID) appId = backup.META_APP_ID;
          if (backup.META_APP_SECRET) appSecret = backup.META_APP_SECRET;
          if (backup.META_WEBHOOK_VERIFY_TOKEN) verifyToken = backup.META_WEBHOOK_VERIFY_TOKEN;
        }
      }
    } catch (err) {
      // Ignore
    }
  }

  // If token was discovered from persistent store, keep runtime process.env aligned
  if (token && !process.env.META_PAGE_ACCESS_TOKEN) {
    process.env.META_PAGE_ACCESS_TOKEN = token;
  }
  if (pageId && !process.env.META_PAGE_ID) {
    process.env.META_PAGE_ID = pageId;
  }
  if (appId && !process.env.META_APP_ID) {
    process.env.META_APP_ID = appId;
  }

  return {
    accessToken: token,
    pageId,
    pageName,
    appId,
    appSecret,
    verifyToken,
    source,
    fingerprint: hashToken(token),
    isConfigured: !!(token && token.length > 0),
  };
}

/**
 * Validate a specific Meta token against the official Meta Graph API
 * Captures safe metadata, error codes, subcodes, expiration timestamps, and permissions.
 * Does NOT require or return raw tokens.
 */
export async function validateTokenWithMeta(
  tokenToValidate: string | null | undefined,
  context?: {
    source?: string;
    targetPageId?: string;
    targetAppId?: string;
  }
): Promise<MetaValidationResult> {
  const now = new Date().toISOString();
  const safeMeta = getSafeTokenMetadata(tokenToValidate);
  const configuredAppId = context?.targetAppId || process.env.META_APP_ID || "1006322732424651";
  const configuredPageId = context?.targetPageId || process.env.META_PAGE_ID || "110414661460391";
  const source = context?.source || "authoritative_token";

  if (!safeMeta.present) {
    return {
      valid: false,
      status: "TOKEN_NOT_CONFIGURED",
      statusMessage: "Meta Page Access Token is not configured in environment or database.",
      tokenFingerprint: "",
      tokenPrefix: "",
      tokenSuffix: "",
      tokenLength: 0,
      tokenSource: source,
      configuredAppId,
      configuredPageId,
      appIdMatches: false,
      pageIdMatches: false,
      tokenAppId: null,
      tokenUserId: null,
      tokenPageId: null,
      tokenPageName: null,
      tokenType: null,
      issuedAt: null,
      expiresAt: null,
      dataAccessExpiresAt: null,
      permissions: [],
      hasPagesMessaging: false,
      hasPagesManageMetadata: false,
      hasInstagramManageMessages: false,
      lastValidatedAt: now,
      lastValidationErrorCode: null,
      lastValidationErrorSubcode: null,
      lastValidationErrorType: null,
      lastValidationErrorMessage: null,
    };
  }

  const cleanToken = tokenToValidate!.trim();

  try {
    // 1. Query /me to inspect basic identity
    const meUrl = `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${encodeURIComponent(cleanToken)}`;
    const meRes = await fetch(meUrl, { signal: AbortSignal.timeout(8000) });
    const meData: any = await meRes.json().catch(() => ({}));

    // Check if /me failed
    if (!meRes.ok || meData.error) {
      const err = meData.error || {};
      const code = typeof err.code === "number" ? err.code : meRes.status;
      const subcode = typeof err.error_subcode === "number" ? err.error_subcode : null;
      const type = err.type || "OAuthException";
      const rawMessage = err.message || "Meta API authentication error";
      const sanitizedMessage = sanitizeMetaErrorMessage(rawMessage);

      let status: MetaTokenStatus = "UNKNOWN_META_ERROR";
      let statusMsg = sanitizedMessage;

      if (code === 190) {
        if (subcode === 463 || sanitizedMessage.toLowerCase().includes("session has expired")) {
          status = "TOKEN_EXPIRED";
          statusMsg = "Meta Session has expired. Meta Graph API Explorer or short-lived tokens expire automatically. Token reauthorization is required.";
        } else if (subcode === 458 || subcode === 459 || sanitizedMessage.toLowerCase().includes("revoked") || sanitizedMessage.toLowerCase().includes("deauthorized")) {
          status = "TOKEN_REVOKED_OR_INVALIDATED";
          statusMsg = "Meta Access Token has been revoked or invalidated by the user or Facebook security.";
        } else if (subcode === 467 || sanitizedMessage.toLowerCase().includes("invalid")) {
          status = "TOKEN_INVALID";
          statusMsg = "Meta Access Token is malformed, unrecognized, or invalid.";
        } else {
          status = "TOKEN_INVALID";
          statusMsg = sanitizedMessage;
        }
      } else if (code === 4 || code === 17 || code === 32 || code === 613) {
        status = "META_RATE_LIMITED";
        statusMsg = "Meta Graph API rate limit reached. Please wait before retrying.";
      } else if (code === 100 && (sanitizedMessage.includes("App_id") || sanitizedMessage.includes("Viewing App"))) {
        status = "TOKEN_APP_MISMATCH";
        statusMsg = "Meta App ID in token does not match the configured Meta App.";
      }

      // Extract expiration timestamp if mentioned in error message (e.g. "Session has expired on Sunday, 13-Sep-26 01:00:00 PDT")
      let expiresAt: string | null = null;
      const expireMatch = rawMessage.match(/Session has expired on ([^.]+)/i);
      if (expireMatch && expireMatch[1]) {
        try {
          const parsedDate = new Date(expireMatch[1]);
          if (!isNaN(parsedDate.getTime())) {
            expiresAt = parsedDate.toISOString();
          } else {
            expiresAt = expireMatch[1].trim();
          }
        } catch (e) {
          expiresAt = expireMatch[1].trim();
        }
      }

      return {
        valid: false,
        status,
        statusMessage: statusMsg,
        tokenFingerprint: safeMeta.fingerprint,
        tokenPrefix: safeMeta.prefix,
        tokenSuffix: safeMeta.suffix,
        tokenLength: safeMeta.length,
        tokenSource: source,
        configuredAppId,
        configuredPageId,
        appIdMatches: false,
        pageIdMatches: false,
        tokenAppId: null,
        tokenUserId: null,
        tokenPageId: null,
        tokenPageName: null,
        tokenType: null,
        issuedAt: null,
        expiresAt,
        dataAccessExpiresAt: null,
        permissions: [],
        hasPagesMessaging: false,
        hasPagesManageMetadata: false,
        hasInstagramManageMessages: false,
        lastValidatedAt: now,
        lastValidationErrorCode: code,
        lastValidationErrorSubcode: subcode,
        lastValidationErrorType: type,
        lastValidationErrorMessage: sanitizedMessage,
      };
    }

    // If /me succeeded, parse details
    const tokenTargetId = meData.id || null;
    const tokenTargetName = meData.name || null;
    let tokenType = "PAGE";
    let tokenAppId: string | null = null;
    let tokenUserId: string | null = null;
    let tokenPageId = tokenTargetId;
    let tokenPageName = tokenTargetName;
    let expiresAt: string | null = null;
    let dataAccessExpiresAt: string | null = null;
    let permissions: string[] = [];

    // 2. Query /debug_token
    try {
      // By using the token as its own access_token, we can debug it without needing the appSecret.
      const debugUrl = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(cleanToken)}&access_token=${encodeURIComponent(cleanToken)}`;
      const debugRes = await fetch(debugUrl, { signal: AbortSignal.timeout(5000) });
      const debugData: any = await debugRes.json().catch(() => ({}));
      if (debugData?.data) {
        const d = debugData.data;
        tokenAppId = d.app_id ? String(d.app_id) : null;
        tokenUserId = d.user_id ? String(d.user_id) : null;
        tokenType = d.type || tokenType;
        if (d.expires_at === 0) {
          expiresAt = "NEVER (Never Expires)";
        } else if (d.expires_at) {
          expiresAt = new Date(d.expires_at * 1000).toISOString();
        }
        if (d.data_access_expires_at) {
          dataAccessExpiresAt = new Date(d.data_access_expires_at * 1000).toISOString();
        }
        if (Array.isArray(d.scopes)) {
          permissions = d.scopes;
        }
      }
    } catch (debugErr) {
      // Non-blocking debug token inspection
    }

    // Check App ID match
    const appIdMatches = !tokenAppId || tokenAppId === configuredAppId;

    // Check Page ID match & Messaging permission
    const pageIdMatches = !configuredPageId || tokenPageId === configuredPageId;
    let hasPagesMessaging = permissions.includes("pages_messaging");
    let hasPagesManageMetadata = permissions.includes("pages_manage_metadata");
    let hasInstagramManageMessages = permissions.includes("instagram_manage_messages");

    // 3. Test Messenger access via /conversations
    let liveMessagingTested = false;
    if (tokenPageId) {
      try {
        const convUrl = `https://graph.facebook.com/v19.0/${tokenPageId}/conversations?limit=1&access_token=${encodeURIComponent(cleanToken)}`;
        const convRes = await fetch(convUrl, { signal: AbortSignal.timeout(5000) });
        const convData: any = await convRes.json().catch(() => ({}));
        liveMessagingTested = true;

        if (convRes.ok && !convData.error) {
          hasPagesMessaging = true;
          if (!permissions.includes("pages_messaging")) {
            permissions.push("pages_messaging");
          }
        } else if (convData.error) {
          const cCode = convData.error.code;
          const cMsg = convData.error.message || "";
          if (cCode === 200 || cMsg.includes("pages_messaging")) {
            hasPagesMessaging = false;
          }
        }
      } catch (cErr) {
        // Non-blocking
      }
    }

    // Determine final status
    let status: MetaTokenStatus = "TOKEN_VALID";
    let statusMessage = `Verified! Meta Token is active and authenticated for ${tokenPageName || "Facebook Page"}.`;

    /*
    if (!appIdMatches) {
      status = "TOKEN_APP_MISMATCH";
      statusMessage = `Token was issued by Meta App ${tokenAppId}, but application is configured with App ${configuredAppId}.`;
    } else 
    */
    if (!pageIdMatches) {
      status = "TOKEN_PAGE_MISMATCH";
      statusMessage = `Token is bound to Page ${tokenPageId} (${tokenPageName}), which differs from configured Page ${configuredPageId}.`;
    } else if (!hasPagesMessaging && liveMessagingTested) {
      status = "TOKEN_PERMISSION_ERROR";
      statusMessage = `Token is valid for page identification, but lacks the 'pages_messaging' permission required to receive and reply to customer messages.`;
    }

    return {
      valid: status === "TOKEN_VALID",
      status,
      statusMessage,
      tokenFingerprint: safeMeta.fingerprint,
      tokenPrefix: safeMeta.prefix,
      tokenSuffix: safeMeta.suffix,
      tokenLength: safeMeta.length,
      tokenSource: source,
      configuredAppId,
      configuredPageId,
      appIdMatches,
      pageIdMatches,
      tokenAppId,
      tokenUserId,
      tokenPageId,
      tokenPageName,
      tokenType,
      issuedAt: null,
      expiresAt: expiresAt || "Active (Never expires or long-lived)",
      dataAccessExpiresAt,
      permissions,
      hasPagesMessaging,
      hasPagesManageMetadata,
      hasInstagramManageMessages,
      lastValidatedAt: now,
      lastValidationErrorCode: null,
      lastValidationErrorSubcode: null,
      lastValidationErrorType: null,
      lastValidationErrorMessage: null,
    };
  } catch (netErr: any) {
    return {
      valid: false,
      status: "META_API_UNAVAILABLE",
      statusMessage: `Meta Graph API is temporarily unavailable or unreachable: ${netErr.message || "Network error"}`,
      tokenFingerprint: safeMeta.fingerprint,
      tokenPrefix: safeMeta.prefix,
      tokenSuffix: safeMeta.suffix,
      tokenLength: safeMeta.length,
      tokenSource: source,
      configuredAppId,
      configuredPageId,
      appIdMatches: false,
      pageIdMatches: false,
      tokenAppId: null,
      tokenUserId: null,
      tokenPageId: null,
      tokenPageName: null,
      tokenType: null,
      issuedAt: null,
      expiresAt: null,
      dataAccessExpiresAt: null,
      permissions: [],
      hasPagesMessaging: false,
      hasPagesManageMetadata: false,
      hasInstagramManageMessages: false,
      lastValidatedAt: now,
      lastValidationErrorCode: null,
      lastValidationErrorSubcode: null,
      lastValidationErrorType: "NetworkError",
      lastValidationErrorMessage: netErr.message || "Network error contacting graph.facebook.com",
    };
  }
}

/**
 * Compare all credential sources safely without revealing secrets
 */
export async function compareCredentialSources(): Promise<CredentialSourceInfo[]> {
  const authoritative = await getAuthoritativeMetaCredentials("messenger");
  const authFingerprint = authoritative.fingerprint;
  const results: CredentialSourceInfo[] = [];

  // 1. Runtime environment (process.env.META_PAGE_ACCESS_TOKEN)
  const envToken = process.env.META_PAGE_ACCESS_TOKEN || "";
  const envMeta = getSafeTokenMetadata(envToken);
  results.push({
    source: "runtime_environment",
    displayName: "Runtime Environment (process.env)",
    present: envMeta.present,
    length: envMeta.length,
    prefix: envMeta.prefix,
    suffix: envMeta.suffix,
    fingerprint: envMeta.fingerprint,
    matchesAuthoritative: envMeta.present && envMeta.fingerprint === authFingerprint,
  });

  // 2. Local .env file
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    let dotenvToken = "";
    if (fs.existsSync(envPath)) {
      const parsed = dotenv.parse(fs.readFileSync(envPath, "utf-8"));
      dotenvToken = parsed.META_PAGE_ACCESS_TOKEN || "";
    }
    const dotMeta = getSafeTokenMetadata(dotenvToken);
    results.push({
      source: "local_dotenv",
      displayName: "Local .env Configuration",
      present: dotMeta.present,
      length: dotMeta.length,
      prefix: dotMeta.prefix,
      suffix: dotMeta.suffix,
      fingerprint: dotMeta.fingerprint,
      matchesAuthoritative: dotMeta.present && dotMeta.fingerprint === authFingerprint,
    });
  } catch (e) {
    // ignore
  }

  // 3. Local persistent backup cache (.credentials_backup.json)
  try {
    const backupPath = path.resolve(process.cwd(), ".credentials_backup.json");
    let backupToken = "";
    if (fs.existsSync(backupPath)) {
      const backupData = JSON.parse(fs.readFileSync(backupPath, "utf-8"));
      backupToken = backupData.META_PAGE_ACCESS_TOKEN || "";
    }
    const bMeta = getSafeTokenMetadata(backupToken);
    results.push({
      source: "backup_file",
      displayName: "Persistent Backup (.credentials_backup.json)",
      present: bMeta.present,
      length: bMeta.length,
      prefix: bMeta.prefix,
      suffix: bMeta.suffix,
      fingerprint: bMeta.fingerprint,
      matchesAuthoritative: bMeta.present && bMeta.fingerprint === authFingerprint,
    });
  } catch (e) {
    // ignore
  }

  // 4. Firestore connectors/messenger
  try {
    const doc = await db().collection("connectors").doc("messenger").get();
    let fsToken = "";
    if (doc.exists) {
      fsToken = doc.data()?.accessToken || doc.data()?.pageAccessToken || "";
    }
    const fsMeta = getSafeTokenMetadata(fsToken);
    results.push({
      source: "firestore_connectors",
      displayName: "Firestore (connectors/messenger)",
      present: fsMeta.present,
      length: fsMeta.length,
      prefix: fsMeta.prefix,
      suffix: fsMeta.suffix,
      fingerprint: fsMeta.fingerprint,
      matchesAuthoritative: fsMeta.present && fsMeta.fingerprint === authFingerprint,
    });
  } catch (e) {
    // ignore
  }

  // 5. Firestore settings/meta
  try {
    const doc = await db().collection("settings").doc("meta").get();
    let sToken = "";
    if (doc.exists) {
      sToken = doc.data()?.pageAccessToken || "";
    }
    const sMeta = getSafeTokenMetadata(sToken);
    results.push({
      source: "firestore_settings",
      displayName: "Firestore (settings/meta)",
      present: sMeta.present,
      length: sMeta.length,
      prefix: sMeta.prefix,
      suffix: sMeta.suffix,
      fingerprint: sMeta.fingerprint,
      matchesAuthoritative: sMeta.present && sMeta.fingerprint === authFingerprint,
    });
  } catch (e) {
    // ignore
  }

  return results;
}

/**
 * Validate Meta credentials and update persistent status
 */
export async function validateMetaCredentials(options?: { force?: boolean }): Promise<MetaCredentialHealthReport> {
  const now = Date.now();
  if (!options?.force && cachedValidationResult && (now - lastValidationTimestamp < VALIDATION_CACHE_TTL_MS)) {
    const sources = await compareCredentialSources();
    const allSourcesMatch = sources.every(s => !s.present || s.matchesAuthoritative);
    return {
      ...cachedValidationResult,
      configured: cachedValidationResult.status !== "TOKEN_NOT_CONFIGURED",
      sources,
      allSourcesMatch,
      hasAppSecret: !!process.env.META_APP_SECRET,
      hasVerifyToken: !!(process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN),
      verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || "ai_sales_meta_verify_token",
      webhookUrl: "/api/webhooks/meta",
    };
  }

  const authoritative = await getAuthoritativeMetaCredentials("messenger");
  const validation = await validateTokenWithMeta(authoritative.accessToken, {
    source: authoritative.source,
    targetPageId: authoritative.pageId || undefined,
    targetAppId: authoritative.appId || undefined,
  });

  cachedValidationResult = validation;
  lastValidationTimestamp = now;

  // Persist safe diagnostic status to Firestore settings/meta_credential_status
  try {
    await db().collection("settings").doc("meta_credential_status").set({
      configured: authoritative.isConfigured,
      valid: validation.valid,
      status: validation.status,
      statusMessage: validation.statusMessage,
      tokenFingerprint: validation.tokenFingerprint,
      tokenPrefix: validation.tokenPrefix,
      tokenSuffix: validation.tokenSuffix,
      tokenLength: validation.tokenLength,
      tokenSource: validation.tokenSource,
      configuredAppId: validation.configuredAppId,
      configuredPageId: validation.configuredPageId,
      appIdMatches: validation.appIdMatches,
      pageIdMatches: validation.pageIdMatches,
      tokenAppId: validation.tokenAppId,
      tokenUserId: validation.tokenUserId,
      tokenPageId: validation.tokenPageId,
      tokenPageName: validation.tokenPageName,
      tokenType: validation.tokenType,
      expiresAt: validation.expiresAt,
      dataAccessExpiresAt: validation.dataAccessExpiresAt,
      permissions: validation.permissions,
      hasPagesMessaging: validation.hasPagesMessaging,
      hasPagesManageMetadata: validation.hasPagesManageMetadata,
      hasInstagramManageMessages: validation.hasInstagramManageMessages,
      lastValidatedAt: validation.lastValidatedAt,
      lastValidationErrorCode: validation.lastValidationErrorCode,
      lastValidationErrorSubcode: validation.lastValidationErrorSubcode,
      lastValidationErrorType: validation.lastValidationErrorType,
      lastValidationErrorMessage: validation.lastValidationErrorMessage,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    // Non-blocking
  }

  // Record audit log for notable validation events
  try {
    let auditAction = "META_CREDENTIAL_VALIDATED";
    if (validation.status === "TOKEN_EXPIRED") auditAction = "META_CREDENTIAL_EXPIRED";
    else if (validation.status === "TOKEN_INVALID") auditAction = "META_CREDENTIAL_INVALID";
    else if (validation.status === "TOKEN_APP_MISMATCH") auditAction = "META_APP_MISMATCH";
    else if (validation.status === "TOKEN_PAGE_MISMATCH") auditAction = "META_PAGE_ACCESS_FAILURE";
    else if (validation.status === "TOKEN_PERMISSION_ERROR") auditAction = "META_PERMISSION_FAILURE";

    await logAudit("SYSTEM", auditAction, "MetaCredentials", "messenger", {
      status: validation.status,
      tokenFingerprint: validation.tokenFingerprint,
      tokenPrefix: validation.tokenPrefix,
      tokenSuffix: validation.tokenSuffix,
      errorCode: validation.lastValidationErrorCode,
      errorSubcode: validation.lastValidationErrorSubcode,
      errorType: validation.lastValidationErrorType,
    });
  } catch (auditErr) {
    // Non-blocking
  }

  const sources = await compareCredentialSources();
  const allSourcesMatch = sources.every(s => !s.present || s.matchesAuthoritative);

  return {
    ...validation,
    configured: authoritative.isConfigured,
    sources,
    allSourcesMatch,
    hasAppSecret: !!(process.env.META_APP_SECRET || authoritative.appSecret),
    hasVerifyToken: !!authoritative.verifyToken,
    verifyToken: authoritative.verifyToken || "ai_sales_meta_verify_token",
    webhookUrl: "/api/webhooks/meta",
  };
}

/**
 * Two-step safe token replacement:
 * 1. Validates the new token against Meta Graph API
 * 2. If valid, updates Firestore, runtime process.env, and local persistence
 * 3. If invalid, REJECTS replacement and keeps the previous credential intact!
 */
export async function replaceMetaToken(
  newToken: string,
  options?: {
    pageId?: string;
    pageName?: string;
    igAccountId?: string;
    igUsername?: string;
    adminUsername?: string;
  }
): Promise<{
  success: boolean;
  message: string;
  validation: MetaValidationResult;
  previousFingerprint?: string;
  newFingerprint?: string;
}> {
  if (!newToken || typeof newToken !== "string" || !newToken.trim()) {
    throw new Error("Cannot replace credential: new access token is empty or invalid.");
  }

  const cleanToken = newToken.trim();
  const previousAuth = await getAuthoritativeMetaCredentials("messenger");
  const previousFingerprint = previousAuth.fingerprint;

  // Step 1: Validate against Meta Graph API first!
  const validation = await validateTokenWithMeta(cleanToken, {
    source: "admin_replacement_candidate",
    targetPageId: options?.pageId || previousAuth.pageId || undefined,
    targetAppId: previousAuth.appId || undefined,
  });

  // Step 2: If validation failed, REJECT the replacement!
  if (!validation.valid) {
    await logAudit(
      options?.adminUsername || "ADMIN",
      "META_TOKEN_REPLACEMENT_REJECTED",
      "MetaCredentials",
      "messenger",
      {
        reason: validation.statusMessage,
        status: validation.status,
        rejectedFingerprint: validation.tokenFingerprint,
        previousFingerprint,
        errorCode: validation.lastValidationErrorCode,
        errorSubcode: validation.lastValidationErrorSubcode,
      }
    );

    return {
      success: false,
      message: `Token replacement rejected: ${validation.statusMessage} Your existing configuration remains safely preserved.`,
      validation,
      previousFingerprint,
      newFingerprint: validation.tokenFingerprint,
    };
  }

  // Step 3: Activation - update Firestore, process.env, and persistence
  const now = new Date().toISOString();
  const resolvedPageId = options?.pageId || validation.tokenPageId || previousAuth.pageId || "110414661460391";
  const resolvedPageName = options?.pageName || validation.tokenPageName || previousAuth.pageName || "Dokuni Shop";

  // Update Firestore connectors/messenger
  await db().collection("connectors").doc("messenger").set({
    id: "messenger",
    type: "messenger",
    platform: "facebook",
    name: resolvedPageName,
    pageId: resolvedPageId,
    pageName: resolvedPageName,
    accessToken: cleanToken,
    status: "connected",
    connectedAt: now,
    updatedAt: now,
  }, { merge: true });

  // Update Firestore settings/meta
  await db().collection("settings").doc("meta").set({
    pageId: resolvedPageId,
    pageName: resolvedPageName,
    pageAccessToken: cleanToken,
    updatedAt: now,
  }, { merge: true });

  // Update runtime memory
  process.env.META_PAGE_ACCESS_TOKEN = cleanToken;
  process.env.META_PAGE_ID = resolvedPageId;
  process.env.META_PAGE_NAME = resolvedPageName;

  // Sync to local files (.env and .credentials_backup.json)
  try {
    const { restoreSecrets } = await import("../syncSecrets.js");
    await restoreSecrets();
  } catch (syncErr) {
    // Non-blocking
  }

  // Invalidate validation cache so next read reflects fresh status
  cachedValidationResult = validation;
  lastValidationTimestamp = Date.now();

  // Step 4: Audit log
  await logAudit(
    options?.adminUsername || "ADMIN",
    "META_CREDENTIAL_REPLACED",
    "MetaCredentials",
    "messenger",
    {
      previousFingerprint,
      newFingerprint: validation.tokenFingerprint,
      pageId: resolvedPageId,
      pageName: resolvedPageName,
      status: validation.status,
    }
  );

  return {
    success: true,
    message: `Meta Page Access Token successfully verified and activated for ${resolvedPageName}!`,
    validation,
    previousFingerprint,
    newFingerprint: validation.tokenFingerprint,
  };
}

/**
 * Startup self-check: Performs a safe check and logs diagnostics without crashing
 */
export async function runStartupSelfCheck(): Promise<void> {
  console.log("\n========================================================");
  console.log("🔒 [Meta Credential Service] Performing Startup Self-Check...");
  try {
    const auth = await getAuthoritativeMetaCredentials("messenger");
    const meta = getSafeTokenMetadata(auth.accessToken);

    console.log(`[Meta Startup] Token Configured: ${auth.isConfigured ? "YES" : "NO"}`);
    console.log(`[Meta Startup] Token Source: ${auth.source}`);
    if (meta.present) {
      console.log(`[Meta Startup] Token Length: ${meta.length} | Prefix: ${meta.prefix}... | Suffix: ...${meta.suffix}`);
      console.log(`[Meta Startup] Token Fingerprint: ${meta.fingerprint.substring(0, 16)}...`);
    }
    console.log(`[Meta Startup] Page ID: ${auth.pageId || "NOT CONFIGURED"} | App ID: ${auth.appId || "NOT CONFIGURED"}`);

    if (auth.isConfigured) {
      // Non-blocking validation on startup
      const validation = await validateTokenWithMeta(auth.accessToken, {
        source: auth.source,
        targetPageId: auth.pageId || undefined,
        targetAppId: auth.appId || undefined,
      });

      cachedValidationResult = validation;
      lastValidationTimestamp = Date.now();

      console.log(`[Meta Startup] Validation Status: ${validation.status}`);
      if (validation.valid) {
        console.log(`[Meta Startup] ✅ Meta Token is VALID and authenticated for ${validation.tokenPageName || auth.pageName}`);
      } else {
        console.warn(`[Meta Startup] ⚠️ Notice: Meta validation reported [${validation.status}]: ${validation.statusMessage}`);
        console.warn(`[Meta Startup] 🔒 Safety Guarantee: Existing credentials safely preserved. Server continuing normal operation.`);
      }
    } else {
      console.log(`[Meta Startup] Notice: Meta Page Access Token is not yet configured.`);
    }
  } catch (err: any) {
    console.error(`[Meta Startup] Notice: Could not complete startup validation: ${err.message}. Server starting normally.`);
  }
  console.log("========================================================\n");
}
