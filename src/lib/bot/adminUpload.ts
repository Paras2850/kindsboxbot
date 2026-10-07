import { sendMessage } from "@/lib/telegram/client";
import { createVideo } from "@/lib/services/videoService";
import { scheduleNewVideoNotification } from "@/lib/services/notificationService";
import type { TelegramDocument, TelegramMessage, TelegramVideo } from "@/lib/telegram/types";

const VIDEO_MIME_PREFIXES = ["video/"];

function isVideoDocument(doc: TelegramDocument): boolean {
  if (!doc.mime_type) return false;
  return VIDEO_MIME_PREFIXES.some((p) => doc.mime_type!.startsWith(p));
}

/**
 * Handles a video (or video-as-document, e.g. .mov) sent directly by an
 * admin in the bot chat. This is how bulk uploads work: the admin forwards
 * or sends many videos one after another and each one is stored with its
 * Telegram file_id automatically - no re-uploading or manual renaming.
 */
export async function handleAdminVideoMessage(message: TelegramMessage, adminLabel: string): Promise<void> {
  const chatId = message.chat.id;
  let media: TelegramVideo | TelegramDocument | undefined = message.video;
  if (!media && message.document && isVideoDocument(message.document)) {
    media = message.document;
  }

  if (!media) {
    await sendMessage(chatId, "⚠️ Unsupported file. Please send an MP4/MOV video file.");
    return;
  }

  try {
    const video = await createVideo({
      telegramFileId: media.file_id,
      fileUniqueId: media.file_unique_id,
      caption: message.caption ?? null,
      fileSize: media.file_size ?? null,
      durationSeconds: "duration" in media ? media.duration ?? null : null,
      addedBy: adminLabel,
    });

    await sendMessage(
      chatId,
      `✅ Video saved.\n\n#️⃣ ID: ${video.id}\n🔢 Sequence: ${video.sequence}\n📝 Caption: ${video.caption || "(none)"}`,
    );

    scheduleNewVideoNotification();
  } catch (err) {
    console.error("[admin-upload] failed to store video", err instanceof Error ? err.message : err);
    await sendMessage(chatId, "❌ Failed to save this video. Please try again.");
  }
}
