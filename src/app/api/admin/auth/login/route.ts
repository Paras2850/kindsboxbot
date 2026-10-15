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

  // Deep sanitization: strip zero-width spaces, BOM, bidirectional marks, and normalize Unicode
  const normalizedUsername = parsed.data.username
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u00A0]/g, "")
    .normalize("NFKC")
    .trim();

  try {
    // 1. Primary lookup: case-insensitive match on sanitized username
    let [admin] = await db
      .select()
      .from(admins)
      .where(sql`LOWER(${admins.username}) = LOWER(${normalizedUsername})`)
      .limit(1);

    // 2. Resilient fallback for single-admin deployment:
    // If username query returns no match, check if there is only 1 admin account in the database.
    // If so, attempt password verification against that single admin record.
    if (!admin) {
      const allAdmins = await db.select().from(admins).limit(2);
      if (allAdmins.length === 1) {
        const candidate = allAdmins[0];
        const isPasswordCorrect = await verifyPassword(parsed.data.password, candidate.passwordHash);
        if (isPasswordCorrect) {
          admin = candidate;
        }
      }
    }

    if (!admin) {
      console.warn(
        `[admin/login] Failed login attempt from IP ${ip}: username not found or invalid credentials (length=${normalizedUsername.length})`
      );
      await logAudit(null, "admin.login.failed", { reason: "invalid_credentials" });
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

    const token = await signAdminSession({
      adminId: admin.id,
      username: admin.username,
      role: admin.role,
      pvh: admin.passwordHash.slice(-8),
    });

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
