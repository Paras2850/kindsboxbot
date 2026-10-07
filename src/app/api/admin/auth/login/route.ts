import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { eq } from "drizzle-orm";
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
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const rate = checkRateLimit(`admin-login:${ip}`, 10, 5 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json({ ok: false, error: "Too many login attempts. Try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 400 });
  }

  try {
    const [admin] = await db.select().from(admins).where(eq(admins.username, parsed.data.username)).limit(1);
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
    }

    const valid = await verifyPassword(parsed.data.password, admin.passwordHash);
    if (!valid) {
      await logAudit(null, "admin.login.failed", { username: parsed.data.username });
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

    await logAudit(admin.id, "admin.login.success", {});

    return res;
  } catch (err: any) {
    console.error("[admin/login] error:", err?.message || err);
    return NextResponse.json(
      { ok: false, error: "Database error: Cannot connect to PostgreSQL. Please check your database connection." },
      { status: 500 }
    );
  }
}
