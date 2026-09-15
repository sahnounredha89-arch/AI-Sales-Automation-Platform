import { Router } from "express";
import { db, setFirestoreQuotaExceeded } from "../firebase";
import { requireAdmin } from "../middleware/auth";
import { logAudit } from "../services/auditService";
import { localDataCache } from "../services/localDataCache";

const router = Router();

router.get("/", requireAdmin, async (req, res) => {
  try {
    const snapshot = await db().collection("paymentMethods").get();
    const methods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setFirestoreQuotaExceeded(false);
    localDataCache.savePaymentMethods(methods);
    res.json(methods);
  } catch (error: any) {
    if (error.code === 8 || error.message?.includes("RESOURCE_EXHAUSTED") || error.message?.includes("Quota exceeded")) {
      console.warn("[PaymentMethods] Firestore quota reached. Returning cached methods from localDataCache.");
      setFirestoreQuotaExceeded(true);
      return res.json(localDataCache.getPaymentMethods());
    }
    console.error("Error fetching payment methods:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db().collection("paymentMethods").doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Payment method not found" });
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (error: any) {
    console.error("Error fetching payment method:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const { name, type, currency, accountName, accountNumber, instructions, active } = req.body;
    
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Payment method name is required" });
    }

    // Determine and validate type
    let cleanType = type;
    if (!cleanType) {
      const lower = name.toLowerCase();
      if (lower.includes("redot") || lower.includes("binance") || currency === "USDT") {
        cleanType = "RedotPay";
      } else if (lower.includes("baridi")) {
        cleanType = "BaridiMob";
      } else {
        cleanType = "CCP";
      }
    }
    
    let validCurrency = "DZD";
    if (cleanType === "RedotPay") validCurrency = "USDT";
    else if (cleanType === "CCP" || cleanType === "BaridiMob") validCurrency = "DZD";
    else return res.status(400).json({ error: "Invalid payment type. Must be BaridiMob, CCP, or RedotPay." });

    // Strict rule: BaridiMob/CCP use DZD, RedotPay uses USDT
    const finalCurrency = validCurrency;

    const now = new Date().toISOString();
    
    const methodData = {
      name: name.trim(),
      type: cleanType,
      currency: finalCurrency,
      accountName: (accountName || "").trim(),
      accountNumber: (accountNumber || "").trim(),
      instructions: (instructions || "").trim(),
      active: active !== undefined ? Boolean(active) : true,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db().collection("paymentMethods").add(methodData);
    const actor = req.session?.username || "admin";
    await logAudit(actor, "PAYMENT_METHOD_CREATED", "PaymentMethod", docRef.id, { name: methodData.name, type: cleanType });
    
    res.status(201).json({ id: docRef.id, ...methodData });
  } catch (error: any) {
    console.error("Error creating payment method:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const docRef = db().collection("paymentMethods").doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Payment method not found" });
    }
    
    const existing = docSnap.data() || {};
    const { name, type, currency, accountName, accountNumber, instructions, active } = req.body;
    
    const updatedName = name !== undefined ? String(name).trim() : existing.name;
    if (!updatedName) {
      return res.status(400).json({ error: "Payment method name cannot be empty" });
    }

    let cleanType = type !== undefined ? type : existing.type;
    if (!cleanType) {
      const lower = updatedName.toLowerCase();
      if (lower.includes("redot") || lower.includes("binance") || existing.currency === "USDT") {
        cleanType = "RedotPay";
      } else if (lower.includes("baridi")) {
        cleanType = "BaridiMob";
      } else {
        cleanType = "CCP";
      }
    }

    let validCurrency = "DZD";
    if (cleanType === "RedotPay") validCurrency = "USDT";
    else if (cleanType === "CCP" || cleanType === "BaridiMob") validCurrency = "DZD";
    else return res.status(400).json({ error: "Invalid payment type. Must be BaridiMob, CCP, or RedotPay." });

    const finalCurrency = validCurrency;

    const updateData = {
      name: updatedName,
      type: cleanType,
      currency: finalCurrency,
      accountName: accountName !== undefined ? String(accountName).trim() : (existing.accountName || ""),
      accountNumber: accountNumber !== undefined ? String(accountNumber).trim() : (existing.accountNumber || ""),
      instructions: instructions !== undefined ? String(instructions).trim() : (existing.instructions || ""),
      active: active !== undefined ? Boolean(active) : (existing.active ?? true),
      updatedAt: new Date().toISOString(),
    };

    await docRef.update(updateData);
    const actor = req.session?.username || "admin";
    await logAudit(actor, "PAYMENT_METHOD_UPDATED", "PaymentMethod", id, { name: updateData.name });

    res.json({ id, ...existing, ...updateData });
  } catch (error: any) {
    console.error("Error updating payment method:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Dedicated active toggle route
router.patch("/:id/toggle-active", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const docRef = db().collection("paymentMethods").doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Payment method not found" });
    }
    
    const existing = docSnap.data() || {};
    const newActiveState = req.body.active !== undefined ? Boolean(req.body.active) : !existing.active;
    const updatedAt = new Date().toISOString();
    
    await docRef.update({
      active: newActiveState,
      updatedAt,
    });

    const actor = req.session?.username || "admin";
    await logAudit(actor, newActiveState ? "PAYMENT_METHOD_ACTIVATED" : "PAYMENT_METHOD_DEACTIVATED", "PaymentMethod", id, { active: newActiveState });

    res.json({ id, ...existing, active: newActiveState, updatedAt });
  } catch (error: any) {
    console.error("Error toggling payment method active status:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id === "undefined" || id === "null") {
      return res.status(400).json({ error: "Valid payment method ID is required" });
    }
    const actor = req.session?.username || "admin";
    console.log(`[PaymentMethods] DELETE requested for id: "${id}" by actor: "${actor}"`);
    await db().collection("paymentMethods").doc(id).delete();
    await logAudit(actor, "PAYMENT_METHOD_DELETED", "PaymentMethod", id, {});
    console.log(`[PaymentMethods] Successfully deleted payment method id: "${id}"`);
    res.json({ success: true, id });
  } catch (error: any) {
    console.error("Error deleting payment method:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;
