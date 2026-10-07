import { NextResponse } from "next/server";
import { env, isBotConfigured } from "@/lib/env";
import { getWebhookInfo, setWebhook } from "@/lib/telegram/client";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isBotConfigured()) {
    return NextResponse.json({ ok: false, error: "BOT_TOKEN not configured" }, { status: 400 });
  }
  const info = await getWebhookInfo();
  return NextResponse.json({ ok: true, info });
}

export async function POST() {
  if (!isBotConfigured()) {
    return NextResponse.json({ ok: false, error: "BOT_TOKEN not configured" }, { status: 400 });
  }
  if (!env.webhookUrl) {
    return NextResponse.json({ ok: false, error: "WEBHOOK_URL not configured" }, { status: 400 });
  }
  const result = await setWebhook(`${env.webhookUrl}/api/telegram/webhook`, env.telegramWebhookSecret);
  return NextResponse.json({ ok: Boolean(result), result });
}
