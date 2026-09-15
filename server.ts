import dotenv from "dotenv";
dotenv.config({ override: true });
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import session from "express-session";
import cookieParser from "cookie-parser";
import cors from "cors";
import "./server/types/session.d.ts";

import authRoutes from "./server/routes/auth";
import productRoutes from "./server/routes/products";
import paymentMethodRoutes from "./server/routes/paymentMethods";
import orderRoutes from "./server/routes/orders";
import dashboardRoutes from "./server/routes/dashboard";
import envDumpRoute from "./server/routes/env_dump";
import customerRoutes from "./server/routes/customers";
import conversationRoutes from "./server/routes/conversations";
import settingsRoutes from "./server/routes/settings";
import telegramRoutes from "./server/routes/telegram";
import webhookRoutes from "./server/routes/webhooks";
import connectorRoutes from "./server/routes/connectors";
import connectorStatusRoutes from "./server/routes/connectors-status";
import firebaseStatusRoutes from "./server/routes/firebaseStatus";
import { initFirebaseAdmin } from "./server/firebase";
import { replyAllUnrepliedMessages } from "./server/services/salesAgent";
import { syncMetaConversations, subscribePageToWebhooks } from "./server/services/metaService";
import { initTelegramService } from "./server/services/telegramService";
import { syncSecrets } from "./server/syncSecrets";
import { runStartupSelfCheck } from "./server/services/metaCredentialService";

import diagnosticRoutes from "./server/routes/diagnostic";

async function startServer() {
  // Initialize Firebase Admin before handling requests
  initFirebaseAdmin();
  await syncSecrets();
  await initTelegramService();
  await runStartupSelfCheck();

  const app = express();
  const PORT = 3000;

  app.set("trust proxy", true);

  // Middleware
  app.use(express.json({ verify: (req, res, buf) => { (req as any).rawBody = buf; } }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  
  app.use(cors());

  // Session configuration
  const isSecureEnv = process.env.NODE_ENV === "production" || !!process.env.K_SERVICE || !!process.env.APP_URL;

  // In Cloud Run / container reverse proxy, ensure forwarded proto is detected as https
  app.use((req, res, next) => {
    if (isSecureEnv) {
      req.headers["x-forwarded-proto"] = "https";
    }
    next();
  });

  app.use(
    session({
      proxy: true,
      secret: process.env.SESSION_SECRET || "fallback_dev_secret_please_change",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: isSecureEnv ? true : false,
        httpOnly: true,
        sameSite: isSecureEnv ? "none" : "lax",
        partitioned: isSecureEnv ? true : false,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    })
  );

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", environment: process.env.NODE_ENV, secure: req.secure, protocol: req.protocol, ips: req.ips });
  });

  // Serve uploaded images statically
  app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

  app.use("/api/auth", authRoutes);
  app.use("/api/admin/products", productRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/admin/payment-methods", paymentMethodRoutes);
  app.use("/api/payment-methods", paymentMethodRoutes);
  app.use("/api/admin/orders", orderRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/admin/dashboard", dashboardRoutes);
  app.use("/api/admin/customers", customerRoutes);
  app.use("/api/admin/conversations", conversationRoutes);
  app.use("/api/admin/settings", settingsRoutes);
  app.use("/api/admin/connectors", connectorRoutes);
  app.use("/api/admin/connectors", connectorStatusRoutes);
  app.use("/api/admin/firebase", firebaseStatusRoutes);
  app.use("/api/admin/telegram", telegramRoutes);
  app.use("/api/webhooks", webhookRoutes);
  app.use("/api/webhook", webhookRoutes);
  app.use("/api/diagnostic", diagnosticRoutes);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);

    // Subscribes Page to webhooks for real-time Instagram and Messenger messages
    subscribePageToWebhooks().catch(() => {});

    // --- PROACTIVE AUTOMATED MESSAGE REPLY & SYNC ---
    // 1. Run an immediate initial sync & unreplied messages pass on startup
    setTimeout(async () => {
      console.log("[STARTUP] Running initial Meta sync & unreplied messages check...");
      try {
        await subscribePageToWebhooks().catch(() => {});
        await syncMetaConversations("messenger").catch((e: any) => console.warn("[STARTUP] Sync messenger notice:", e.message));
        await syncMetaConversations("instagram").catch((e: any) => console.warn("[STARTUP] Sync instagram notice:", e.message));
        const res: any = await replyAllUnrepliedMessages("all").catch((e: any) => console.warn("[STARTUP] Auto-reply notice:", e.message));
        console.log(`[STARTUP] Initial auto-reply complete: ${res?.repliedCount || 0} messages replied.`);
      } catch (e: any) {
        console.error("[STARTUP] Initial auto-reply run notice:", e.message);
      }
    }, 3000);

    // 2. Continuous automated cron cycle every 5 minutes
    console.log("[CRON] Scheduled background batch reply every 5 minutes");
    setInterval(async () => {
      console.log("[CRON] Running 5-minute sync and unreplied messages check...");
      try {
        await subscribePageToWebhooks().catch(() => {});
        await syncMetaConversations("messenger").catch((e: any) => console.warn("[CRON] Sync messenger notice:", e.message));
        await syncMetaConversations("instagram").catch((e: any) => console.warn("[CRON] Sync instagram notice:", e.message));
        const res: any = await replyAllUnrepliedMessages("all").catch((e: any) => console.warn("[CRON] Auto-reply notice:", e.message));
        console.log(`[CRON] Batch check complete: ${res?.repliedCount || 0} messages replied.`);
      } catch(e) {
        console.error("[CRON] Batch check failed:", e);
      }
    }, 5 * 60 * 1000);
    // ------------------------------------------------
    // ARCHITECTURAL MANDATE:
    // Meta Messenger is the authoritative source of incoming customer messages.
    // Incoming messages are triggered EXCLUSIVELY via real-time Meta Webhooks.
    // Firestore is used solely as a persistence and context layer after delivery.
    // NO polling loops or interval background checks exist here.
  });

}

startServer();
