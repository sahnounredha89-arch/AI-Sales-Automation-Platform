import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { db, storage, setFirestoreQuotaExceeded } from "../firebase";
import { requireAdmin } from "../middleware/auth";
import { logAudit } from "../services/auditService";
import { localDataCache } from "../services/localDataCache";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/", requireAdmin, async (req, res) => {
  try {
    const snapshot = await db().collection("products").get();
    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setFirestoreQuotaExceeded(false);
    localDataCache.saveProducts(products);
    res.json(products);
  } catch (error: any) {
    if (error.code === 8 || error.message?.includes("RESOURCE_EXHAUSTED") || error.message?.includes("Quota exceeded")) {
      console.warn("[Products] Firestore quota reached. Returning cached products from localDataCache.");
      setFirestoreQuotaExceeded(true);
      return res.json(localDataCache.getProducts());
    }
    console.error("Error fetching products:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db().collection("products").doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (error: any) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const { 
      name, 
      shortDescription, 
      fullDescription, 
      priceDZD, 
      priceUSDT, 
      duration, 
      features, 
      faq, 
      deliveryInfo, 
      aiSalesInstructions, 
      active,
      imageUrl 
    } = req.body;
    
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Product name is required" });
    }

    // Server-side validation
    const parsedDZD = Number(priceDZD);
    const parsedUSDT = Number(priceUSDT);
    if (isNaN(parsedDZD) || parsedDZD < 0) return res.status(400).json({ error: "Invalid priceDZD (must be 0 or greater)" });
    if (isNaN(parsedUSDT) || parsedUSDT < 0) return res.status(400).json({ error: "Invalid priceUSDT (must be 0 or greater)" });
    
    const now = new Date().toISOString();
    
    // Clean array fields
    const cleanFeatures = Array.isArray(features) 
      ? features.filter(f => typeof f === "string" && f.trim().length > 0).map(f => f.trim())
      : [];
      
    const cleanFaq = Array.isArray(faq)
      ? faq.filter(item => item && typeof item.question === "string" && item.question.trim().length > 0)
           .map(item => ({ question: String(item.question).trim(), answer: String(item.answer || "").trim() }))
      : [];

    const productData = {
      name: name.trim(),
      shortDescription: (shortDescription || "").trim(),
      fullDescription: (fullDescription || "").trim(),
      priceDZD: parsedDZD,
      priceUSDT: parsedUSDT,
      duration: (duration || "").trim(),
      features: cleanFeatures,
      faq: cleanFaq,
      deliveryInfo: (deliveryInfo || "").trim(),
      aiSalesInstructions: (aiSalesInstructions || "").trim(),
      active: active !== undefined ? Boolean(active) : true,
      imageUrl: (imageUrl || "").trim(),
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db().collection("products").add(productData);
    const actor = req.session?.username || "admin";
    await logAudit(actor, "PRODUCT_CREATED", "Product", docRef.id, { name: productData.name });
    
    res.status(201).json({ id: docRef.id, ...productData });
  } catch (error: any) {
    console.error("Error creating product:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const docRef = db().collection("products").doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    const existing = docSnap.data() || {};
    const { 
      name, 
      shortDescription, 
      fullDescription, 
      priceDZD, 
      priceUSDT, 
      duration, 
      features, 
      faq, 
      deliveryInfo, 
      aiSalesInstructions, 
      active,
      imageUrl 
    } = req.body;
    
    const updatedName = name !== undefined ? String(name).trim() : existing.name;
    if (!updatedName) {
      return res.status(400).json({ error: "Product name cannot be empty" });
    }

    let parsedDZD = existing.priceDZD;
    if (priceDZD !== undefined) {
      parsedDZD = Number(priceDZD);
      if (isNaN(parsedDZD) || parsedDZD < 0) return res.status(400).json({ error: "Invalid priceDZD (must be 0 or greater)" });
    }

    let parsedUSDT = existing.priceUSDT;
    if (priceUSDT !== undefined) {
      parsedUSDT = Number(priceUSDT);
      if (isNaN(parsedUSDT) || parsedUSDT < 0) return res.status(400).json({ error: "Invalid priceUSDT (must be 0 or greater)" });
    }

    const cleanFeatures = features !== undefined
      ? (Array.isArray(features) ? features.filter(f => typeof f === "string" && f.trim().length > 0).map(f => f.trim()) : [])
      : (existing.features || []);

    const cleanFaq = faq !== undefined
      ? (Array.isArray(faq) 
          ? faq.filter(item => item && typeof item.question === "string" && item.question.trim().length > 0)
               .map(item => ({ question: String(item.question).trim(), answer: String(item.answer || "").trim() }))
          : [])
      : (existing.faq || []);

    const updateData = {
      name: updatedName,
      shortDescription: shortDescription !== undefined ? String(shortDescription).trim() : (existing.shortDescription || ""),
      fullDescription: fullDescription !== undefined ? String(fullDescription).trim() : (existing.fullDescription || ""),
      priceDZD: parsedDZD,
      priceUSDT: parsedUSDT,
      duration: duration !== undefined ? String(duration).trim() : (existing.duration || ""),
      features: cleanFeatures,
      faq: cleanFaq,
      deliveryInfo: deliveryInfo !== undefined ? String(deliveryInfo).trim() : (existing.deliveryInfo || ""),
      aiSalesInstructions: aiSalesInstructions !== undefined ? String(aiSalesInstructions).trim() : (existing.aiSalesInstructions || ""),
      active: active !== undefined ? Boolean(active) : (existing.active ?? true),
      imageUrl: imageUrl !== undefined ? String(imageUrl).trim() : (existing.imageUrl || ""),
      updatedAt: new Date().toISOString(),
    };

    await docRef.update(updateData);
    const actor = req.session?.username || "admin";
    await logAudit(actor, "PRODUCT_UPDATED", "Product", id, { name: updateData.name });

    res.json({ id, ...existing, ...updateData });
  } catch (error: any) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Dedicated active toggle route
router.patch("/:id/toggle-active", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const docRef = db().collection("products").doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    const existing = docSnap.data() || {};
    const newActiveState = req.body.active !== undefined ? Boolean(req.body.active) : !existing.active;
    const updatedAt = new Date().toISOString();
    
    await docRef.update({
      active: newActiveState,
      updatedAt,
    });

    const actor = req.session?.username || "admin";
    await logAudit(actor, newActiveState ? "PRODUCT_ACTIVATED" : "PRODUCT_DEACTIVATED", "Product", id, { active: newActiveState });

    res.json({ id, ...existing, active: newActiveState, updatedAt });
  } catch (error: any) {
    console.error("Error toggling product active status:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id === "undefined" || id === "null") {
      return res.status(400).json({ error: "Valid product ID is required" });
    }
    const actor = req.session?.username || "admin";
    console.log(`[Products] DELETE requested for id: "${id}" by actor: "${actor}"`);
    await db().collection("products").doc(id).delete();
    await logAudit(actor, "PRODUCT_DELETED", "Product", id, {});
    console.log(`[Products] Successfully deleted product id: "${id}"`);
    res.json({ success: true, id });
  } catch (error: any) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Image Upload
router.post("/:id/image", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: "No image file provided" });

    const bucket = storage().bucket();
    const ext = req.file.originalname.split('.').pop();
    const filename = `products/${id}-${uuidv4()}.${ext}`;
    const file = bucket.file(filename);

    await file.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype },
    });

    await file.makePublic();
    const publicUrl = bucket.name === "local-storage"
      ? `/uploads/${path.basename(filename)}`
      : `https://storage.googleapis.com/${bucket.name}/${filename}`;

    await db().collection("products").doc(id).update({ 
      imageUrl: publicUrl,
      updatedAt: new Date().toISOString()
    });

    await logAudit(req.session.username!, "PRODUCT_IMAGE_UPLOADED", "Product", id, { imageUrl: publicUrl });

    res.json({ imageUrl: publicUrl });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;
