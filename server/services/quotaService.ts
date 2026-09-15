import { db } from "../firebase";

export interface GeminiUsageEntry {
  timestamp: string;
  model: string;
  conversationId?: string;
  customerId?: string;
  messageId?: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  success: boolean;
  fallbackUsed: boolean;
  errorCategory?: string | null;
  latencyMs: number;
}

export interface ModelUsageStats {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  quotaErrors: number;
  successfulRequests: number;
  failedRequests: number;
}

// In-memory ring buffer of recent logs for ultra-fast admin dashboard display
const recentUsageLogs: GeminiUsageEntry[] = [];
const MAX_RECENT_LOGS = 200;

// In-memory set for deduplication of incoming platformMessageId
const processedMids = new Map<string, number>(); // mid -> timestamp
const MID_TTL_MS = 60 * 60 * 1000; // 1 hour memory retention

// Daily counters (reset at UTC midnight or tracked per day key)
let currentDayKey = new Date().toISOString().slice(0, 10);
let dailyStats = {
  totalRequests: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCachedTokens: 0,
  totalTokens: 0,
  fallbackCount: 0,
  quotaErrors: 0,
  duplicatesPrevented: 0,
  deterministicCallsHandled: 0,
  byModel: {} as Record<string, ModelUsageStats>,
};

function ensureDayKey() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== currentDayKey) {
    currentDayKey = today;
    dailyStats = {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCachedTokens: 0,
      totalTokens: 0,
      fallbackCount: 0,
      quotaErrors: 0,
      duplicatesPrevented: 0,
      deterministicCallsHandled: 0,
      byModel: {},
    };
  }
}

function cleanExpiredMids() {
  const now = Date.now();
  for (const [mid, time] of processedMids.entries()) {
    if (now - time > MID_TTL_MS) {
      processedMids.delete(mid);
    }
  }
}

/**
 * Atomic persistent and memory check to guarantee ABSOLUTE ONE-MESSAGE / ONE-GENERATION rule
 * Returns true if claimed successfully (proceed with processing)
 * Returns false if message is a duplicate (drop immediately, DO NOT call Gemini, DO NOT send response)
 */
export async function checkAndClaimMessageId(platformMessageId: string | null | undefined): Promise<boolean> {
  if (!platformMessageId) return true; // Simulator / internal test without mid

  cleanExpiredMids();

  // 1. Fast in-memory check
  if (processedMids.has(platformMessageId)) {
    recordDuplicatePrevented(platformMessageId, "in-memory");
    return false;
  }

  // 2. Persistent Firestore check with optimistic claim
  try {
    const eventRef = db().collection("processedEvents").doc(platformMessageId);
    const claimed = await db().runTransaction(async (t) => {
      const doc = await t.get(eventRef);
      if (doc.exists) {
        return false;
      }
      t.set(eventRef, {
        platformMessageId,
        status: "processing",
        claimedAt: new Date().toISOString(),
      });
      return true;
    });

    if (!claimed) {
      processedMids.set(platformMessageId, Date.now());
      recordDuplicatePrevented(platformMessageId, "firestore-transaction");
      return false;
    }

    // Successfully claimed
    processedMids.set(platformMessageId, Date.now());
    return true;
  } catch (err: any) {
    // If Firestore is offline or in cooldown, fall back to in-memory idempotency
    if (processedMids.has(platformMessageId)) {
      recordDuplicatePrevented(platformMessageId, "memory-fallback");
      return false;
    }
    processedMids.set(platformMessageId, Date.now());
    return true;
  }
}

export function recordDuplicatePrevented(messageId: string, detectionMethod: string) {
  ensureDayKey();
  dailyStats.duplicatesPrevented++;
  console.log(`[QUOTA WASTE PREVENTED] Duplicate Meta message blocked (${detectionMethod}): ${messageId}. Gemini call avoided!`);
}

export function recordDeterministicHandled(category: string, query: string) {
  ensureDayKey();
  dailyStats.deterministicCallsHandled++;
  console.log(`[QUOTA SAVED] Handled deterministically without Gemini (${category}): "${query.slice(0, 40)}". Gemini call saved!`);
}

export async function recordGeminiUsage(entry: GeminiUsageEntry) {
  ensureDayKey();

  dailyStats.totalRequests++;
  dailyStats.totalInputTokens += entry.inputTokens;
  dailyStats.totalOutputTokens += entry.outputTokens;
  dailyStats.totalCachedTokens += entry.cachedTokens;
  dailyStats.totalTokens += entry.totalTokens;

  if (entry.fallbackUsed) {
    dailyStats.fallbackCount++;
  }

  if (entry.errorCategory === "QUOTA_429" || entry.errorCategory === "RESOURCE_EXHAUSTED") {
    dailyStats.quotaErrors++;
  }

  // Record by model
  if (!dailyStats.byModel[entry.model]) {
    dailyStats.byModel[entry.model] = {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      totalTokens: 0,
      quotaErrors: 0,
      successfulRequests: 0,
      failedRequests: 0,
    };
  }

  const modelStat = dailyStats.byModel[entry.model];
  modelStat.requests++;
  modelStat.inputTokens += entry.inputTokens;
  modelStat.outputTokens += entry.outputTokens;
  modelStat.cachedTokens += entry.cachedTokens;
  modelStat.totalTokens += entry.totalTokens;
  if (entry.success) {
    modelStat.successfulRequests++;
  } else {
    modelStat.failedRequests++;
  }
  if (entry.errorCategory === "QUOTA_429" || entry.errorCategory === "RESOURCE_EXHAUSTED") {
    modelStat.quotaErrors++;
  }

  // Add to in-memory ring buffer
  recentUsageLogs.unshift(entry);
  if (recentUsageLogs.length > MAX_RECENT_LOGS) {
    recentUsageLogs.pop();
  }

  // Persist safely to Firestore (fire & forget, do not block caller)
  try {
    db().collection("geminiUsageLogs").add({
      ...entry,
      createdAt: entry.timestamp,
    }).catch((dbErr: any) => {
      // Ignored if DB quota reached or offline
    });
  } catch (e) {}
}

export function getGeminiQuotaMetrics() {
  ensureDayKey();

  const primaryModel = process.env.GEMINI_PRIMARY_MODEL || process.env.GEMINI_MODEL || "gemini-flash-latest";

  // Calculate averages
  const avgInputTokens = dailyStats.totalRequests > 0
    ? Math.round(dailyStats.totalInputTokens / dailyStats.totalRequests)
    : 0;
  const avgOutputTokens = dailyStats.totalRequests > 0
    ? Math.round(dailyStats.totalOutputTokens / dailyStats.totalRequests)
    : 0;

  return {
    today: currentDayKey,
    primaryModel,
    totalRequests: dailyStats.totalRequests,
    totalInputTokens: dailyStats.totalInputTokens,
    totalOutputTokens: dailyStats.totalOutputTokens,
    totalCachedTokens: dailyStats.totalCachedTokens,
    totalTokens: dailyStats.totalTokens,
    avgInputTokens,
    avgOutputTokens,
    fallbackCount: dailyStats.fallbackCount,
    quotaErrors: dailyStats.quotaErrors,
    duplicatesPrevented: dailyStats.duplicatesPrevented,
    deterministicCallsHandled: dailyStats.deterministicCallsHandled,
    geminiCallsSavedTotal: dailyStats.duplicatesPrevented + dailyStats.deterministicCallsHandled,
    byModel: dailyStats.byModel,
    recentLogs: recentUsageLogs.slice(0, 20),
  };
}
