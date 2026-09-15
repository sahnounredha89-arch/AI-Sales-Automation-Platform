import { getAuth } from "firebase-admin/auth";
import { initFirebaseAdmin } from "../firebase.js";
import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

export const getEnvVars = () => {
  let envConfig: any = {};
  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), '.env'));
    envConfig = dotenv.parse(envFile);
  } catch (e) {}
    
  return {
    // If .env is present, use it to OVERRIDE the AI Studio Secrets (process.env)
    ADMIN_USERNAME: envConfig.ADMIN_USERNAME || process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD: envConfig.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD,
    SESSION_SECRET: envConfig.SESSION_SECRET || process.env.SESSION_SECRET || "fallback_dev_secret_please_change"
  };
};

export const getAuthSecret = (): string => {
  const envVars = getEnvVars();
  return envVars.SESSION_SECRET || "fallback_dev_secret_please_change";
};

export function createAdminToken(username: string, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({ user: username, exp: Date.now() + 24 * 60 * 60 * 1000 })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyAdminToken(token: string, secret: string): { user: string; exp: number } | null {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    if (sig !== expectedSig) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const envVars = getEnvVars();

    let envUser = envVars.ADMIN_USERNAME;
    let envPass = envVars.ADMIN_PASSWORD;

    if (!envUser || !envPass) {
      return res.status(500).json({ error: "AUTH_NOT_CONFIGURED" });
    }

    if (envUser.startsWith('"') && envUser.endsWith('"')) envUser = envUser.slice(1, -1);
    if (envPass.startsWith('"') && envPass.endsWith('"')) envPass = envPass.slice(1, -1);
    envUser = envUser.trim();

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    if (username !== envUser) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
        
    let isMatch = false;
    if (envPass.startsWith("$2a$") || envPass.startsWith("$2b$")) {
      isMatch = await bcrypt.compare(password, envPass);
    } else {
      isMatch = (password === envPass || password === envPass.trim());
    }
        
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!req.session) {
       return res.status(500).json({ error: "Session middleware not configured" });
    }

    req.session.isAuthenticated = true;

    const secret = getAuthSecret();
    const token = createAdminToken(username, secret);

    req.session.save(async (err) => {
      if (err) {
         return res.status(500).json({ error: "Could not save session" });
      }
      
      // Create Firebase Custom Token
      let firebaseCustomToken = null;
      try {
        const app = initFirebaseAdmin();
        if (app) {
          const targetEmail = 'sahnounredha89@gmail.com';
          firebaseCustomToken = await getAuth(app).createCustomToken(username, { admin: true, email: targetEmail });
        }
      } catch(e) { console.error("Firebase custom token error:", e); }
      
      res.json({ success: true, token, firebaseCustomToken });
  
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/logout", (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  } else {
    res.json({ success: true });
  }
});

router.get("/me", async (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    
      let firebaseCustomToken = null;
      try {
        const app = initFirebaseAdmin();
        if (app) {
          const envUser = getEnvVars().ADMIN_USERNAME || "admin";
          let cleanUser = envUser;
          if (cleanUser.startsWith('"')) cleanUser = cleanUser.slice(1, -1);
          const targetEmail = 'sahnounredha89@gmail.com';
          firebaseCustomToken = await getAuth(app).createCustomToken(cleanUser.trim(), { admin: true, email: targetEmail });
        }
      } catch(e) {}
      return res.json({ authenticated: true, firebaseCustomToken });
  
  } 

  const authHeader = req.headers.authorization || (req.headers["x-admin-token"] as string);
  if (authHeader) {
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    const secret = getAuthSecret();
    const verified = verifyAdminToken(token, secret);
    if (verified) {
      if (req.session) {
        req.session.isAuthenticated = true;
      }
      
      let firebaseCustomToken = null;
      try {
        const app = initFirebaseAdmin();
        if (app) {
          const envUser = getEnvVars().ADMIN_USERNAME || "admin";
          let cleanUser = envUser;
          if (cleanUser.startsWith('"')) cleanUser = cleanUser.slice(1, -1);
          const targetEmail = 'sahnounredha89@gmail.com';
          firebaseCustomToken = await getAuth(app).createCustomToken(cleanUser.trim(), { admin: true, email: targetEmail });
        }
      } catch(e) {}
      return res.json({ authenticated: true, firebaseCustomToken });
  
    }
  }

  res.json({ authenticated: false });
});

export default router;
