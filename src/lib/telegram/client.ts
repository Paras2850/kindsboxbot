import { env, isBotConfigured } from "@/lib/env";

const API_BASE = "https://api.telegram.org";

export type InlineKeyboardButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };

export type InlineKeyboardMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

type TelegramResult<T> = { ok: true; result: T } | { ok: false; description: string; error_code?: number };

async function callApi<T = unknown>(method: string, payload: Record<string, unknown> = {}): Promise<T | null> {
  if (!isBotConfigured()) {
    console.warn(`[telegram] BOT_TOKEN is not configured, skipping ${method}`);
    return null;
  }
  try {
    const res = await fetch(`${API_BASE}/bot${env.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await res.json()) as TelegramResult<T>;
    if (!data.ok) {
      console.error(`[telegram] ${method} failed: ${data.description}`);
      return null;
    }
    return data.result;
  } catch (err) {
    console.error(`[telegram] ${method} threw`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function callApiMultipart<T = unknown>(method: string, form: FormData): Promise<T | null> {
  if (!isBotConfigured()) {
    throw new Error("BOT_TOKEN is not configured in .env");
  }
  try {
    const res = await fetch(`${API_BASE}/bot${env.botToken}/${method}`, {
      method: "POST",
      body: form,
    });
    const data = (await res.json().catch(() => null)) as TelegramResult<T> | null;
    if (!data) {
      throw new Error(`Telegram HTTP ${res.status}: ${res.statusText || "Failed response"}`);
    }
    if (!data.ok) {
      console.error(`[telegram] ${method} failed: ${data.description}`);
      throw new Error(data.description || "Telegram API request failed");
    }
    return data.result;
  } catch (err) {
    console.error(`[telegram] ${method} threw`, err instanceof Error ? err.message : err);
    throw err;
  }
}

export interface SendMessageOptions {
  reply_markup?: InlineKeyboardMarkup;
  parse_mode?: "HTML" | "Markdown";
  disable_web_page_preview?: boolean;
}

export async function sendMessage(chatId: number | string, text: string, options: SendMessageOptions = {}) {
  return callApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options.parse_mode ?? "HTML",
    disable_web_page_preview: options.disable_web_page_preview ?? true,
    reply_markup: options.reply_markup,
  });
}

export interface VideoResult {
  message_id: number;
  video?: { file_id: string; file_unique_id: string; duration?: number; file_size?: number };
}

export async function sendVideoByFileId(
  chatId: number | string,
  fileId: string,
  caption?: string,
  options: SendMessageOptions = {},
) {
  return callApi<VideoResult>("sendVideo", {
    chat_id: chatId,
    video: fileId,
    caption,
    parse_mode: options.parse_mode ?? "HTML",
    reply_markup: options.reply_markup,
  });
}

export async function sendVideoFile(
  chatId: number | string,
  file: Blob,
  filename: string,
  caption?: string,
): Promise<VideoResult | null> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("video", file, filename);
  form.append("supports_streaming", "true");
  if (caption) form.append("caption", caption);
  return callApiMultipart<VideoResult>("sendVideo", form);
}

export async function sendChatAction(
  chatId: number | string,
  action: "upload_video" | "typing" | "choose_sticker" = "upload_video",
) {
  return callApi("sendChatAction", {
    chat_id: chatId,
    action,
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
  return callApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

export async function setWebhook(url: string, secretToken: string) {
  return callApi("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
}

export async function deleteWebhook() {
  return callApi("deleteWebhook", {});
}

export async function deleteMessage(chatId: number | string, messageId: number) {
  return callApi("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });
}

export async function getWebhookInfo() {
  return callApi("getWebhookInfo", {});
}

export async function getMe() {
  return callApi("getMe", {});
}

export async function getUpdates(offset?: number, limit = 100, timeout = 30) {
  return callApi<Array<any>>("getUpdates", {
    offset,
    limit,
    timeout,
    allowed_updates: ["message", "callback_query"],
  });
}

export async function editMessageReplyMarkup(
  chatId: number | string,
  messageId: number,
  replyMarkup?: InlineKeyboardMarkup,
) {
  return callApi("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}
