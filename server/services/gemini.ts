
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { recordGeminiUsage } from "./quotaService";

let genAI: GoogleGenAI | null = null;
export function getGenAI(): GoogleGenAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is missing. Gemini will not be able to generate responses.");
      genAI = new GoogleGenAI({
        apiKey: "missing_key",
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    } else {
      genAI = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
  }
  return genAI;
}

export function resolveModelName(model: string): string {
  if (!model) return "gemini-flash-latest";
  const m = model.toLowerCase().trim();
  if (m === "gemini-flash" || m === "flash" || m === "gemini-flash-latest" || m.includes("flash-latest")) {
    return "gemini-flash-latest";
  }
  return model;
}

export function getPrimaryModel(): string {
  return resolveModelName(process.env.GEMINI_PRIMARY_MODEL || process.env.GEMINI_MODEL || "gemini-flash-latest");
}

export function getFallbackModels(): string[] {
  const fallbackEnv = process.env.GEMINI_FALLBACK_MODELS || "gemini-flash-latest,gemini-3.8-flash,gemini-3.1-flash-lite";
  return Array.from(new Set(fallbackEnv.split(",").map(m => resolveModelName(m.trim())).filter(Boolean)));
}

// Cooldown map: model -> expiration timestamp (ms)
const modelCooldowns = new Map<string, number>();
const DEFAULT_COOLDOWN_MS = 45 * 1000; // 45 seconds

export function getModelCooldownStatus() {
  const now = Date.now();
  const allModels = [getPrimaryModel(), ...getFallbackModels()];
  const status: Record<string, { inCooldown: boolean; remainingSeconds: number }> = {};
  for (const m of allModels) {
    const exp = modelCooldowns.get(m) || 0;
    const remaining = Math.max(0, Math.round((exp - now) / 1000));
    status[m] = {
      inCooldown: remaining > 0,
      remainingSeconds: remaining
    };
  }
  return status;
}

export function resetModelCooldown(model?: string) {
  if (model) {
    modelCooldowns.delete(model);
  } else {
    modelCooldowns.clear();
  }
}

export function classifyError(error: any): { category: string; isFallbackEligible: boolean; retryDelayMs?: number } {
  if (!error) return { category: "UNKNOWN", isFallbackEligible: false };
  const msg = (error.message || "").toLowerCase();
  const status = error.status || error.statusCode || error.code;

  let retryDelayMs: number | undefined;

  // Extract retryDelay from details if provided by Google
  if (error.details && Array.isArray(error.details)) {
    for (const detail of error.details) {
      if (detail.retryDelay) {
        const match = String(detail.retryDelay).match(/(\d+(?:\.\d+)?)/);
        if (match) {
          retryDelayMs = Math.round(parseFloat(match[1]) * 1000);
        }
      }
    }
  }

  // Quota & Rate Limits (Eligible for fallback)
  if (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("resource_exhausted") ||
    msg.includes("resource exhausted")
  ) {
    return { category: "QUOTA_429", isFallbackEligible: true, retryDelayMs };
  }

  // Temporary availability & Server errors (Eligible for fallback)
  if (
    status === 503 ||
    status === 500 ||
    status === 404 ||
    msg.includes("overloaded") ||
    msg.includes("not found") ||
    msg.includes("no longer available") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("service unavailable")
  ) {
    return { category: "SERVER_503", isFallbackEligible: true, retryDelayMs };
  }

  // Network connection drops (Eligible for fallback)
  if (
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("network error") ||
    msg.includes("fetch failed")
  ) {
    return { category: "NETWORK_ERROR", isFallbackEligible: true };
  }

  // Invalid Request / Schema error (NOT eligible for fallback - don't spam other models with invalid payload)
  if (
    status === 400 ||
    msg.includes("invalid argument") ||
    msg.includes("invalid_argument") ||
    msg.includes("bad request")
  ) {
    return { category: "INVALID_REQUEST", isFallbackEligible: false };
  }

  // Authentication error (NOT eligible for fallback)
  if (status === 401 || status === 403 || msg.includes("api key") || msg.includes("permission denied")) {
    return { category: "AUTH_ERROR", isFallbackEligible: false };
  }

  return { category: "OTHER_ERROR", isFallbackEligible: false };
}

export async function generateContentWithFallback(options: {
  contents: any;
  config?: any;
  processingId?: string;
  conversationId?: string;
  customerId?: string;
}) {
  const pid = options.processingId ? ` [${options.processingId}]` : "";
  const ai = getGenAI();
  const triedModels = new Set<string>();
  let lastError: any = null;
  const now = Date.now();
  const primaryModel = getPrimaryModel();
  const fallbackModels = getFallbackModels();

  const allModels = [primaryModel, ...fallbackModels];

  for (const model of allModels) {
    if (triedModels.has(model)) continue;
    triedModels.add(model);

    // Check cooldown
    const cooldownExp = modelCooldowns.get(model) || 0;
    if (Date.now() < cooldownExp) {
      const waitSec = Math.round((cooldownExp - Date.now()) / 1000);
      console.log(`[GEMINI]${pid} skipping ${model} due to active cooldown (${waitSec}s remaining)`);
      continue;
    }

    const startTime = Date.now();

    try {
      if (model === primaryModel) {
        console.log(`[GEMINI]${pid} primary model=${model}`);
      } else {
        console.log(`[GEMINI]${pid} falling back to ${model}`);
      }
      console.log(`[GEMINI]${pid} request started`);

      // Enforce compact response configuration
      const enhancedConfig = {
        ...options.config,
        maxOutputTokens: options.config?.maxOutputTokens || 280,
      };

      const response = await ai.models.generateContent({
        model,
        contents: options.contents,
        config: enhancedConfig,
      });

      const latencyMs = Date.now() - startTime;

      // Extract precise token usage metadata from Gemini response
      const inputTokens = response.usageMetadata?.promptTokenCount || 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
      const cachedTokens = response.usageMetadata?.cachedContentTokenCount || 0;
      const totalTokens = response.usageMetadata?.totalTokenCount || (inputTokens + outputTokens);

      if (model === primaryModel) {
        console.log(`[GEMINI]${pid} primary model succeeded in ${latencyMs}ms (in=${inputTokens}, out=${outputTokens}, cached=${cachedTokens})`);
      } else {
        console.log(`[GEMINI]${pid} fallback succeeded (${model}) in ${latencyMs}ms (in=${inputTokens}, out=${outputTokens}, cached=${cachedTokens})`);
      }

      // Record safe usage metrics
      await recordGeminiUsage({
        timestamp: new Date().toISOString(),
        model,
        conversationId: options.conversationId,
        customerId: options.customerId,
        messageId: options.processingId,
        inputTokens,
        outputTokens,
        cachedTokens,
        totalTokens,
        success: true,
        fallbackUsed: model !== primaryModel,
        errorCategory: null,
        latencyMs,
      });

      return {
        response,
        modelUsed: model,
        usageMetadata: {
          inputTokens,
          outputTokens,
          cachedTokens,
          totalTokens,
        },
      };
    } catch (err: any) {
      lastError = err;
      const latencyMs = Date.now() - startTime;
      const { category, isFallbackEligible, retryDelayMs } = classifyError(err);

      // Record failure usage metric
      await recordGeminiUsage({
        timestamp: new Date().toISOString(),
        model,
        conversationId: options.conversationId,
        customerId: options.customerId,
        messageId: options.processingId,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        totalTokens: 0,
        success: false,
        fallbackUsed: model !== primaryModel,
        errorCategory: category,
        latencyMs,
      });

      if (isFallbackEligible) {
        const cooldownDuration = (retryDelayMs && retryDelayMs > 5000)
          ? retryDelayMs + 2000
          : DEFAULT_COOLDOWN_MS;

        console.warn(`[GEMINI]${pid} model=${model} eligible error (${category}) - applying ${Math.round(cooldownDuration / 1000)}s cooldown`);
        modelCooldowns.set(model, Date.now() + cooldownDuration);
      } else {
        console.error(`[GEMINI]${pid} model ${model} encountered fatal non-fallback error (${category}): ${err.message}`);
        throw err;
      }
    }
  }

  throw lastError || new Error("All Gemini fallback models exhausted or in cooldown.");
}
