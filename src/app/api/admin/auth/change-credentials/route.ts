import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { getAdminSession } from "@/lib/auth/session";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { ADMIN_SESSION_COOKIE, signAdminSession } from "@/lib/auth/jwt";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/services/auditService";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newUsername: z.string().trim().optional(),
  newPassword: z.string().optional(),
  confirmNewPassword: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const rate = checkRateLimit(`change-credentials:${session.adminId}:${ip}`, 5, 5 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please try again in 5 minutes." },
      { status: 429 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message || "Invalid input data" },
      { status: 400 }
    );
  }

  try {
    const [admin] = await db
      .select()
      .from(admins)
      .where(eq(admins.id, session.adminId))
      .limit(1);

    if (!admin) {
      return NextResponse.json({ ok: false, error: "Admin account not found" }, { status: 404 });
    }

    const validPassword = await verifyPassword(parsed.data.currentPassword, admin.passwordHash);
    if (!validPassword) {
      await logAudit(session.adminId, "admin.credentials.failed", { reason: "incorrect_current_password" });
      return NextResponse.json({ ok: false, error: "Current password is incorrect." }, { status: 400 });
    }

    const rawUsername = parsed.data.newUsername?.trim();
    const rawPassword = parsed.data.newPassword;
    const rawConfirm = parsed.data.confirmNewPassword;

    const wantsUsernameChange = Boolean(rawUsername && rawUsername !== admin.username);
    const wantsPasswordChange = Boolean(rawPassword && rawPassword.length > 0);

    if (!wantsUsernameChange && !wantsPasswordChange) {
      return NextResponse.json(
        { ok: false, error: "No changes detected. Please provide a new username or new password." },
        { status: 400 }
      );
    }

    // Validate new username
    if (wantsUsernameChange && rawUsername) {
      if (rawUsername.length < 3 || rawUsername.length > 64) {
        return NextResponse.json(
          { ok: false, error: "Username must be between 3 and 64 characters." },
          { status: 400 }
        );
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(rawUsername)) {
        return NextResponse.json(
          { ok: false, error: "Username may only contain letters, numbers, underscores, and dashes." },
          { status: 400 }
        );
      }
      const [existingUser] = await db
        .select({ id: admins.id })
        .from(admins)
        .where(and(eq(admins.username, rawUsername), ne(admins.id, admin.id)))
        .limit(1);

      if (existingUser) {
        return NextResponse.json(
          { ok: false, error: "Username is already taken by another administrator." },
          { status: 400 }
        );
      }
    }

    // Validate new password
    if (wantsPasswordChange && rawPassword) {
      if (rawPassword.length < 12) {
        return NextResponse.json(
          { ok: false, error: "New password must be at least 12 characters long." },
          { status: 400 }
        );
      }
      if (rawPassword !== rawConfirm) {
        return NextResponse.json(
          { ok: false, error: "New password and confirmation do not match." },
          { status: 400 }
        );
      }
      if (rawPassword === parsed.data.currentPassword) {
        return NextResponse.json(
          { ok: false, error: "New password must be different from your current password." },
          { status: 400 }
        );
      }
      const hasLetters = /[a-zA-Z]/.test(rawPassword);
      const hasNumbersOrSymbols = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(rawPassword);
      if (!hasLetters || !hasNumbersOrSymbols) {
        return NextResponse.json(
          { ok: false, error: "Password must contain both letters and numbers or symbols." },
          { status: 400 }
        );
      }
      const weakPatterns = [
        "password1234",
        "password12345",
        "123456789012",
        "admin12345678",
        "administrator1",
      ];
      if (weakPatterns.includes(rawPassword.toLowerCase())) {
        return NextResponse.json(
          { ok: false, error: "Password is too common or weak. Please choose a stronger password." },
          { status: 400 }
        );
      }
    }

    // Apply updates
    const updates: { username?: string; passwordHash?: string } = {};
    if (wantsUsernameChange && rawUsername) {
      updates.username = rawUsername;
    }
    if (wantsPasswordChange && rawPassword) {
      updates.passwordHash = await hashPassword(rawPassword);
    }

    await db.update(admins).set(updates).where(eq(admins.id, admin.id));

    await logAudit(admin.id, "admin.credentials.updated", {
      usernameChanged: wantsUsernameChange,
      passwordChanged: wantsPasswordChange,
    });

    if (wantsPasswordChange) {
      // Invalidate existing session cookie and require re-login
      const res = NextResponse.json({
        ok: true,
        reloginRequired: true,
        message: "Credentials updated successfully. Please log in with your new password.",
      });
      res.cookies.set(ADMIN_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    } else {
      // Refresh session cookie with the new username
      const updatedUsername = rawUsername || admin.username;
      const token = await signAdminSession({
        adminId: admin.id,
        username: updatedUsername,
        role: admin.role,
      });
      const res = NextResponse.json({
        ok: true,
        reloginRequired: false,
        message: "Username updated successfully.",
        admin: { id: admin.id, username: updatedUsername, role: admin.role },
      });
      res.cookies.set(ADMIN_SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
      return res;
    }
  } catch (err: any) {
    console.error("[change-credentials] error:", err?.message || err);
    return NextResponse.json(
      { ok: false, error: "Failed to update admin credentials. Please try again later." },
      { status: 500 }
    );
  }
}

