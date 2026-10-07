import { NextRequest, NextResponse } from "next/server";
import { sendVideoFile, deleteMessage } from "@/lib/telegram/client";
import { createVideo } from "@/lib/services/videoService";
import { getSetting } from "@/lib/services/settingsService";
import { isBotConfigured, env } from "@/lib/env";
import { scheduleNewVideoNotification } from "@/lib/services/notificationService";
import { getAdminSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/services/auditService";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface UploadResult {
  fileName: string;
  success: boolean;
  videoId?: number;
  error?: string;
}

export async function POST(req: NextRequest) {
  if (!isBotConfigured()) {
    return NextResponse.json(
      { ok: false, error: "BOT_TOKEN is not configured. Set it in your environment before uploading videos." },
      { status: 400 },
    );
  }

  let storageChatId = await getSetting("STORAGE_CHAT_ID");
  if (!storageChatId && env.adminTelegramIds.length > 0) {
    storageChatId = String(env.adminTelegramIds[0]);
  }

  if (!storageChatId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "STORAGE_CHAT_ID is not configured. Go to Settings (http://localhost:3000/admin/settings) and enter your Telegram numeric ID or channel ID.",
      },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const caption = form.get("caption")?.toString() ?? "";

  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "No files provided" }, { status: 400 });
  }

  const session = await getAdminSession();
  const results: UploadResult[] = [];

  for (const file of files) {
    try {
      if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v)$/i.test(file.name)) {
        results.push({ fileName: file.name, success: false, error: "Unsupported file type" });
        continue;
      }

      const sent = await sendVideoFile(storageChatId, file, file.name, caption || undefined);
      if (!sent || !sent.video?.file_id) {
        results.push({ fileName: file.name, success: false, error: "Telegram did not return a valid video file_id" });
        continue;
      }

      // If storage chat is a private user chat rather than a channel, immediately delete the raw upload
      // message so it never appears or spams the user's bot chat!
      if (!String(storageChatId).startsWith("-100") && sent.message_id) {
        await deleteMessage(storageChatId, sent.message_id).catch(() => {});
      }

      const video = await createVideo({
        telegramFileId: sent.video.file_id,
        fileUniqueId: sent.video.file_unique_id,
        caption: caption || null,
        fileSize: sent.video.file_size ?? file.size,
        durationSeconds: sent.video.duration ?? null,
        addedBy: session ? `admin:${session.username}` : "admin-panel",
      });

      results.push({ fileName: file.name, success: true, videoId: video.id });
    } catch (err) {
      let errMsg = err instanceof Error ? err.message : "Upload error";
      if (errMsg.toLowerCase().includes("chat not found")) {
        errMsg = `Telegram Error: Chat not found for Storage ID (${storageChatId}). Make sure this user or channel has opened @${env.botToken ? "Kindsboxbot" : "the bot"} and sent /start.`;
      } else if (errMsg.toLowerCase().includes("request entity too large") || errMsg.toLowerCase().includes("file is too big")) {
        errMsg = "Telegram Error: File is too large. Telegram Bot API allows max 50MB per file upload.";
      }
      results.push({ fileName: file.name, success: false, error: errMsg });
    }
  }

  const uploaded = results.filter((r) => r.success).length;
  const failed = results.length - uploaded;

  if (uploaded > 0) {
    scheduleNewVideoNotification();
    await logAudit(session?.adminId ?? null, "videos.bulk_upload", { uploaded, failed });
  }

  return NextResponse.json({ ok: true, uploaded, failed, results });
}
