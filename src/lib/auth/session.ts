import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifyAdminSession, type AdminSessionPayload } from "@/lib/auth/jwt";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifyAdminSession(token);
  if (!session) return null;

  try {
    const [admin] = await db
      .select({ id: admins.id, username: admins.username, role: admins.role, passwordHash: admins.passwordHash })
      .from(admins)
      .where(eq(admins.id, session.adminId))
      .limit(1);

    if (!admin) return null;

    // Invalidate session across all devices if password was changed
    if (session.pvh && admin.passwordHash.slice(-8) !== session.pvh) {
      return null;
    }

    return {
      adminId: admin.id,
      username: admin.username,
      role: admin.role,
      pvh: session.pvh,
    };
  } catch (err) {
    console.error("[auth/session] Error verifying session against database:", err);
    return session;
  }
}
