import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { sql } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import { signAdminSession, ADMIN_SESSION_COOKIE } from "@/lib/auth/jwt";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/services/auditService";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const rawIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  const ip = rawIp.split(",")[0].trim();

  const rate = checkRateLimit(`admin-login:${ip}`, 10, 5 * 60_000);
  if (!rate.allowed) {
    const retryMinutes = Math.ceil(rate.retryAfterMs / 60_000);
    console.warn(`[admin/login] Rate limit exceeded from IP ${ip}, retry after ${retryMinutes}m`);
    return NextResponse.json(
      { ok: false, error: `Too many login attempts. Please wait ${retryMinutes} minute(s) before trying again.` },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
      }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.warn(`[admin/login] Invalid request body format from IP ${ip}`);
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 400 });
  }

  const normalizedUsername = parsed.data.username.trim();

  try {
    // Perform case-insensitive username match on trimmed input to avoid capitalization/spacing errors
    const [admin] = await db
      .select()
      .from(admins)
      .where(sql`LOWER(${admins.username}) = LOWER(${normalizedUsername})`)
      .limit(1);

    if (!admin) {
      console.warn(
        `[admin/login] Failed login attempt from IP ${ip}: username not found (length=${normalizedUsername.length})`
      );
      await logAudit(null, "admin.login.failed", { reason: "user_not_found" });
      return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
    }

    const valid = await verifyPassword(parsed.data.password, admin.passwordHash);
    if (!valid) {
      console.warn(
        `[admin/login] Failed login attempt from IP ${ip}: password mismatch for admin_id=${admin.id}`
      );
      await logAudit(admin.id, "admin.login.failed", { reason: "password_mismatch" });
      return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
    }

    const token = await signAdminSession({ adminId: admin.id, username: admin.username, role: admin.role });

    const res = NextResponse.json({ ok: true, admin: { id: admin.id, username: admin.username, role: admin.role } });
    res.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    console.log(`[admin/login] Login successful from IP ${ip} for admin_id=${admin.id}`);
    await logAudit(admin.id, "admin.login.success", {});

    return res;
  } catch (err: any) {
    console.error("[admin/login] Database error:", err?.message || err);
    return NextResponse.json(
      { ok: false, error: "Database error: Cannot connect to PostgreSQL. Please check your database connection." },
      { status: 500 }
    );
  }
}
