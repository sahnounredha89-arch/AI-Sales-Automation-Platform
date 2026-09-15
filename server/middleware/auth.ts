import { Request, Response, NextFunction } from "express";
import { verifyAdminToken, getAuthSecret } from "../routes/auth";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session && req.session.isAuthenticated) {
    return next();
  }

  // Fallback to Bearer token or X-Admin-Token header (for environments where cookies are blocked)
  const authHeader = req.headers.authorization || (req.headers["x-admin-token"] as string);
  if (authHeader) {
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    const secret = getAuthSecret();
    const verified = verifyAdminToken(token, secret);
    if (verified) {
      if (req.session) {
        req.session.isAuthenticated = true;
      }
      return next();
    }
  }

  return res.status(401).json({ error: "Unauthorized" });
}
