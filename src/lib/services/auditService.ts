import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export async function logAudit(adminId: number | null, action: string, details?: Record<string, unknown>) {
  try {
    await db.insert(auditLogs).values({
      adminId,
      action,
      details: details ? (details as object) : null,
    });
  } catch (err) {
    console.error("[audit] failed to write audit log", err instanceof Error ? err.message : err);
  }
}
