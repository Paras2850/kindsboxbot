import { NextRequest, NextResponse } from "next/server";
import { getAllSettings, setSettings } from "@/lib/services/settingsService";
import { getAdminSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/services/auditService";
import { env, isBotConfigured, isRazorpayConfigured } from "@/lib/env";
import { getMe } from "@/lib/telegram/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getAllSettings(true);
  let botInfo = null;
  if (isBotConfigured()) {
    botInfo = await getMe();
  }
  return NextResponse.json({
    ok: true,
    settings,
    env: {
      botConfigured: isBotConfigured(),
      razorpayConfigured: isRazorpayConfigured(),
      webhookUrl: env.webhookUrl,
      supportUsername: env.supportUsername,
    },
    botInfo,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const allowedKeys = [
    "BOT_NAME",
    "SUPPORT_USERNAME",
    "WELCOME_MESSAGE",
    "EXPIRED_MESSAGE",
    "VIDEO_CAPTION_TEMPLATE",
    "MAINTENANCE_MODE",
    "REPEAT_MODE",
    "STORAGE_CHAT_ID",
    "NOTIFY_NEW_VIDEO",
    "FREE_MODE",
  ];

  const values: Record<string, string> = {};
  for (const key of allowedKeys) {
    if (key in body) values[key] = String(body[key]);
  }

  await setSettings(values);

  const session = await getAdminSession();
  await logAudit(session?.adminId ?? null, "settings.update", { keys: Object.keys(values) });

  return NextResponse.json({ ok: true });
}
