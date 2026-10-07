import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { admins, plans } from "@/db/schema";
import { count } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { DEFAULT_PLANS } from "@/lib/services/planService";
import { setSettings, SETTINGS_DEFAULTS } from "@/lib/services/settingsService";
import { env } from "@/lib/env";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(128),
});

export async function GET() {
  try {
    const [{ c }] = await db.select({ c: count() }).from(admins);
    return NextResponse.json({ ok: true, needsSetup: c === 0 });
  } catch (err: any) {
    console.error("[api/setup] Database connection error:", err?.message || err);
    return NextResponse.json({
      ok: false,
      needsSetup: false,
      dbError: true,
      error: "Cannot connect to PostgreSQL. Please check DATABASE_URL in .env and run 'npm run db:migrate'.",
    });
  }
}

export async function POST(req: NextRequest) {
  const setupSecret = req.headers.get("x-setup-secret");
  if (!env.setupSecret || setupSecret !== env.setupSecret) {
    return NextResponse.json({ ok: false, error: "Invalid setup secret" }, { status: 401 });
  }

  const [{ c }] = await db.select({ c: count() }).from(admins);
  if (c > 0) {
    return NextResponse.json({ ok: false, error: "Setup already completed" }, { status: 409 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid username/password" }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.insert(admins).values({ username: parsed.data.username, passwordHash, role: "owner" });

  const [{ c: planCount }] = await db.select({ c: count() }).from(plans);
  if (planCount === 0) {
    await db.insert(plans).values(DEFAULT_PLANS);
  }

  await setSettings({ ...SETTINGS_DEFAULTS, SUPPORT_USERNAME: env.supportUsername || SETTINGS_DEFAULTS.SUPPORT_USERNAME });

  return NextResponse.json({ ok: true });
}
