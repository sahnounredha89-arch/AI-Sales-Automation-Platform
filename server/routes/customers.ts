import { Router } from "express";
import { db, setFirestoreQuotaExceeded } from "../firebase";
import { requireAdmin } from "../middleware/auth";
import { conversationStore } from "../services/conversationStore";

const router = Router();

router.get("/", requireAdmin, async (req, res) => {
  try {
    const snapshot = await db().collection("customers").orderBy("updatedAt", "desc").get();
    const customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(customers);
  } catch (error: any) {
    if (error.code === 8 || error.message?.includes("RESOURCE_EXHAUSTED") || error.message?.includes("Quota exceeded")) {
      console.warn("[Customers] Firestore quota reached. Synthesizing customers from conversationStore.");
      setFirestoreQuotaExceeded(true);

      const convs = conversationStore.getAllConversations();
      const customerMap = new Map<string, any>();

      for (const c of convs) {
        if (c.isTest || c.origin === "test" || c.platform === "simulator") continue;
        const key = c.customerId || c.platformUserId || c.id;
        if (!customerMap.has(key)) {
          customerMap.set(key, {
            id: key,
            name: c.customerName || "Customer",
            username: c.customerUsername || "",
            phone: c.customerPhone || "",
            platform: c.platform,
            createdAt: c.createdAt,
            updatedAt: c.lastMessageAt || c.updatedAt,
            channel: c.platform,
            source: "local_store"
          });
        }
      }

      return res.json(Array.from(customerMap.values()));
    }
    console.error("Error fetching customers:", error);
    res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

export default router;
