import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processUpdate } from "@/lib/bot/router";
import type { TelegramUpdate } from "@/lib/telegram/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Verify the request really came from Telegram using the secret token we
  // configured when calling setWebhook.
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  if (env.telegramWebhookSecret && secretHeader !== env.telegramWebhookSecret) {
    return NextResponse.json({ ok: false, error: "invalid secret token" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  if (update.channel_post) {
    console.log(
      `[webhook] Received channel_post id=${update.channel_post.message_id} from chat=${update.channel_post.chat.id} has_video=${Boolean(update.channel_post.video)} has_doc=${Boolean(update.channel_post.document)}`,
    );
  }

  // Always respond quickly with 200 so Telegram doesn't retry; process inline
  try {
    await processUpdate(update);
  } catch (err) {
    console.error("[webhook] processing failed", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Telegram webhook endpoint. Use POST." });
}
