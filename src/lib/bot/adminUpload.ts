import { sendMessage } from "@/lib/telegram/client";
import { createVideo } from "@/lib/services/videoService";
import { getSetting } from "@/lib/services/settingsService";
import { scheduleNewVideoNotification } from "@/lib/services/notificationService";
import type { TelegramDocument, TelegramMessage, TelegramVideo } from "@/lib/telegram/types";

const VIDEO_MIME_PREFIXES = ["video/"];

function isVideoDocument(doc: TelegramDocument): boolean {
  if (doc.mime_type && VIDEO_MIME_PREFIXES.some((p) => doc.mime_type!.startsWith(p))) {
    return true;
  }
  if (doc.file_name && /\.(mp4|mov|m4v|mkv|webm|avi|flv)$/i.test(doc.file_name)) {
    return true;
  }
  return false;
}

/**
 * Handles a video (or video-as-document, e.g. .mov) sent directly by an
 * admin in the bot chat.
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

    const notify = (await getSetting("NOTIFY_NEW_VIDEO")) === "true";
    if (notify) {
      scheduleNewVideoNotification();
    }
  } catch (err) {
    console.error("[admin-upload] failed to store video", err instanceof Error ? err.message : err);
    await sendMessage(chatId, "❌ Failed to save this video. Please try again.");
  }
}

/**
 * Automatically imports videos posted into the configured private Telegram storage channel.
 */
export async function handleChannelPost(message: TelegramMessage): Promise<void> {
  const chat = message.chat;
  const chatId = chat.id;
  const configuredStorageId = ((await getSetting("STORAGE_CHAT_ID")) || process.env.STORAGE_CHAT_ID || "").trim();

  console.log(`[channel_post] Received post id=${message.message_id} from chat_id=${chatId} title="${chat.title || ""}"`);

  // Verify chat ID if STORAGE_CHAT_ID is configured
  if (configuredStorageId.length > 0) {
    const chatIdStr = String(chatId);
    let matches = false;

    // Direct match (e.g. -1001234567890)
    if (chatIdStr === configuredStorageId) {
      matches = true;
    }
    // Match stripped prefix (e.g. 1234567890 vs -1001234567890)
    else if (chatIdStr.replace(/^-100/, "") === configuredStorageId.replace(/^-100/, "")) {
      matches = true;
    }
    // Match username if channel has a username and user configured @handle
    else if (chat.username && chat.username.toLowerCase() === configuredStorageId.replace(/^@/, "").toLowerCase()) {
      matches = true;
    }

    if (!matches) {
      console.log(
        `[channel_post] ⚠️ Ignored post: chat_id "${chatId}" does not match configured STORAGE_CHAT_ID "${configuredStorageId}"`,
      );
      return;
    }
  } else {
    console.warn(
      `[channel_post] ⚠️ STORAGE_CHAT_ID is not configured in Admin Settings or env! Auto-importing from channel ${chatId}. Tip: Set STORAGE_CHAT_ID="${chatId}" in Settings to restrict imports.`,
    );
  }

  let media: TelegramVideo | TelegramDocument | undefined = message.video;
  if (!media && message.document && isVideoDocument(message.document)) {
    media = message.document;
  }

  if (!media) {
    console.log(`[channel_post] Ignored post id=${message.message_id}: no video or supported video document attached`);
    return;
  }

  try {
    const video = await createVideo({
      telegramFileId: media.file_id,
      fileUniqueId: media.file_unique_id,
      caption: message.caption ?? null,
      fileSize: media.file_size ?? null,
      durationSeconds: "duration" in media ? media.duration ?? null : null,
      addedBy: `channel:${chat.title || chatId} (${message.message_id})`,
    });

    console.log(
      `[channel_post] ✅ Auto-imported video id=${video.id} seq=${video.sequence} from channel=${chatId} (file_unique_id=${media.file_unique_id})`,
    );

    const notify = (await getSetting("NOTIFY_NEW_VIDEO")) === "true";
    if (notify) {
      scheduleNewVideoNotification();
    }
  } catch (err) {
    console.error("[channel_post] ❌ Failed to store channel video", err instanceof Error ? err.message : err);
  }
}
