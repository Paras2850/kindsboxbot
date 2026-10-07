import type { TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from "@/lib/telegram/types";
import { answerCallbackQuery, sendMessage } from "@/lib/telegram/client";
import { upsertTelegramUser, getUserByTelegramId } from "@/lib/services/userService";
import { isMaintenanceMode, isFreeMode } from "@/lib/services/settingsService";
import { isTelegramAdmin } from "@/lib/env";
import { handleAdminVideoMessage } from "@/lib/bot/adminUpload";
import {
  handleBuyPlan,
  handleCheckPayment,
  handleVideoRequest,
  sendHelp,
  sendMyAccount,
  sendPlans,
  sendStatus,
  sendSupport,
  sendWelcome,
} from "@/lib/bot/handlers";
import { BLOCKED_TEXT, MAINTENANCE_TEXT } from "@/lib/bot/texts";
import { checkRateLimit } from "@/lib/rateLimit";
import { displayName } from "@/lib/services/userService";
import { saveSupportMessage } from "@/lib/services/supportService";

export async function processUpdate(update: TelegramUpdate): Promise<void> {
  try {
    if (update.message) {
      await processMessage(update.message);
    } else if (update.callback_query) {
      await processCallbackQuery(update.callback_query);
    }
  } catch (err) {
    console.error("[bot] unhandled error while processing update", err instanceof Error ? err.message : err);
  }
}

async function processMessage(message: TelegramMessage): Promise<void> {
  const from = message.from;
  if (!from || from.is_bot) return;

  const chatId = message.chat.id;
  const isAdmin = isTelegramAdmin(from.id);

  const user = await upsertTelegramUser(from);

  if (user.isBlocked && !isAdmin) {
    await sendMessage(chatId, BLOCKED_TEXT);
    return;
  }

  if ((await isMaintenanceMode()) && !isAdmin) {
    await sendMessage(chatId, MAINTENANCE_TEXT);
    return;
  }

  // Admins can bulk-upload videos simply by sending them to the bot chat.
  if (isAdmin && (message.video || message.document)) {
    await handleAdminVideoMessage(message, displayName(user) + ` (${from.id})`);
    return;
  }

  const text = message.text?.trim();
  if (!text) return;

  const globalLimit = checkRateLimit(`msg:${from.id}`, 20, 10_000);
  if (!globalLimit.allowed) return;

  const [command] = text.split(/\s+/);

  switch (command.toLowerCase()) {
    case "/start":
      await sendWelcome(chatId);
      break;
    case "/help":
      await sendHelp(chatId);
      break;
    case "/video":
      await handleVideoRequest(chatId, user);
      break;
    case "/plan":
    case "/plans":
      await sendPlans(chatId);
      break;
    case "/status":
      await sendStatus(chatId, user);
      break;
    case "/myaccount":
    case "/account":
      await sendMyAccount(chatId, user);
      break;
    case "/support": {
      const rest = text.slice(command.length).trim();
      await sendSupport(chatId);
      if (rest) {
        await saveSupportMessage(user.id, rest);
        await sendMessage(chatId, "📨 Your message has been sent to our support team. We'll get back to you soon.");
      }
      break;
    }
    case "/chatid":
      if (isAdmin) {
        await sendMessage(chatId, `Chat ID: <code>${chatId}</code>`);
      }
      break;
    default:
      if (!isAdmin) {
        await sendMessage(chatId, "🤔 I didn't understand that. Use /help to see available commands.");
      }
  }
}

async function processCallbackQuery(cb: TelegramCallbackQuery): Promise<void> {
  const from = cb.from;
  const chatId = cb.message?.chat.id;
  if (!chatId || !cb.data) {
    await answerCallbackQuery(cb.id);
    return;
  }

  const isAdmin = isTelegramAdmin(from.id);
  let user = await getUserByTelegramId(from.id);
  if (!user) {
    user = await upsertTelegramUser(from);
  }

  if (user.isBlocked && !isAdmin) {
    await answerCallbackQuery(cb.id, "You are blocked from using this bot.", true);
    return;
  }

  if ((await isMaintenanceMode()) && !isAdmin) {
    await answerCallbackQuery(cb.id, "Bot is under maintenance. Please try again later.", true);
    return;
  }

  const [action, param] = cb.data.split(":");

  switch (action) {
    case "menu": {
      await answerCallbackQuery(cb.id);
      switch (param) {
        case "home":
          await sendWelcome(chatId);
          break;
        case "watch_video":
          await handleVideoRequest(chatId, user);
          break;
        case "buy_premium":
          await sendPlans(chatId);
          break;
        case "my_account":
          await sendMyAccount(chatId, user);
          break;
        case "sub_status":
          await sendStatus(chatId, user);
          break;
        case "help":
          await sendHelp(chatId);
          break;
      }
      break;
    }
    case "buy": {
      if (await isFreeMode()) {
        await answerCallbackQuery(cb.id, "🎉 Bot is currently FREE to use! You don't need to pay.", true);
        return;
      }
      const planId = Number(param);
      if (!Number.isFinite(planId)) {
        await answerCallbackQuery(cb.id, "Invalid plan.", true);
        return;
      }
      await handleBuyPlan(chatId, user, planId, cb.id);
      break;
    }
    case "check_payment": {
      const paymentId = Number(param);
      if (!Number.isFinite(paymentId)) {
        await answerCallbackQuery(cb.id, "Invalid payment.", true);
        return;
      }
      await handleCheckPayment(chatId, user, paymentId, cb.id);
      break;
    }
    case "video": {
      await answerCallbackQuery(cb.id);
      if (param === "next") {
        await handleVideoRequest(chatId, user);
      }
      break;
    }
    default:
      await answerCallbackQuery(cb.id);
  }
}
