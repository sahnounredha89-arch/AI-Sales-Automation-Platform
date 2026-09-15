
// Delay utility for rate limits
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
import { db } from "../firebase";
import admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { sendTelegramNotification } from "./telegramService";
import { getGenAI, generateContentWithFallback } from "./gemini";
import { Type } from "@google/genai";
import { evaluateAndEscalateMessage, cancelUnansweredTimer, scheduleUnansweredTimer } from "./escalationService";
import { sendMetaMessage, sendMetaSenderAction } from "./metaService";
import { checkAndClaimMessageId, recordDeterministicHandled } from "./quotaService";
import { conversationStore } from "./conversationStore";

// Tools declaration
const createOrderDeclaration = {
  name: "create_order",
  description: "Create an order for the customer after they have selected a product and a valid payment method.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      productId: {
        type: Type.STRING,
        description: "The ID of the product the customer wants to buy."
      },
      paymentMethodId: {
        type: Type.STRING,
        description: "The ID of the payment method the customer selected."
      }
    },
    required: ["productId", "paymentMethodId"]
  }
};

// In-memory conversation history cache so conversation context persists even if database is offline/quota exceeded
const inMemoryHistory = new Map<string, { role: "user" | "model"; text: string }[]>();

let lastDbQuotaErrorTime = 0;
const DB_COOLDOWN_MS = 0;

function withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), ms))
  ]);
}

// In-memory fallback product catalog
export const FALLBACK_PRODUCTS = [
  {
    id: "gemini_pro",
    name: "Gemini Pro",
    description: "اشتراك رسمي لمدة عام كامل في خدمة الذكاء الاصطناعي الأكثر تطوراً من جوجل.",
    priceDZD: 4500,
    priceUSDT: 20,
    active: true,
    category: "AI Tools",
    deliveryType: "INSTANT_CODE"
  },
  {
    id: "capcut_pro",
    name: "CapCut Pro",
    description: "اشتراك رسمي في برنامج كاب كات برو لتحرير الفيديو الاحترافي.",
    priceDZD: 3500,
    priceUSDT: 15,
    active: true,
    category: "Editing",
    deliveryType: "MANUAL_DELIVERY"
  }
];

// In-memory fallback payment methods
export const FALLBACK_PAYMENT_METHODS = [
  {
    id: "baridimob_default",
    name: "BaridiMob",
    type: "BARIDIMOB",
    currency: "DZD",
    accountName: "Dokuni Shop",
    accountNumber: "00799999000000000000",
    instructions: "قم بإرسال المبلغ عبر تطبيق بريدي موب وإرفاق صورة وصل التحويل.",
    active: true
  },
  {
    id: "usdt_default",
    name: "Binance USDT",
    type: "BINANCE_PAY",
    currency: "USDT",
    accountName: "Dokuni USDT",
    accountNumber: "BINANCE_PAY_ID",
    instructions: "Send USDT via Binance Pay or TRC20 and upload the transaction screenshot.",
    active: true
  }
];

export async function processMessageAsAdmin(conversationId: string, text: string, adminUsername: string) {
  const now = new Date().toISOString();
  
  let source = "messenger";
  let channel = "messenger";
  let origin = "production";
  let isTest = false;

  try {
    const convDoc = await db().collection("conversations").doc(conversationId).get();
    if (convDoc.exists) {
      const convData = convDoc.data();
      source = convData?.source || (convData?.platform === "messenger" ? "messenger" : "simulator");
      channel = convData?.channel || "messenger";
      origin = convData?.origin || (source === "messenger" ? "production" : "test");
      isTest = convData?.isTest ?? (source !== "messenger");
    }
  } catch (err) {
    console.warn("[Admin Message] Failed to fetch conversation metadata:", err);
  }

  const messageData = {
    conversationId,
    direction: "outbound",
    sender: adminUsername || "Admin",
    type: "text",
    text,
    timestamp: now,
    source,
    channel,
    origin,
    isTest,
  };
  
  try {
    const docRef = await db().collection("conversations").doc(conversationId).collection("messages").add(messageData);
    await db().collection("conversations").doc(conversationId).update({
      lastMessageAt: now,
      updatedAt: now,
    });
    return { id: docRef.id, ...messageData };
  } catch (e) {
    return { id: "msg_" + Date.now(), ...messageData };
  }
}

/**
 * Deterministic Engine: Handles exact lookups and queries without calling Gemini
 * Saves 100% of tokens and quota on frequent routine customer inquiries.
 */
interface DeterministicResult {
  handled: boolean;
  text?: string;
  reason?: string;
}

const GENERIC_PRODUCT_WORDS = new Set(["pro", "plus", "vip", "max", "ultra", "premium", "app", "account", "compte", "subscription", "اشتراك", "برنامج"]);

function findMatchingProduct(text: string, products: any[]): any {
  if (!text || !products || !products.length) return null;
  const lower = text.toLowerCase();
  
  // 1. Exact full name or ID match
  for (const p of products) {
    const nameLower = (p.name || "").toLowerCase().trim();
    const idLower = (p.id || "").toLowerCase().trim();
    if ((nameLower && lower.includes(nameLower)) || (idLower && lower.includes(idLower))) {
      return p;
    }
  }

  // 2. Specific non-generic keyword match
  for (const p of products) {
    const nameLower = (p.name || "").toLowerCase().trim();
    const keywords = nameLower.split(/\s+/).filter((w: string) => w.length > 2 && !GENERIC_PRODUCT_WORDS.has(w));
    if (keywords.some((kw: string) => lower.includes(kw))) {
      return p;
    }
  }

  return null;
}

export async function tryDeterministicResponse(options: {
  userText: string;
  customerId: string;
  conversationId: string;
  products: any[];
  paymentMethods: any[];
  historyCount: number;
}): Promise<DeterministicResult> {
  const rawText = (options.userText || "").trim();
  const lowerText = rawText.toLowerCase();

  // 1. Pure greeting check (only when conversation is starting)
  const greetingExact = /^(salam|slm|salamou alaykom|salam alikoum|salamou 3alaykom|سلام|السلام عليكم|سلام عليكم|bonjour|salut|hello|hi|coucou)[!.,?؟ ]*$/i;
  if (greetingExact.test(rawText) && options.historyCount <= 1) {
    return {
      handled: true,
      text: "وعليكم السلام خويا مرحبا بك في دكوني شوب 😊 كيفاش نقدر نعاونك اليوم بخصوص الاشتراكات والخدمات الرقمية؟",
      reason: "greeting",
    };
  }

  // 2. Active payment methods inquiry
  const paymentMethodsQuery = /(طرق الدفع|طريقة الدفع|كيفاش نخلص|kifach nkhales|kifach nkhalsou|comment payer|moyens de paiement|methodes de paiement|wash homa les methodes|واش هما طرق الدفع)/i;
  if (paymentMethodsQuery.test(rawText) && rawText.length < 80) {
    const pmList = options.paymentMethods
      .filter((m: any) => m.active !== false)
      .map((m: any) => `• ${m.name} (${m.currency})`)
      .join("\n");
    return {
      handled: true,
      text: `طرق الدفع المتوفرة عندنا حالياً هي:\n${pmList}\n\nواشمن طريقة تساعدك باش نمدلك التفاصيل ونسجلولك الطلب؟ 👍`,
      reason: "payment_methods_display",
    };
  }

  // 3. Product catalog / what do you have inquiry
  const catalogQuery = /(وش عندكم|واش كاين|wash kayen|wach 3andkom|wach 3ndkom|وشنو العروض|قائمة الاسعار|catalogue|les offres|vos services|وش تبيعو|واش عندكم اشتراكات)/i;
  if (catalogQuery.test(rawText) && rawText.length < 70) {
    const prodList = options.products
      .filter((p: any) => p.active !== false)
      .map((p: any) => `• ${p.name} — ${p.priceDZD} دج (${p.priceUSDT} USDT)`)
      .join("\n");
    return {
      handled: true,
      text: `الاشتراكات والخدمات المتوفرة عندنا حالياً:\n${prodList}\n\nقولّي واش من اشتراك راك مهتم بيه باش نمدلك كامل التفاصيل والسعر تاعه 😊`,
      reason: "catalog_lookup",
    };
  }

  // 4. Specific product price lookup
  const priceKeywords = /(prix|سعر|شحال|بشحال|بقداه|combien|bchhal|chhal|ch7al|price|cout|soum)/i;
  const isQuestionComplex = /(كيفاش|هل|est-ce|marche|takhdem|تمشي|تخدم|différence|ميزات|طريقة|حساب|ايميل|activation|تفعيل)/i.test(rawText);

  // 4b. Product availability inquiry (e.g. "CapCut Pro متوفر؟", "متوفر؟", "كاين؟", "disponible?")
  const availabilityKeywords = /(متوفر|متوفرة|كاين|كاينة|kayen|kayna|disponible|dispo|عندكم|3andkom|3ndkom|disponibilité|disponibilite)/i;
  if (availabilityKeywords.test(rawText) && !isQuestionComplex && rawText.length < 90) {
    const matchedProduct = findMatchingProduct(lowerText, options.products);

    if (matchedProduct) {
      const isAvailable = matchedProduct.active !== false;
      if (isAvailable) {
        return {
          handled: true,
          text: `إيه خويا متوفر ${matchedProduct.name} حالياً وبسعر ${matchedProduct.priceDZD} دج (${matchedProduct.priceUSDT} USDT) وتسليم فوري ✅ تحب تسجل الطلب تاعك؟`,
          reason: "product_availability_lookup",
        };
      } else {
        return {
          handled: true,
          text: `للأسف خويا اشتراك ${matchedProduct.name} غير متوفر حالياً. نقترح عليك تشوف باقي الاشتراكات المتوفرة في الكتالوج 😊`,
          reason: "product_availability_lookup",
        };
      }
    }
  }

  if (priceKeywords.test(rawText) && !isQuestionComplex && rawText.length < 75) {
    const matchedProduct = findMatchingProduct(lowerText, options.products);

    if (matchedProduct) {
      return {
        handled: true,
        text: `السعر تاع ${matchedProduct.name} هو ${matchedProduct.priceDZD} دج (${matchedProduct.priceUSDT} USDT) 👍 حاب تطلبها ولا عندك استفسار عليها؟`,
        reason: "product_price_lookup",
      };
    }
  }

  // 5. Order status inquiry
  const orderStatusQuery = /(وين راه الطلب|حالة الطلب|statut commande|mon ordre|win rah talab|فين راه الطلب)/i;
  if (orderStatusQuery.test(rawText) && rawText.length < 80) {
    try {
      const orderSnap = await withTimeout(
        db().collection("orders")
          .where("customerId", "==", options.customerId)
          .orderBy("createdAt", "desc")
          .limit(1)
          .get(),
        1500
      );
      if (!orderSnap.empty) {
        const order = orderSnap.docs[0].data();
        let statusText = "قيد المعالجة 👍";
        if (order.orderStatus === "DELIVERED") {
          statusText = "تم تسليمه بنجاح ✅ تواصل معنا إذا واجهت أي استفسار";
        } else if (order.paymentStatus === "WAITING_FOR_VERIFICATION") {
          statusText = "قيد مراجعة وصل الدفع من طرف الإدارة ⏳ راح يتفعل في أقرب وقت إن شاء الله";
        } else if (order.paymentStatus === "VERIFIED") {
          statusText = "تم تأكيد الدفع بنجاح ✅ جاري تجهيز وتسليم الحساب";
        }
        return {
          handled: true,
          text: `الطلب تاعك لـ (${order.productNameSnapshot}): الحالة الحالية [${statusText}] 😊`,
          reason: "order_status_lookup",
        };
      }
    } catch (e) {
      // Fall through to Gemini if lookup times out
    }
  }

  return { handled: false };
}

/**
 * Intelligent product context filter: returns ONLY the relevant product if customer asked
 * about one specific product, or a compact 1-line list if general inquiry.
 */
function formatProductContext(userText: string, rawHistoryText: string, products: any[]): string {
  const combined = (userText + " " + rawHistoryText).toLowerCase();

  const matched = products.filter((p: any) => {
    const nameLower = (p.name || "").toLowerCase();
    const idLower = (p.id || "").toLowerCase();
    const parts = nameLower.split(/\s+/).filter((w: string) => w.length > 2);
    return combined.includes(nameLower) || combined.includes(idLower) || parts.some((kw: string) => combined.includes(kw));
  });

  if (matched.length === 1) {
    const p = matched[0];
    return `[SPECIFIC PRODUCT IN DISCUSSION]
ID: ${p.id} | Name: ${p.name} | Category: ${p.category}
Price: ${p.priceDZD} DZD / ${p.priceUSDT} USDT | Delivery: ${p.deliveryType}
Description: ${p.description || "Digital subscription"}`;
  }

  // Compact catalog format (saves ~75% tokens compared to raw JSON)
  return products.map((p: any) =>
    `- [${p.id}] ${p.name} (${p.category}): ${p.priceDZD} DZD / ${p.priceUSDT} USDT`
  ).join("\n");
}

/**
 * Intelligent payment context filter: only provides full bank/payment details
 * when the conversation is actually in or entering the payment stage.
 */
function formatPaymentContext(userText: string, rawHistoryText: string, paymentMethods: any[]): string {
  const combined = (userText + " " + rawHistoryText).toLowerCase();
  const isPaymentPhase = /(دفع|نخلص|خلص|baridimob|بريدي|ccp|usdt|binance|redotpay|redot|kifach nkhales|virement|compte|حساب|وصل|شريت|نبعثلك|screenshoot|screenshot)/i.test(combined);

  if (!isPaymentPhase) {
    return "Available payment methods: BaridiMob (DZD), Binance USDT (USDT). (Ask customer which method they prefer before sending full payment details).";
  }

  return paymentMethods.map((m: any) =>
    `[${m.id}] ${m.name} (${m.currency}): ${m.accountDetails || m.accountNumber || ""}. Instructions: ${m.instructions || ""}`
  ).join("\n");
}


function getDeterministicResponse(text, products, paymentMethods) {
  const norm = text.toLowerCase().trim();
  
  if (["وش كاين؟", "شنو المنتجات", "وش تبيعو", "products", "what do you sell"].includes(norm)) {
    if (products.length > 0) {
      return `مرحبا بك! متوفر عندنا:\n` + products.map(p => `- ${p.name} (${p.priceDZD || p.price} ${p.currency || "DA"})`).join('\n') + `\n\nكيفاش نقدر نعاونك؟`;
    }
  }

  if (["طرق الدفع؟", "كيفاش نخلص", "الدفع", "ccp", "ccp?", "baridimob?", "baridimob", "redotpay", "redotpay?", "flexy", "flexy?", "فليكسي"].includes(norm)) {
     if (paymentMethods.length > 0) {
       return `نقبلو الدفع عبر:\n` + paymentMethods.map(p => `- ${p.name}`).join('\n') + `\n\nإذا خيرت واش تشري نعطيك تفاصيل الدفع ✅`;
     }
  }

  if (norm.startsWith("prix") || norm.startsWith("كم السعر") || norm.startsWith("بشحال") || norm.includes("متوفر")) {
    const product = products.find(p => norm.includes(p.name.toLowerCase()));
    if (product) {
       let desc = product.shortDescription || product.description ? `\n${product.shortDescription || product.description}` : "";
       return `${desc}\nالسعر: ${product.priceDZD || product.price} ${product.currency || "DA"}

تحب نبعثلك تفاصيل الدفع؟`;
    }
  }
  return null;
}

export async function generateSalesAgentResponse(conversationId: string, customerId: string, userText: string, processingId?: string): Promise<{ responseText: string; modelUsed: string }> {
  try {
    const ai = getGenAI();
    
    // Fetch Active Products from Firestore with instant fallback
    let products: any[] = [];
    const isDbInCooldown = Date.now() - lastDbQuotaErrorTime < DB_COOLDOWN_MS;
    if (!isDbInCooldown) {
      try {
        const productsSnapshot = await withTimeout(db().collection("products").where("active", "==", true).get(), 5000);
        products = productsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e: any) {
        lastDbQuotaErrorTime = Date.now();
      }
    }
    if (!products.length) {
      products = FALLBACK_PRODUCTS;
    }
    
    // Fetch Active Payment Methods from Firestore with instant fallback
    let paymentMethods: any[] = [];
    if (!isDbInCooldown && Date.now() - lastDbQuotaErrorTime >= DB_COOLDOWN_MS) {
      try {
        const methodsSnapshot = await withTimeout(db().collection("paymentMethods").where("active", "==", true).get(), 5000);
        paymentMethods = methodsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e: any) {
        lastDbQuotaErrorTime = Date.now();
      }
    }
    if (!paymentMethods.length) {
      paymentMethods = FALLBACK_PAYMENT_METHODS;
    }

    let aiInstructions = "";
    if (!isDbInCooldown) {
      try {
        const aiSettingsDoc = await withTimeout(db().collection("settings").doc("ai").get(), 3000);
        if (aiSettingsDoc.exists) {
          aiInstructions = aiSettingsDoc.data()?.customInstructions || "";
        }
      } catch (e: any) {
        // ignore
      }
    }

    // Fetch conversation history (limited to last 6 messages to preserve quota and prompt size)
    const rawItems: { role: "user" | "model"; text: string }[] = [];
    let conversationSummary = "";

    if (!isDbInCooldown && Date.now() - lastDbQuotaErrorTime >= DB_COOLDOWN_MS) {
      try {
        // Fetch conversation doc to check for existing compact summary
        const convDoc = await withTimeout(db().collection("conversations").doc(conversationId).get(), 5000);
        if (convDoc.exists) {
          conversationSummary = convDoc.data()?.conversationSummary || "";
        }

        const historySnapshot = await withTimeout(db().collection("conversations").doc(conversationId).collection("messages").orderBy("timestamp", "desc").limit(10).get(), 5000);
        const historyDocs = historySnapshot.docs.reverse();
        for (const doc of historyDocs) {
          const msg = doc.data();
          if (msg.type !== "text" && !msg.text) continue;
          const isUser = msg.direction === "incoming" || msg.direction === "inbound";
          rawItems.push({
            role: isUser ? "user" : "model",
            text: msg.text,
          });
        }
      } catch (e) {
        lastDbQuotaErrorTime = Date.now();
      }
    }
    
    if (rawItems.length === 0) {
      const cached = inMemoryHistory.get(conversationId);
      if (cached && cached.length > 0) {
        rawItems.push(...cached.slice(-6));
      }
    }

    // SECTION 8: DETERMINISTIC OPERATIONS CHECK (NO GEMINI FOR DETERMINISTIC OPERATIONS)
    const deterministic = await tryDeterministicResponse({
      userText,
      customerId,
      conversationId,
      products,
      paymentMethods,
      historyCount: rawItems.length,
    });

    if (deterministic.handled && deterministic.text) {
      recordDeterministicHandled(deterministic.reason || "deterministic", userText);

      // Save outbound response to in-memory conversation memory
      const existingHist = inMemoryHistory.get(conversationId) || [];
      existingHist.push({ role: "model", text: deterministic.text });
      inMemoryHistory.set(conversationId, existingHist.slice(-10));

      return { responseText: deterministic.text, modelUsed: "deterministic_engine" };
    }
    
    // Format history for Gemini, ensuring valid alternating turns ending with user
    const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
    for (const item of rawItems) {
      if (!item.text?.trim()) continue;
      if (contents.length === 0 && item.role === "model") continue;

      if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
        contents[contents.length - 1].parts.push({ text: item.text });
      } else {
        contents.push({ role: item.role, parts: [{ text: item.text }] });
      }
    }

    // Ensure the conversation ends with the customer's current message
    if (contents.length === 0) {
      contents.push({ role: "user", parts: [{ text: userText || "Salam" }] });
    } else if (contents[contents.length - 1].role === "model") {
      contents.push({ role: "user", parts: [{ text: userText }] });
    }

    const rawHistoryText = rawItems.map(i => i.text).join(" ");
    const productContext = formatProductContext(userText, rawHistoryText, products);
    const paymentContext = formatPaymentContext(userText, rawHistoryText, paymentMethods);

    // Optimized system prompt structured for implicit caching:
    // Stable instructions first, followed by contextual product and payment data.
    const systemInstruction = `You are a real Algerian sales representative for Dokuni Shop chatting naturally with a customer.

${aiInstructions ? "USER INSTRUCTIONS:\n" + aiInstructions + "\n\n" : ""}

CORE RULES:
1. Always communicate primarily in natural Algerian Darija using Arabic script. If the customer explicitly asks for French or English, reply in that language.
2. Be concise: reply in 1 to 3 short sentences maximum. Be warm, natural, and sales-focused. Answer the customer's actual question directly without fluff.
3. NEVER say "As an AI...", "How may I assist you?", or robotic support phrases.
4. Accuracy: Only recommend available products and prices from the catalog below. DZD for BaridiMob/CCP/Flexy, USDT for Binance/RedotPay.
5. NEVER mark payment verified or order delivered yourself. Inform the customer that human administration verifies payment proofs manually ONLY IF they actually send a receipt for our shop.
6. If the customer mentions buying from a competitor or another site, politely acknowledge it without acting like they paid us. Ask if they need anything else from our catalog.
7. When the customer confirms product and payment method preference, CALL the create_order tool to register the order and provide payment instructions.

${conversationSummary ? `PREVIOUS CONTEXT SUMMARY: ${conversationSummary}\n` : ""}
PRODUCT CATALOG:
${productContext}

PAYMENT INFORMATION:
${paymentContext}
`;

    // Attempt to generate with automatic fallback and token tracking
    const { response, modelUsed } = await generateContentWithFallback({
      processingId,
      conversationId,
      customerId,
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 280,
        tools: [{ functionDeclarations: [createOrderDeclaration as any] }]
      }
    });

    let responseText = "";

    // Check if the model called a function
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      if (call.name === "create_order") {
        const { productId, paymentMethodId } = (call.args as any) || {};
        
        // Backend Validation
        const product: any = products.find(p => p.id === productId);
        const pm: any = paymentMethods.find(m => m.id === paymentMethodId);
        
        if (!product || !pm) {
          responseText = "I'm sorry, there was an issue processing that payment method or product. Could you please specify again?";
        } else {
          let amount = 0;
          if (pm.currency === "DZD") amount = product.priceDZD;
          else if (pm.currency === "USDT") amount = product.priceUSDT;
          
          if (!amount) {
            responseText = "I'm sorry, pricing for that currency is currently unavailable.";
          } else {
            const now = new Date().toISOString();
            try {
              await db().collection("orders").add({
                customerId,
                conversationId,
                productId,
                productNameSnapshot: product.name,
                amount,
                currency: pm.currency,
                paymentMethod: pm.name,
                paymentStatus: "WAITING_FOR_VERIFICATION",
                orderStatus: "NEW",
                paymentProofUrls: [],
                notes: "",
                createdAt: now,
                updatedAt: now,
                verifiedAt: null,
                deliveredAt: null,
                verifiedBy: null,
                deliveredBy: null,
              });
              
              sendTelegramNotification(`🛒 <b>New Order Created!</b>\n\nProduct: <b>${product.name}</b>\nAmount: ${amount} ${pm.currency}\nMethod: ${pm.name}\n\nWaiting for customer to send payment proof.`).catch(() => {});
            } catch (e: any) {
              console.warn("[Sales Agent] Could not persist order to Firestore (in-memory only):", e?.message);
            }
            
            // Format standard confirmation text with payment instructions in natural Algerian style
            responseText = `أكيد، وجدنا الطلب تاعك لـ ${product.name} 😊\n\nمن فضلك ابعت ${amount} ${pm.currency} لـ ${pm.name}:\n${pm.instructions}\n\nكي تكمل الدفع، ابعتلنا وصل الدفع (Screenshot) هنا باش الإدارة تأكد الطلب وتفعلّك الخدمة مباشرة 👍`;
          }
        }
      }
    } else {
      responseText = response.text || "";
      if (!responseText && response.candidates?.[0]?.content?.parts) {
        const textParts = response.candidates[0].content.parts
          .filter((p: any) => p.text)
          .map((p: any) => p.text);
        if (textParts.length > 0) {
          responseText = textParts.join("\n");
        }
      }
      if (!responseText) {
        responseText = "مرحبا بك 😊 واش حاب تعرف ولا تشري اليوم؟";
      }
    }

    // Save outbound response to in-memory conversation memory
    const existingHist = inMemoryHistory.get(conversationId) || [];
    existingHist.push({ role: "model", text: responseText });
    inMemoryHistory.set(conversationId, existingHist.slice(-20));

    return { responseText, modelUsed };

  } catch (error: any) {
    console.error("Gemini API error in sales agent:", error.message || error);
    // Safe fallback message in natural style without leaking internal details or stack traces
    const fallbackText = "مرحبا بك خويا 😊 كيفاش نقدر نعاونك بخصوص اشتراكاتنا؟";
    return { responseText: fallbackText, modelUsed: "fallback_code" };
  }
}

export async function processCustomerMessageInternal({ platform, platformUserId, name, text, platformMessageId, mediaUrl, type, skipDuplicateCheck, skipMessageSave }: any) {

  // Removed strict internal duplicate check here to allow queue to process messages

  if (platformMessageId && platform !== "simulator") {
    const outRef = db().collection("outgoingSends").doc(platformMessageId);
    try {
      const isDuplicateOut = await withTimeout(db().runTransaction(async (t) => {
        const doc = await t.get(outRef);
        if (doc.exists) {
           const data = doc.data();
           if (data && (data.status === "sending" || data.status === "sent")) {
             return true;
           }
        }
        t.set(outRef, {
          status: "sending",
          createdAt: new Date().toISOString()
        });
        return false;
      }), 1500);
      
      if (isDuplicateOut) {
        console.log(`[IDEMPOTENCY] outbound send already in progress/sent for ${platformMessageId} - ignoring`);
        return;
      }
    } catch (e: any) {
      console.warn("[IDEMPOTENCY] Outbound transaction notice:", e?.message);
    }
  }
  
  console.log(`[GEMINI] START messageId=${platformMessageId || 'N/A'}`);

  // Send immediate mark_seen and typing_on so the user knows we are processing their message
  if (platformUserId && (platform === "messenger" || platform === "instagram")) {
    sendMetaSenderAction({ recipientId: platformUserId, action: "mark_seen", platform }).catch(() => {});
    sendMetaSenderAction({ recipientId: platformUserId, action: "typing_on", platform }).catch(() => {});
  }

  try {
    const now = new Date().toISOString();

    // 1. Prevent duplicate message using collection check before touching customers/conversations
    if (platformMessageId && !skipDuplicateCheck) {
      try {
        const convCheck = await withTimeout(
          db().collection("conversations")
            .where("platform", "==", platform)
            .where("platformUserId", "==", platformUserId)
            .limit(1)
            .get(),
          8000
        );
          
        if (!convCheck.empty) {
          const convId = convCheck.docs[0].id;
          const dupCheck = await withTimeout(
            db().collection("conversations").doc(convId).collection("messages")
              .where("platformMessageId", "==", platformMessageId)
              .limit(1)
              .get(),
            8000
          );
            
          if (!dupCheck.empty) {
            console.log(`[Idempotency] Duplicate message ${platformMessageId} ignored early.`);
            return;
          }
        }
      } catch (dupErr) {
        // If DB check fails (e.g. quota limit), proceed safely rather than dropping customer message
      }
    }

    let conversationId = platformUserId ? `${platform}_${platformUserId}` : "conv_" + Date.now();
    let customerId = platformUserId ? `cust_${platformUserId}` : "cust_" + Date.now();
    try {
      const customersRef = db().collection("customers");
      const qCustomer = await withTimeout(customersRef.where("platform", "==",
 platform).where("platformUserId", "==", platformUserId).limit(1).get(), 2000);
      if (qCustomer.empty) {
        const newCustomer = await customersRef.add({ platform, platformUserId, name, username: name, language: "dz", status: "active", firstContactAt: now, lastContactAt: now, createdAt: now, updatedAt: now });
        customerId = newCustomer.id;
      } else {
        customerId = qCustomer.docs[0].id;
        customersRef.doc(customerId).update({ lastContactAt: now, updatedAt: now }).catch(() => {});
      }

      const convsRef = db().collection("conversations");
      let qConv = await withTimeout(convsRef.where("platform", "==", platform).where("platformUserId", "==", platformUserId).limit(1).get(), 2000);
      if (qConv.empty) {
        const newConv = await convsRef.add({ platform, platformUserId, customerId, customerName: name, status: "active", aiEnabled: true, humanHandoff: false, unreadCount: 1, lastMessageAt: now, createdAt: now, updatedAt: now, snippet: text, channel: platform === "instagram" ? "instagram" : (platform === "simulator" ? "simulator" : "messenger"), source: platform === "instagram" ? "meta_instagram" : (platform === "simulator" ? "simulator" : "meta_messenger"), origin: platform === "simulator" ? "test" : "production", isTest: platform === "simulator" });
        conversationId = newConv.id;
      } else {
        conversationId = qConv.docs[0].id;
        convsRef.doc(conversationId).update({ snippet: text, unreadCount: FieldValue.increment(1), channel: platform === "instagram" ? "instagram" : (platform === "simulator" ? "simulator" : "messenger"), source: platform === "instagram" ? "meta_instagram" : (platform === "simulator" ? "simulator" : "meta_messenger"), origin: platform === "simulator" ? "test" : "production", isTest: platform === "simulator" }).catch(() => {});
      }

      if (!skipMessageSave) {
        convsRef.doc(conversationId).collection("messages").add({ conversationId, direction: "inbound", sender: name || "Customer", type: type || "text", text, platformMessageId: platformMessageId || null, timestamp: now, channel: platform === "instagram" ? "instagram" : (platform === "simulator" ? "simulator" : "messenger"), source: platform === "instagram" ? "meta_instagram" : (platform === "simulator" ? "simulator" : "meta_messenger"), origin: platform === "simulator" ? "test" : "production", isTest: platform === "simulator" }).catch(() => {});
        convsRef.doc(conversationId).update({ lastMessageAt: now, updatedAt: now }).catch(() => {});
        console.log(`[MESSENGER_DB] incoming_message_saved=true`);
        
        // Notify admin via Telegram if this is an image (likely payment proof)
        if (type === "image" || mediaUrl) {
           sendTelegramNotification(`🔔 <b>Payment Proof Received!</b>\n\nCustomer: <b>${name || "Customer"}</b>\nPlatform: ${platform}\n\n<a href="${mediaUrl || "No URL"}">View Image</a>\n\nPlease check the dashboard to verify the payment and deliver the order.`).catch(() => {});
        }
        console.log(`[MESSENGER_CONVERSATION] conversation_id=${conversationId}`);
      }
    } catch(dbErr: any) {
      console.warn("[Sales Agent] Firestore notice in handleCustomerMessage, using memory context.", dbErr?.message);
    }

    // Always store incoming message in in-memory conversation memory
    const userHistory = inMemoryHistory.get(conversationId) || [];
    userHistory.push({ role: "user", text });
    inMemoryHistory.set(conversationId, userHistory.slice(-20));

    // Evaluate customer message for issues, human requests, or bot questions
    try {
      await evaluateAndEscalateMessage({
        conversationId,
        customerId,
        customerName: name,
        platform,
        text,
      });
    } catch(e) {
      console.error("Error in evaluateAndEscalateMessage", e);
    }

    // Re-check conversation state (handoff might have been triggered by escalation)
    let currentAiEnabled = true;
    let currentHumanHandoff = false;
    try {
      const freshConvDoc = await withTimeout(
        db().collection("conversations").doc(conversationId).get(),
        1500
      );
      const freshData = freshConvDoc.data();
      if (freshData) {
        currentAiEnabled = freshData?.aiEnabled !== false;
        currentHumanHandoff = freshData?.humanHandoff === true;
      }
    } catch(e) {
      const cached = conversationStore.getConversation(conversationId);
      if (cached) {
        currentAiEnabled = cached.aiEnabled !== false;
        currentHumanHandoff = cached.humanHandoff === true;
      }
    }

    // 5. Check if AI should reply
    if (!currentAiEnabled || currentHumanHandoff) {
      return;
    }

    // 6. Check for deterministic response
    let responseText = "";
    let modelUsed = "unknown";
    
    try {
      const productsSnapshot = await withTimeout(db().collection("products").where("active", "==", true).get(), 1500);
      const products = productsSnapshot.docs.map(d => d.data());
      
      const paymentSnapshot = await withTimeout(db().collection("paymentMethods").where("active", "==", true).get(), 1500);
      const paymentMethods = paymentSnapshot.docs.map(d => d.data());
      
      const deterministic = getDeterministicResponse(text, products, paymentMethods);
      if (deterministic) {
        responseText = deterministic;
        modelUsed = "deterministic";
        console.log("Used deterministic response.");
      }
    } catch(e) {
      const deterministic = getDeterministicResponse(text, FALLBACK_PRODUCTS, FALLBACK_PAYMENT_METHODS);
      if (deterministic) {
        responseText = deterministic;
        modelUsed = "deterministic";
        console.log("Used deterministic response (fallback data).");
      }
    }
    
    if (!responseText) {
      // 6b. Generate AI response
      console.log("Generating sales response...");
      try {
        const genResult = await generateSalesAgentResponse(conversationId, customerId, text, platformMessageId);
        responseText = genResult.responseText;
        modelUsed = genResult.modelUsed;
        console.log("Generated response:", responseText.substring(0, 50));
      } catch(e) {
        console.error("Error generating sales response (Gemini fallback triggered)", e);
        responseText = "سمحلي، كاين مشكل تقني مؤقت. وصلتني رسالتك ونرجعلك في أقرب وقت إن شاء الله. ✅";
        modelUsed = "error_fallback";
      }
    }
    if (responseText) {
      let metaMsgId: string | null = null;
      let metaSendSuccess = platform === "simulator"; // Simulator is always "success"
      let metaSendError: string | null = null;

      if (platform === "messenger" || platform === "instagram") {
        try {
          console.log(`[META_SEND] send_started=true messageId=${platformMessageId || 'N/A'}`);
          const metaRes = await sendMetaMessage({
            recipientId: platformUserId,
            text: responseText,
            platform,
          });
          if (metaRes?.ok && metaRes?.message_id) {
            metaMsgId = metaRes.message_id;
            metaSendSuccess = true;
            console.log(`[META_SEND] send_success=true messageId=${platformMessageId || 'N/A'}`);
          } else {
             metaSendError = metaRes?.error || "Unknown Meta Send Error";
             console.error(`[META_SEND] send_failed=true error="${metaSendError}"`);
          }
        } catch (metaErr: any) {
          metaSendError = metaErr?.message || String(metaErr);
          console.error(`[META_SEND] send_failed=true error="${metaSendError}"`);
        }
      }

      const outNow = new Date().toISOString();
      
      // Update in-memory resilient store for immediate UI visibility
      try {
        conversationStore.addMessage(conversationId, {
          id: `msg_ai_${Date.now()}`,
          conversationId,
          direction: "outbound",
          sender: "ai",
          type: "text",
          text: responseText,
          channel: platform as any,
          source: platform === "instagram" ? "meta_instagram" : (platform === "simulator" ? "simulator" : "meta_messenger"),
          origin: platform === "simulator" ? "test" : "production",
          isTest: platform === "simulator",
          platformMessageId: metaMsgId,
          timestamp: outNow,
          metaSent: metaSendSuccess,
          ...(metaSendError ? { metaError: metaSendError } : {})
        });
        conversationStore.upsertConversation({
          id: conversationId,
          snippet: responseText.slice(0, 120),
          lastMessageAt: outNow,
          updatedAt: outNow,
          unreadCount: 0,
        });
      } catch (storeErr) {
        console.warn("[salesAgent] conversationStore notice:", storeErr);
      }

      try {
        // ALWAYS save outbound messages to Firestore so admin has visibility, regardless of Meta delivery success.
        await db().collection("conversations").doc(conversationId).collection("messages").add({
          conversationId,
          direction: "outbound",
          sender: "ai",
          type: "text",
          text: responseText,
          channel: platform === "instagram" ? "instagram" : (platform === "simulator" ? "simulator" : "messenger"),
          source: platform === "instagram" ? "meta_instagram" : (platform === "simulator" ? "simulator" : "meta_messenger"),
          origin: platform === "simulator" ? "test" : "production",
          isTest: platform === "simulator",
          platformMessageId: metaMsgId,
          timestamp: outNow,
          modelUsed,
          metaSent: metaSendSuccess,
          ...(metaSendError ? { metaError: metaSendError } : {})
        });
        await db().collection("conversations").doc(conversationId).update({
          snippet: responseText.slice(0, 120),
          lastMessageAt: outNow,
          updatedAt: outNow,
        });
        console.log(`[MESSENGER_DB] outbound_message_saved=true`);

      if (platformMessageId && platform !== "simulator") {
        if (metaSendSuccess) {
          await db().collection("outgoingSends").doc(platformMessageId).update({
            status: "sent",
            updatedAt: outNow
          }).catch(() => {});

          await db().collection("webhookEvents").doc(platformMessageId).update({
            status: "COMPLETED",
            processingStatus: "completed",
            modelUsed,
            completedAt: outNow,
          }).catch(() => {});
        } else {
          await db().collection("webhookEvents").doc(platformMessageId).update({
            status: "FAILED",
            processingStatus: "failed",
            error: metaSendError || "Meta Send Failed",
            completedAt: outNow,
          }).catch(() => {});
        }
      }
      console.log(`[GEMINI] END messageId=${platformMessageId || 'N/A'}`);
      console.log(`[SEND] END messageId=${platformMessageId || 'N/A'}`);
      } catch (dbErr: any) {
        console.warn("Failed to save outbound message to DB", dbErr?.message);
      }

      // Always save to conversationStore
      conversationStore.addMessage(conversationId, {
        conversationId,
        direction: "outbound",
        sender: "Dokuni Shop (AI)",
        type: "text",
        text: responseText,
        channel: platform === "instagram" ? "instagram" : (platform === "simulator" ? "simulator" : "messenger"),
        source: platform === "instagram" ? "meta_instagram" : (platform === "simulator" ? "simulator" : "meta_messenger"),
        origin: platform === "simulator" ? "test" : "production",
        isTest: platform === "simulator",
        platformMessageId: metaMsgId,
        timestamp: outNow,
        modelUsed,
        metaSent: metaSendSuccess,
        ...(metaSendError ? { metaError: metaSendError } : {})
      });
      
      // Schedule 5-minute unanswered message alert
      await scheduleUnansweredTimer({
        conversationId,
        customerName: name,
        platform,
        aiMessageText: responseText,
      });

      return { success: true, responseText, conversationId };
    }
    return { success: true, responseText: null, conversationId };
  } catch (error: any) {
    console.error("Error handling customer message:", error);
    return { success: false, error: error.message || String(error) };
  }
}

// Queue and Debounce System
const DEBOUNCE_MS = 600;
const LOCK_TIMEOUT_MS = 60000;
const debounceTimers = new Map<string, NodeJS.Timeout>();
const inProgressProcessing = new Set<string>();

export function getActiveBotTasks(): string[] {
  return Array.from(inProgressProcessing);
}


export async function handleCustomerMessage(params: any) {
  const { platform, platformUserId, name, text, platformMessageId, mediaUrl, type } = params;

  if (platform === "simulator") {
    return await processCustomerMessageInternal(params);
  }

  const customerKey = `${platform}_${platformUserId}`;
  const now = new Date().toISOString();

  if (platformMessageId && platform !== "simulator" && !params.skipDuplicateCheck) {
    // Only claim if we haven't already claimed it higher up
    const isClaimed = await checkAndClaimMessageId(platformMessageId);
    if (!isClaimed) {
      console.log(`[IDEMPOTENCY] duplicate messageId=${platformMessageId} - dropped before processing queue`);
      return;
    }
    console.log(`[IDEMPOTENCY] claimed messageId=${platformMessageId}`);
  }

  // Save the message immediately to the existing conversation system
  // Consistent conversationId format matching webhooks & sync: ${platform}_${platformUserId}
  let conversationId = `${platform}_${platformUserId}`;
  let customerId = `cust_${platformUserId}`;

  // 1. Instantly record into resilient conversationStore so quota issues never drop customer messages
  conversationStore.upsertConversation({
    id: conversationId,
    customerId,
    customerName: name || "Customer",
    platform: platform as any,
    platformUserId,
    status: "active",
    aiEnabled: true,
    humanHandoff: false,
    unreadCount: 1,
    lastMessageAt: now,
    updatedAt: now,
    snippet: text,
    channel: platform,
    source: platform === "instagram" ? "meta_instagram" : "meta_messenger",
    origin: platform === "simulator" ? "test" : "production",
    isTest: platform === "simulator",
  });

  conversationStore.addMessage(conversationId, {
    id: platformMessageId ? `msg_${platformMessageId}` : `msg_in_${Date.now()}`,
    conversationId,
    direction: "inbound",
    sender: name || "Customer",
    type: type || "text",
    text,
    mediaUrl: mediaUrl || null,
    platformMessageId: platformMessageId || null,
    timestamp: now,
    channel: platform as any,
    source: platform === "instagram" ? "meta_instagram" : "meta_messenger",
    origin: platform === "simulator" ? "test" : "production",
    isTest: platform === "simulator",
  });
  
  try {
    const customersRef = db().collection("customers");
    const qCustomer = await withTimeout(customersRef.where("platform", "==",
 platform).where("platformUserId", "==", platformUserId).limit(1).get(), 3000);
    if (qCustomer.empty) {
      const newCustomer = await customersRef.add({ platform, platformUserId, name, username: name, language: "dz", status: "active", firstContactAt: now, lastContactAt: now, createdAt: now, updatedAt: now });
      customerId = newCustomer.id;
    } else {
      customerId = qCustomer.docs[0].id;
      customersRef.doc(customerId).update({ lastContactAt: now, updatedAt: now }).catch(() => {});
    }

    const convsRef = db().collection("conversations");
    let qConv = await withTimeout(convsRef.where("platform", "==", platform).where("platformUserId", "==", platformUserId).limit(1).get(), 3000);
    if (qConv.empty) {
      const newConv = await convsRef.add({ platform, platformUserId, customerId, customerName: name, status: "active", aiEnabled: true, humanHandoff: false, unreadCount: 1, lastMessageAt: now, createdAt: now, updatedAt: now, snippet: text, channel: platform === "instagram" ? "instagram" : (platform === "simulator" ? "simulator" : "messenger"), source: platform === "instagram" ? "meta_instagram" : (platform === "simulator" ? "simulator" : "meta_messenger"), origin: platform === "simulator" ? "test" : "production", isTest: platform === "simulator" });
      conversationId = newConv.id;
    } else {
      conversationId = qConv.docs[0].id;
      convsRef.doc(conversationId).update({ snippet: text, unreadCount: FieldValue.increment(1), channel: platform === "instagram" ? "instagram" : (platform === "simulator" ? "simulator" : "messenger"), source: platform === "instagram" ? "meta_instagram" : (platform === "simulator" ? "simulator" : "meta_messenger"), origin: platform === "simulator" ? "test" : "production", isTest: platform === "simulator" }).catch(() => {});
    }

    // Idempotency: check if message exists
    if (platformMessageId && !params.skipDuplicateCheck) {
       const dupCheck = await withTimeout(
         convsRef.doc(conversationId).collection("messages").where("platformMessageId", "==", platformMessageId).limit(1).get(),
         3000
       );
       if (!dupCheck.empty) {
          console.log(`[Idempotency] Message ${platformMessageId} already exists. Ignoring.`);
          return;
       }
    }

    // Save with queue status in background
    convsRef.doc(conversationId).collection("messages").add({ conversationId, direction: "inbound", sender: name || "Customer", type: type || "text", text, platformMessageId: platformMessageId || null, timestamp: now, processingStatus: "queued", channel: platform === "instagram" ? "instagram" : (platform === "simulator" ? "simulator" : "messenger"), source: platform === "instagram" ? "meta_instagram" : (platform === "simulator" ? "simulator" : "meta_messenger"), origin: platform === "simulator" ? "test" : "production", isTest: platform === "simulator" }).catch(() => {});
    convsRef.doc(conversationId).update({ lastMessageAt: now, updatedAt: now }).catch(() => {});

  } catch (err: any) {
    console.warn("[QUEUE] Firestore notice for inbound message (saved to conversationStore):", err?.message);
  }

  // Trigger Debounce
  // Debounce logic removed for serverless sync

  // In serverless, setTimeout might be killed.
  // We'll await a short delay instead of purely backgrounding if we can.
  // But wait, handleCustomerMessage is awaited now. So we can just sleep then process.
  await new Promise(resolve => setTimeout(resolve, DEBOUNCE_MS));
  try {
    await processCustomerQueue(conversationId, customerId, platform, platformUserId, name);
  } catch (qErr) {
    console.warn(`[Sales Agent] Queue processing failed for ${conversationId}, triggering direct response:`, qErr);
    await processCustomerMessageInternal({
      platform,
      platformUserId,
      name,
      text,
      platformMessageId,
      mediaUrl,
      type,
      skipDuplicateCheck: true,
      skipMessageSave: false,
    });
  }
}

async function processCustomerQueue(conversationId: string, customerId: string, platform: string, platformUserId: string, name: string) {
  const customerKey = `${platform}_${platformUserId}`;
  if (inProgressProcessing.has(customerKey)) {
    console.log(`[QUEUE] Processing already active in-memory for ${customerKey}.`);
    return;
  }
  inProgressProcessing.add(customerKey);

  const lockRef = db().collection("conversations").doc(conversationId);
  
  try {
    let acquired = true;
    try {
      acquired = await withTimeout(db().runTransaction(async (t) => {
        const lockDoc = await t.get(lockRef);
        const nowMs = Date.now();
        
        if (lockDoc.exists) {
          const data = lockDoc.data()!;
          if (data.processing) {
            const expiresAt = data.lockExpiresAt ? new Date(data.lockExpiresAt).getTime() : 0;
            if (nowMs < expiresAt) {
              return false;
            }
          }
        }
        
        t.update(lockRef, {
          processing: true,
          processingStartedAt: new Date(nowMs).toISOString(),
          lockExpiresAt: new Date(nowMs + LOCK_TIMEOUT_MS).toISOString(),
        });
        return true;
      }), 1500);
    } catch (lockErr) {
      // If Firestore transaction fails (e.g. Quota limit), don't block AI replies!
      console.warn(`[QUEUE] Lock transaction skipped for ${customerKey}, proceeding anyway.`);
      acquired = true;
    }

    if (!acquired) {
       console.log(`[QUEUE] Lock busy for ${customerKey}. Will process later.`);
       return;
    }
    console.log(`[QUEUE] lock acquired for ${customerKey}`);

    let hasMore = true;
    let iterations = 0;
    while (hasMore && iterations < 5) {
       iterations++;
       let pendingDocs: any[] = [];
       let pendingSnap: any = null;
       try {
         pendingSnap = await withTimeout(
           db().collection("conversations").doc(conversationId).collection("messages")
             .where("processingStatus", "==", "queued")
             .get(),
           2000
         );
         
         pendingDocs = pendingSnap.docs
           .filter((d: any) => d.data().direction === "inbound")
           .sort((a: any, b: any) => new Date(a.data().timestamp).getTime() - new Date(b.data().timestamp).getTime());
       } catch (dbErr) {
         console.warn(`[QUEUE] Notice fetching pending messages for ${conversationId}, checking memory:`, dbErr);
       }

       if (pendingDocs.length === 0) {
         // If DB returned 0 (e.g. because of quota or earlier save failure), check conversationStore!
         const cachedMsgs = conversationStore.getMessages(conversationId, 5);
         const latest = cachedMsgs.length > 0 ? cachedMsgs[cachedMsgs.length - 1] : null;
         const isLatestInbound = latest && (latest.direction === "inbound" || (latest as any).direction === "incoming");
         if (isLatestInbound && iterations === 1) {
           console.log(`[QUEUE] Processing unhandled message from conversationStore for ${customerKey}`);
           await processCustomerMessageInternal({
             platform,
             platformUserId,
             name,
             text: latest!.text,
             platformMessageId: latest!.platformMessageId || null,
             mediaUrl: latest!.mediaUrl || null,
             type: latest!.type || "text",
             skipDuplicateCheck: true,
             skipMessageSave: false,
           });
         }
         hasMore = false;
         break;
       }

       const batch = db().batch();
       const msgs: any[] = [];
       pendingDocs.forEach((doc: any) => {
         batch.update(doc.ref, { processingStatus: "processing" });
         msgs.push({ id: doc.id, ...doc.data() });
       });
       await batch.commit().catch(() => {});

       const combinedText = msgs.map(m => m.text).filter(Boolean).join("\n");
       const lastMsg = msgs[msgs.length - 1];
       
       console.log(`[GEMINI] generation started for ${customerKey}`);
       console.log(`[GEMINI] generation_started=true`);
       
       try {
         await processCustomerMessageInternal({
           platform,
           platformUserId,
           name,
           text: combinedText,
           platformMessageId: lastMsg.platformMessageId,
           mediaUrl: msgs.find(m => m.mediaUrl)?.mediaUrl || null,
           type: msgs.find(m => m.type !== "text")?.type || "text",
           skipDuplicateCheck: true,
           skipMessageSave: true // We already saved the inbound messages!
         });
         console.log(`[GEMINI] generation completed for ${customerKey}`);
         console.log(`[GEMINI] generation_success=true`);
       } catch (err) {
         console.error(`[GEMINI] error processing for ${customerKey}`, err);
       }

       if (pendingSnap) {
         const batch2 = db().batch();
         pendingSnap.docs.forEach((doc: any) => {
           batch2.update(doc.ref, { processingStatus: "processed" });
         });
         await batch2.commit().catch(() => {});
       }
       console.log(`[MESSENGER] response sent and messages marked processed`);
    }
  } catch (err) {
    console.error(`[QUEUE] Error in processCustomerQueue for ${customerKey}`, err);
    // Directly fallback to processCustomerMessageInternal so customer is never ignored
    await processCustomerMessageInternal({
      platform,
      platformUserId,
      name,
      text: "",
      platformMessageId: null,
      mediaUrl: null,
      type: "text",
      skipDuplicateCheck: true,
      skipMessageSave: false,
    }).catch(e => console.error("[Direct Fallback] Error:", e));
  } finally {
    inProgressProcessing.delete(customerKey);
    await lockRef.update({ processing: false }).catch(() => {});
    console.log(`[QUEUE] lock released for ${customerKey}`);
  }
}

/**
 * On-demand action to scan conversations for any unreplied customer messages and reply using AI sales agent.
 * Resilient against Firestore quota exhaustion by falling back to local conversationStore.
 */
export async function replyAllUnrepliedMessages(targetPlatform = "messenger"): Promise<{
  totalChecked: number;
  unrepliedFound: number;
  repliedCount: number;
  results: any[];
  message: string;
}> {
  console.log(`[On-Demand Reply] Scanning ${targetPlatform} conversations for unreplied customer messages...`);

  const platformsToCheck = targetPlatform === "all" ? ["messenger", "instagram"] : [targetPlatform];
  const candidateConversations: Map<string, any> = new Map();

  // 1. Gather conversations from Firestore with strict timeout
  try {
    for (const plat of platformsToCheck) {
      const snap = await withTimeout(
        db().collection("conversations").where("platform", "==", plat).get(),
        4000
      );
      snap.docs.forEach(d => {
        candidateConversations.set(d.id, { id: d.id, ...d.data() });
      });
    }
  } catch (fsErr: any) {
    console.warn("[On-Demand Reply] Firestore conversations scan notice (using local store fallback):", fsErr.message);
  }

  // 2. Always merge with local conversationStore
  const localConvs = conversationStore.getAllConversations();
  for (const conv of localConvs) {
    if (platformsToCheck.includes(conv.platform)) {
      if (!candidateConversations.has(conv.id)) {
        candidateConversations.set(conv.id, conv);
      }
    }
  }

  const unrepliedConversations: any[] = [];

  for (const [convId, data] of candidateConversations.entries()) {
    if (data.aiEnabled === false || data.humanHandoff === true) {
      continue;
    }

    let latestMsg: any = null;

    // Try Firestore messages first with timeout
    try {
      const msgsSnap = await withTimeout(
        db().collection("conversations").doc(convId).collection("messages")
          .orderBy("timestamp", "desc")
          .limit(3)
          .get(),
        2500
      );
      if (!msgsSnap.empty) {
        latestMsg = msgsSnap.docs[0].data();
      }
    } catch (msgErr) {
      // Fallback to local store
    }

    // Fallback to local conversationStore if Firestore had no messages
    if (!latestMsg) {
      const cachedMsgs = conversationStore.getMessages(convId, 5);
      if (cachedMsgs && cachedMsgs.length > 0) {
        latestMsg = cachedMsgs[cachedMsgs.length - 1];
      }
    }

    if (!latestMsg) continue;

    const isCustomerMsg = (latestMsg.direction === "inbound" || latestMsg.direction === "incoming") &&
      latestMsg.sender !== "ai" &&
      latestMsg.sender !== "Dokuni Shop" &&
      !latestMsg.sender?.includes("(AI)");

    if (isCustomerMsg) {
      unrepliedConversations.push({
        convId,
        convData: data,
        lastMsg: latestMsg,
      });
    }
  }

  console.log(`[On-Demand Reply] Found ${unrepliedConversations.length} unreplied customer conversations out of ${candidateConversations.size} total.`);

  const results: any[] = [];

  for (const item of unrepliedConversations) {
    const { convId, convData, lastMsg } = item;
    const convPlatform = convData.platform || targetPlatform || "messenger";
    const customerName = convData.customerName || lastMsg.sender || "Customer";
    const platformUserId = convData.platformUserId || convData.customerId;
    const customerId = convData.customerId || `cust_${platformUserId}`;
    const userText = lastMsg.text || (lastMsg.type === "image" ? "Photo attachment / وصل الدفع" : "Salam");

    try {
      const genResult = await generateSalesAgentResponse(convId, customerId, userText);
      const replyText = genResult.responseText;
      const modelUsed = genResult.modelUsed;

      let metaSent = false;
      let metaError: string | undefined;

      if (platformUserId && platformUserId !== "123456" && !platformUserId.startsWith("test_")) {
        try {
          const metaRes = await sendMetaMessage({
            recipientId: platformUserId,
            text: replyText,
            platform: convPlatform,
          });
          if (metaRes?.ok) {
            metaSent = true;
          } else {
            metaError = metaRes?.error;
          }
        } catch (mErr: any) {
          metaError = mErr.message;
        }
      }

      const now = new Date().toISOString();
      const messageId = `msg_ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      // 1. Immediately store in local/disk conversationStore
      conversationStore.addMessage(convId, {
        id: messageId,
        conversationId: convId,
        direction: "outbound",
        sender: "Dokuni Shop (AI)",
        type: "text",
        text: replyText,
        channel: convPlatform === "instagram" ? "instagram" : "messenger",
        source: convPlatform === "instagram" ? "meta_instagram" : "meta_messenger",
        origin: "production",
        isTest: false,
        timestamp: now,
        modelUsed,
        metaSent,
        ...(metaError ? { metaError } : {}),
      });

      conversationStore.upsertConversation({
        id: convId,
        snippet: replyText.slice(0, 120),
        lastMessageAt: now,
        updatedAt: now,
        unreadCount: 0,
      });

      // 2. Also persist to Firestore in background without blocking
      withTimeout(
        db().collection("conversations").doc(convId).collection("messages").add({
          conversationId: convId,
          direction: "outbound",
          sender: "ai",
          type: "text",
          text: replyText,
          channel: convPlatform === "instagram" ? "instagram" : "messenger",
          source: convPlatform === "instagram" ? "meta_instagram" : "meta_messenger",
          origin: "production",
          isTest: false,
          timestamp: now,
          modelUsed,
          metaSent,
          ...(metaError ? { metaError } : {}),
        }),
        3000
      ).catch(() => {});

      withTimeout(
        db().collection("conversations").doc(convId).update({
          snippet: replyText.slice(0, 120),
          lastMessageAt: now,
          updatedAt: now,
          unreadCount: 0,
        }),
        3000
      ).catch(() => {});

      results.push({
        convId,
        customerName,
        platformUserId,
        customerMessage: userText,
        replyText,
        modelUsed,
        metaSent,
        metaError,
      });

      console.log(`[On-Demand Reply] Replied to ${customerName} (${convPlatform}): "${replyText.slice(0, 50)}..." [metaSent=${metaSent}]`);

      // Polite delay between outbound messages
      await delay(1500);
    } catch (procErr: any) {
      console.error(`[On-Demand Reply] Error processing conv ${convId}:`, procErr);
    }
  }

  return {
    totalChecked: candidateConversations.size,
    unrepliedFound: unrepliedConversations.length,
    repliedCount: results.length,
    results,
    message: `Processed ${unrepliedConversations.length} unreplied conversations and generated ${results.length} replies.`,
  };
}
