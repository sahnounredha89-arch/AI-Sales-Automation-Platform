import { Router } from "express";
import { db, setFirestoreQuotaExceeded } from "../firebase";
import { requireAdmin } from "../middleware/auth";
import { logAudit } from "../services/auditService";
import { sendAdminPaymentNotification } from "../services/telegramService";
import { localDataCache } from "../services/localDataCache";

const router = Router();

// Retrieve all orders (Admin only)
router.get("/", requireAdmin, async (req, res) => {
  try {
    const snapshot = await db().collection("orders").orderBy("createdAt", "desc").get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setFirestoreQuotaExceeded(false);
    localDataCache.saveOrders(orders);
    res.json(orders);
  } catch (error: any) {
    if (error.code === 8 || error.message?.includes("RESOURCE_EXHAUSTED") || error.message?.includes("Quota exceeded")) {
      console.warn("[Orders] Firestore quota reached. Returning cached orders from localDataCache.");
      setFirestoreQuotaExceeded(true);
      return res.json(localDataCache.getOrders());
    }
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Retrieve single order by ID (Admin only)
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db().collection("orders").doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (error: any) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Create Order with STRICT Server-Side Price Snapshot (Admin only)
router.post("/", requireAdmin, async (req, res) => {
  try {
    const {
      customerId,
      conversationId,
      productId,
      paymentMethodId,
      paymentStatus,
      orderStatus,
      paymentProofUrls,
      notes,
    } = req.body;

    if (!productId || !paymentMethodId) {
      return res.status(400).json({ error: "productId and paymentMethodId are required" });
    }

    // 1. Fetch Product
    const productDoc = await db().collection("products").doc(productId).get();
    if (!productDoc.exists) return res.status(404).json({ error: "Product not found" });
    const productData = productDoc.data()!;

    // 2. Fetch Payment Method
    const pmDoc = await db().collection("paymentMethods").doc(paymentMethodId).get();
    if (!pmDoc.exists) return res.status(404).json({ error: "Payment method not found" });
    const pmData = pmDoc.data()!;

    if (!pmData.active) return res.status(400).json({ error: "Payment method inactive" });

    // 3. Determine amount based on payment method currency
    let amount = 0;
    const currency = pmData.currency;
    if (currency === "DZD") {
      amount = productData.priceDZD;
    } else if (currency === "USDT") {
      amount = productData.priceUSDT;
    } else {
      return res.status(400).json({ error: "Unsupported currency" });
    }

    if (amount === undefined || amount === null) {
      return res.status(400).json({ error: "Price not available for this currency" });
    }

    const now = new Date().toISOString();
    const finalPaymentStatus = paymentStatus || "NOT_STARTED";
    const finalOrderStatus = orderStatus || "NEW";

    const orderData = {
      customerId: customerId || "test_customer",
      conversationId: conversationId || "test_conversation",
      productId,
      productNameSnapshot: productData.name,
      amount,
      currency,
      paymentMethod: pmData.name,
      paymentStatus: finalPaymentStatus,
      orderStatus: finalOrderStatus,
      paymentProofUrls: Array.isArray(paymentProofUrls) ? paymentProofUrls : [],
      notes: notes || "",
      createdAt: now,
      updatedAt: now,
      verifiedAt: null,
      deliveredAt: null,
      verifiedBy: null,
      deliveredBy: null,
    };

    let createdOrderId = `ord_${Date.now()}`;
    try {
      const docRef = await db().collection("orders").add(orderData);
      createdOrderId = docRef.id;
    } catch (fsErr: any) {
      console.warn("[Orders] Firestore write error (saving to local cache):", fsErr.message);
    }
    
    localDataCache.saveOrder({ id: createdOrderId, ...orderData });

    // Trigger Telegram notification if created in WAITING_FOR_VERIFICATION state
    if (
      finalPaymentStatus === "WAITING_FOR_VERIFICATION" &&
      finalOrderStatus === "WAITING_FOR_VERIFICATION"
    ) {
      sendAdminPaymentNotification(createdOrderId).catch((err) => {
        console.error("[Orders] Background notification trigger failed:", err.message);
      });
    }

    res.status(201).json({ id: createdOrderId, ...orderData });
  } catch (error: any) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * Transition Order to WAITING_FOR_VERIFICATION with payment proof.
 * This triggers the Telegram Admin Payment Notification server-side.
 */
router.post("/:id/submit-proof", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { proofUrl, proofUrls } = req.body;

    const orderDoc = await db().collection("orders").doc(id).get();
    if (!orderDoc.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    const existingData = orderDoc.data()!;
    const newProofList: string[] = Array.isArray(existingData.paymentProofUrls)
      ? [...existingData.paymentProofUrls]
      : [];

    if (proofUrl && typeof proofUrl === "string") {
      newProofList.push(proofUrl);
    }
    if (Array.isArray(proofUrls)) {
      newProofList.push(...proofUrls.filter((u: any) => typeof u === "string"));
    }

    const now = new Date().toISOString();
    await db().collection("orders").doc(id).update({
      paymentStatus: "WAITING_FOR_VERIFICATION",
      orderStatus: "WAITING_FOR_VERIFICATION",
      paymentProofUrls: newProofList,
      updatedAt: now,
    });

    // Server-Authoritative Telegram Notification Trigger
    const notifyResult = await sendAdminPaymentNotification(id);

    res.json({
      success: true,
      orderId: id,
      paymentStatus: "WAITING_FOR_VERIFICATION",
      orderStatus: "WAITING_FOR_VERIFICATION",
      telegramNotification: notifyResult,
    });
  } catch (error: any) {
    console.error("Error submitting payment proof:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * Manually transition an order to WAITING_FOR_VERIFICATION (e.g. from customer chat or admin action).
 * Server-authoritative: triggers Telegram notification with duplicate protection.
 */
router.post("/:id/waiting-verification", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const orderDoc = await db().collection("orders").doc(id).get();
    if (!orderDoc.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    const now = new Date().toISOString();
    await db().collection("orders").doc(id).update({
      paymentStatus: "WAITING_FOR_VERIFICATION",
      orderStatus: "WAITING_FOR_VERIFICATION",
      updatedAt: now,
    });

    const notifyResult = await sendAdminPaymentNotification(id);

    res.json({
      success: true,
      orderId: id,
      paymentStatus: "WAITING_FOR_VERIFICATION",
      orderStatus: "WAITING_FOR_VERIFICATION",
      telegramNotification: notifyResult,
    });
  } catch (error: any) {
    console.error("Error updating order to waiting verification:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * Retry / Resend Telegram Payment Notification for an Order.
 * Strict rules:
 * - Requires admin authentication
 * - Verifies the order exists
 * - Does NOT modify payment verification or order delivery status
 * - Sets forceRetry: true to bypass duplicate check
 */
router.post("/:id/telegram-notify", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const orderDoc = await db().collection("orders").doc(id).get();
    if (!orderDoc.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderDoc.data()!;
    if (order.paymentStatus !== "WAITING_FOR_VERIFICATION") {
      return res.status(400).json({
        error: `Cannot send verification notification: Order payment status is ${order.paymentStatus}, not WAITING_FOR_VERIFICATION.`,
      });
    }

    const result = await sendAdminPaymentNotification(id, { forceRetry: true });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || "Failed to resend Telegram notification",
      });
    }

    res.json({
      success: true,
      message: "Telegram notification resent successfully",
      messageId: result.messageId,
    });
  } catch (error: any) {
    console.error("Error retrying Telegram notification:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Admin Actions: Verify Payment
router.post("/:id/verify", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const orderDoc = await db().collection("orders").doc(id).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found" });

    const adminUser = req.session.username || "Admin";
    const now = new Date().toISOString();
    await db().collection("orders").doc(id).update({
      paymentStatus: "VERIFIED",
      orderStatus: "PAID",
      verifiedAt: now,
      verifiedBy: adminUser,
      updatedAt: now,
    });

    await logAudit(adminUser, "PAYMENT_VERIFIED", "Order", id, {});
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Admin Actions: Reject Payment
router.post("/:id/reject", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const orderDoc = await db().collection("orders").doc(id).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found" });

    const adminUser = req.session.username || "Admin";
    const now = new Date().toISOString();
    await db().collection("orders").doc(id).update({
      paymentStatus: "REJECTED",
      updatedAt: now,
    });

    await logAudit(adminUser, "PAYMENT_REJECTED", "Order", id, {});
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error rejecting payment:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Admin Actions: Deliver Order
router.post("/:id/deliver", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const orderDoc = await db().collection("orders").doc(id).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found" });
    const orderData = orderDoc.data()!;

    if (orderData.paymentStatus !== "VERIFIED") {
      return res.status(400).json({ error: "Cannot deliver unverified order" });
    }

    const adminUser = req.session.username || "Admin";
    const now = new Date().toISOString();
    await db().collection("orders").doc(id).update({
      orderStatus: "DELIVERED",
      deliveredAt: now,
      deliveredBy: adminUser,
      updatedAt: now,
    });

    await logAudit(adminUser, "ORDER_DELIVERED", "Order", id, {});
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error delivering order:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Admin Actions: Reset Revenue to 0
router.post("/reset-revenue", requireAdmin, async (req, res) => {
  try {
    const ordersSnapshot = await db().collection("orders").get();
    const batch = db().batch();
    let count = 0;

    ordersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.paymentStatus === "VERIFIED") {
        batch.update(doc.ref, {
          paymentStatus: "PENDING",
          updatedAt: new Date().toISOString()
        });
        count++;
      }
    });

    await batch.commit();
    const adminUser = req.session.username || "Admin";
    await logAudit(adminUser, "RESET_REVENUE", "Orders", "all", { countResetted: count });

    res.json({ success: true, countResetted: count, message: "Revenue successfully reset to 0 by reverting verified orders." });
  } catch (error: any) {
    console.error("Error resetting revenue:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;
