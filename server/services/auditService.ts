import { db } from "../firebase";

export async function logAudit(
  adminUsername: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, any> = {}
) {
  try {
    await db().collection("auditLogs").add({
      adminUsername,
      action,
      entityType,
      entityId,
      details,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}
