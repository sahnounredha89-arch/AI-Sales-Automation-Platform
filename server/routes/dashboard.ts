import { Router } from "express";
import { db, getDatabaseStatus, setFirestoreQuotaExceeded } from "../firebase";
import { requireAdmin } from "../middleware/auth";
import { getGeminiQuotaMetrics } from "../services/quotaService";
import { getModelCooldownStatus, resetModelCooldown, getPrimaryModel } from "../services/gemini";
import { conversationStore } from "../services/conversationStore";
import { localDataCache } from "../services/localDataCache";
import { getActiveBotTasks } from "../services/salesAgent";

const router = Router();

// In-memory cache to conserve Firestore read quota
let cachedMetricsResponse: any = null;
let lastMetricsCacheTime = 0;
const METRICS_CACHE_TTL = 30000; // 30 seconds

router.get("/gemini-quota", requireAdmin, async (req, res) => {
  try {
    const quotaMetrics = getGeminiQuotaMetrics();
    const cooldownStatus = getModelCooldownStatus();
    res.json({
      ...quotaMetrics,
      cooldownStatus,
      primaryModel: getPrimaryModel(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get quota metrics" });
  }
});

router.post("/gemini-quota/reset-cooldown", requireAdmin, async (req, res) => {
  try {
    const { model } = req.body || {};
    resetModelCooldown(model);
    res.json({ success: true, message: "Cooldown reset successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/database/refresh", requireAdmin, async (req, res) => {
  try {
    cachedMetricsResponse = null;
    setFirestoreQuotaExceeded(false);
    
    let cloudConnected = false;
    let quotaError = null;
    try {
      await db().collection("products").limit(1).get();
      cloudConnected = true;
      setFirestoreQuotaExceeded(false);
    } catch (err: any) {
      if (err.code === 8 || err.message?.includes("RESOURCE_EXHAUSTED") || err.message?.includes("Quota exceeded")) {
        setFirestoreQuotaExceeded(true);
        quotaError = "Google Cloud daily free-tier read quota (50,000 reads) reached. Local persistence is active.";
      } else {
        quotaError = err.message;
      }
    }

    res.json({
      success: true,
      cloudConnected,
      dbStatus: getDatabaseStatus(),
      message: cloudConnected 
        ? "Cloud Firestore connection successfully verified and active!" 
        : `Cloud Firestore quota limit reached. Local store is active and serving data. (${quotaError || ""})`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/bot-status", requireAdmin, (req, res) => {
  res.json({ activeBotTasks: getActiveBotTasks() });
});

router.get("/metrics", requireAdmin, async (req, res) => {
  const forceRefresh = req.query.force === "true";
  const now = Date.now();

  // Return cached metrics if within TTL to protect Firestore daily read quota
  if (!forceRefresh && cachedMetricsResponse && (now - lastMetricsCacheTime < METRICS_CACHE_TTL)) {
    return res.json(cachedMetricsResponse);
  }

  try {
    const productsSnapshot = await db().collection("products").get();
    const ordersSnapshot = await db().collection("orders").get();
    const customersSnapshot = await db().collection("customers").get();
    const conversationsSnapshot = await db().collection("conversations").limit(50).get();
    
    setFirestoreQuotaExceeded(false);

    let totalProducts = productsSnapshot.size;
    let activeProducts = productsSnapshot.docs.filter(d => d.data().active === true).length;
    
    // Save to local cache for resilient fallback
    try {
      const prodList = productsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      localDataCache.saveProducts(prodList);
    } catch (e) {}

    let totalOrders = ordersSnapshot.size;
    let pendingPayments = 0;
    let waitingVerification = 0;
    let paidOrders = 0;
    let deliveredOrders = 0;
    
    let revenueDZD = 0;
    let revenueUSDT = 0;

    ordersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.paymentStatus === "PENDING") pendingPayments++;
      if (data.paymentStatus === "WAITING_FOR_VERIFICATION") waitingVerification++;
      if (data.paymentStatus === "VERIFIED") paidOrders++;
      if (data.orderStatus === "DELIVERED") deliveredOrders++;

      if (data.paymentStatus === "VERIFIED") {
        if (data.currency === "DZD") {
          revenueDZD += (data.amount || 0);
        } else if (data.currency === "USDT") {
          revenueUSDT += (data.amount || 0);
        }
      }
    });

    try {
      const ordList = ordersSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      localDataCache.saveOrders(ordList);
    } catch (e) {}

    let activeConversations = 0;
    let humanHandoffConversations = 0;
    const realConvDocs = conversationsSnapshot.docs.filter(doc => {
      const data = doc.data();
      if (data.isTest === true || data.origin === "test" || data.platform === "simulator" || data.channel === "simulator") return false;
      return true;
    });

    realConvDocs.forEach(doc => {
      const data = doc.data();
      if (data.status !== "closed" && data.status !== "ARCHIVED") activeConversations++;
      if (data.humanHandoff === true) humanHandoffConversations++;
    });

    // Recent 5 live real conversations
    const recentConversations = realConvDocs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => new Date(b.lastMessageAt || b.updatedAt || 0).getTime() - new Date(a.lastMessageAt || a.updatedAt || 0).getTime())
      .slice(0, 5);

    const geminiQuota = getGeminiQuotaMetrics();
    const cooldownStatus = getModelCooldownStatus();

    const responseData = {
      totalProducts,
      activeProducts,
      totalOrders,
      pendingPayments,
      waitingVerification,
      paidOrders,
      deliveredOrders,
      revenueDZD,
      revenueUSDT,
      totalCustomers: customersSnapshot.size,
      activeConversations,
      humanHandoffConversations,
      recentConversations,
      dbStatus: getDatabaseStatus(),
      activeBotTasks: getActiveBotTasks(),
      geminiQuota: {
        ...geminiQuota,
        cooldownStatus,
      }
    };

    cachedMetricsResponse = responseData;
    lastMetricsCacheTime = now;

    res.json(responseData);
  } catch (error: any) {
    let errorMessage = error.message || "Internal server error";
    if (error.code === 8 || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("Quota exceeded")) {
      console.warn("[Dashboard] Firestore quota reached. Aggregating live metrics from resilient local store.");
      setFirestoreQuotaExceeded(true);

      // Aggregate real metrics from local persistence
      const allConvs = conversationStore.getAllConversations();
      const realConvs = allConvs.filter(c => c.origin !== "test" && c.platform !== "simulator" && !c.isTest && !c.id.startsWith("conv_test"));
      const activeConversations = realConvs.filter(c => c.status !== "closed" && c.status !== "archived").length;
      const humanHandoffConversations = realConvs.filter(c => c.humanHandoff === true).length;
      
      const customerKeys = new Set(realConvs.map(c => c.customerId || c.platformUserId || c.customerPhone || c.customerUsername || c.customerName || c.id));
      const totalCustomers = customerKeys.size || realConvs.length;

      const recentConversations = realConvs
        .sort((a, b) => new Date(b.lastMessageAt || b.updatedAt || 0).getTime() - new Date(a.lastMessageAt || a.updatedAt || 0).getTime())
        .slice(0, 5)
        .map(c => ({
          id: c.id,
          customerId: c.customerId,
          customerName: c.customerName,
          customerUsername: c.customerUsername,
          platform: c.platform,
          lastMessageAt: c.lastMessageAt,
          snippet: c.snippet || "",
          unreadCount: c.unreadCount || 0,
          humanHandoff: c.humanHandoff,
          aiEnabled: c.aiEnabled,
        }));

      const products = localDataCache.getProducts();
      const orders = localDataCache.getOrders();

      let pendingPayments = 0;
      let waitingVerification = 0;
      let paidOrders = 0;
      let deliveredOrders = 0;
      let revenueDZD = 0;
      let revenueUSDT = 0;

      orders.forEach((o: any) => {
        if (o.paymentStatus === "PENDING") pendingPayments++;
        if (o.paymentStatus === "WAITING_FOR_VERIFICATION") waitingVerification++;
        if (o.paymentStatus === "VERIFIED") paidOrders++;
        if (o.orderStatus === "DELIVERED") deliveredOrders++;
        if (o.paymentStatus === "VERIFIED") {
          if (o.currency === "DZD") revenueDZD += (o.amount || 0);
          else if (o.currency === "USDT") revenueUSDT += (o.amount || 0);
        }
      });

      const fallbackResponse = {
        totalProducts: products.length,
        activeProducts: products.filter((p: any) => p.active !== false).length,
        totalOrders: orders.length,
        pendingPayments,
        waitingVerification,
        paidOrders,
        deliveredOrders,
        revenueDZD,
        revenueUSDT,
        totalCustomers,
        activeConversations,
        humanHandoffConversations,
        recentConversations,
        dbStatus: getDatabaseStatus(),
        activeBotTasks: getActiveBotTasks(),
        geminiQuota: {
          ...getGeminiQuotaMetrics(),
          cooldownStatus: getModelCooldownStatus(),
        }
      };

      cachedMetricsResponse = fallbackResponse;
      lastMetricsCacheTime = now;

      return res.json(fallbackResponse);
    }
    console.error("Error fetching metrics:", error);
    if (errorMessage.includes("has not been used in project") || errorMessage.includes("is disabled")) {
      errorMessage = "Firestore Database has not been created yet. Please visit the Firebase Console, go to your project, click 'Firestore Database' in the sidebar, and click 'Create database'.";
    } else if (errorMessage.includes("Missing or insufficient permissions")) {
      errorMessage = "Firestore Permission Denied. The backend cannot connect to your Firebase Project. Please add FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY to your environment variables (Settings > Secrets) to allow the backend to authenticate properly.";
    }
    res.status(500).json({ error: errorMessage });
  }
});

export default router;
