import { answerCallbackQuery, sendMessage, sendVideoByFileId, sendChatAction } from "@/lib/telegram/client";
import {
  mainMenuKeyboard,
  plansKeyboard,
  payNowKeyboard,
  backToMenuKeyboard,
  videoPlaybackKeyboard,
} from "@/lib/telegram/keyboards";
import { getActivePlans, getPlanById } from "@/lib/services/planService";
import { getCurrentSubscription } from "@/lib/services/subscriptionService";
import { countDeliveredToUser, getNextVideoForUser, recordDelivery } from "@/lib/services/videoService";
import { createPaymentForPlan, pollAndFinalizePayment, getPaymentById, PaymentError } from "@/lib/services/paymentService";
import { getSetting, isFreeMode } from "@/lib/services/settingsService";
import type { User } from "@/lib/services/userService";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { eq, sum } from "drizzle-orm";
import {
  accountText,
  helpText,
  paymentInstructionsText,
  paymentSuccessText,
  statusText,
  supportText,
  WATCHED_ALL_TEXT,
} from "@/lib/bot/texts";
import { checkRateLimit } from "@/lib/rateLimit";

export async function sendWelcome(chatId: number) {
  const isFree = await isFreeMode();
  let welcome = await getSetting("WELCOME_MESSAGE");
  if (isFree) {
    welcome += "\n\n🎁 <b>Status:</b> FREE MODE ON (Enjoy all videos for free!)";
  }
  await sendMessage(chatId, welcome, { reply_markup: mainMenuKeyboard(isFree) });
}

export async function sendHelp(chatId: number) {
  const botName = await getSetting("BOT_NAME");
  const support = await getSetting("SUPPORT_USERNAME");
  await sendMessage(chatId, helpText(botName, support), { reply_markup: backToMenuKeyboard() });
}

export async function sendSupport(chatId: number) {
  const support = await getSetting("SUPPORT_USERNAME");
  await sendMessage(chatId, supportText(support), { reply_markup: backToMenuKeyboard() });
}

export async function sendPlans(chatId: number, headerOverride?: string) {
  const isFree = await isFreeMode();
  if (isFree) {
    await sendMessage(
      chatId,
      "🎉 <b>Bot is currently FREE to use!</b>\n\nAll premium videos are completely free to watch right now. You don't need any subscription!\n\nUse /video to start watching.",
      { reply_markup: backToMenuKeyboard() },
    );
    return;
  }
  const plans = await getActivePlans();
  if (plans.length === 0) {
    await sendMessage(chatId, "No subscription plans are available right now. Please check back soon.");
    return;
  }
  const header =
    headerOverride ??
    "💎 <b>PREMIUM ACCESS</b>\n\nChoose your plan:";
  await sendMessage(chatId, header, { reply_markup: plansKeyboard(plans) });
}

export async function sendStatus(chatId: number, user: User) {
  const isFree = await isFreeMode();
  const sub = await getCurrentSubscription(user.id);
  const watched = await countDeliveredToUser(user.id);
  await sendMessage(chatId, statusText(user, sub, watched, isFree), { reply_markup: backToMenuKeyboard() });
}

export async function sendMyAccount(chatId: number, user: User) {
  const isFree = await isFreeMode();
  const sub = await getCurrentSubscription(user.id);
  const watched = await countDeliveredToUser(user.id);
  const [row] = await db
    .select({ total: sum(payments.amount) })
    .from(payments)
    .where(eq(payments.userId, user.id));
  const totalPaid = Number(row?.total ?? 0);
  await sendMessage(chatId, accountText(user, sub, watched, totalPaid, isFree), { reply_markup: backToMenuKeyboard() });
}

export async function handleVideoRequest(chatId: number, user: User) {
  const rate = checkRateLimit(`video:${user.telegramId}`, 1, 3000);
  if (!rate.allowed) {
    await sendMessage(chatId, "⏳ Please wait a few seconds before requesting another video.");
    return;
  }
  const hourly = checkRateLimit(`video-hourly:${user.telegramId}`, 60, 60 * 60 * 1000);
  if (!hourly.allowed) {
    await sendMessage(chatId, "⏳ You've reached the hourly video limit. Please try again later.");
    return;
  }

  const isFree = await isFreeMode();
  if (!isFree) {
    const sub = await getCurrentSubscription(user.id);
    const isActive = Boolean(sub && sub.status === "active" && sub.expiresAt.getTime() > Date.now());
    if (!isActive) {
      const expiredMessage = await getSetting("EXPIRED_MESSAGE");
      const header = sub ? expiredMessage : "💎 You don't have an active subscription yet.\n\nChoose a plan to get started:";
      await sendPlans(chatId, header);
      return;
    }
  }

  // Send instant visual feedback to user in Telegram while video is fetched/dispatched
  sendChatAction(chatId, "upload_video").catch(() => {});

  const [{ video }, captionTemplate] = await Promise.all([
    getNextVideoForUser(user.id),
    getSetting("VIDEO_CAPTION_TEMPLATE"),
  ]);

  if (!video) {
    await sendMessage(chatId, WATCHED_ALL_TEXT, { reply_markup: backToMenuKeyboard() });
    return;
  }

  const caption =
    video.caption ||
    captionTemplate.replace("{sequence}", String(video.sequence));

  const sent = await sendVideoByFileId(chatId, video.telegramFileId, caption, {
    reply_markup: videoPlaybackKeyboard(),
  });

  if (sent) {
    // Record delivery in background without blocking response
    recordDelivery(user.id, video.id).catch((err) => {
      console.error("[bot] failed to record video delivery", err);
    });
  } else {
    await sendMessage(
      chatId,
      "⚠️ Sorry, we couldn't deliver the video right now. Please try again with /video in a moment.",
    );
  }
}

export async function handleBuyPlan(chatId: number, user: User, planId: number, callbackId: string) {
  const rate = checkRateLimit(`pay:${user.telegramId}`, 3, 60_000);
  if (!rate.allowed) {
    await answerCallbackQuery(callbackId, "Please wait a moment before trying again.", true);
    return;
  }

  const plan = await getPlanById(planId);
  if (!plan || !plan.isActive) {
    await answerCallbackQuery(callbackId, "This plan is no longer available.", true);
    return;
  }

  await answerCallbackQuery(callbackId, "Creating your payment link...");

  try {
    const payment = await createPaymentForPlan(user.id, planId);
    if (!payment.shortUrl) {
      await sendMessage(chatId, "⚠️ Could not create a payment link right now. Please try again shortly.");
      return;
    }
    await sendMessage(
      chatId,
      paymentInstructionsText(plan.name, plan.durationDays, Number(plan.price)),
      { reply_markup: payNowKeyboard(payment.shortUrl, payment.id) },
    );
  } catch (err) {
    console.error("[bot] createPaymentForPlan failed", err instanceof Error ? err.message : err);
    const msg = err instanceof PaymentError ? err.message : "⚠️ Payment service is temporarily unavailable. Please try again later.";
    await sendMessage(chatId, msg);
  }
}

export async function handleCheckPayment(chatId: number, user: User, paymentId: number, callbackId: string) {
  try {
    const payment = await getPaymentById(paymentId);
    if (!payment || payment.userId !== user.id) {
      await answerCallbackQuery(callbackId, "Payment not found.", true);
      return;
    }

    if (payment.status === "SUCCESS") {
      await answerCallbackQuery(callbackId, "Already confirmed ✅");
      return;
    }

    await answerCallbackQuery(callbackId, "Checking payment status...");
    const result = await pollAndFinalizePayment(paymentId);

    if ("status" in result) {
      if (result.status === "pending") {
        await sendMessage(chatId, "⏳ We haven't received your payment yet. If you've already paid, please wait a minute and try again.");
      } else if (result.status === "failed") {
        await sendMessage(chatId, "❌ This payment was not completed. Please start a new purchase with /plan.");
      } else {
        await sendMessage(chatId, "⚠️ Could not verify payment status right now. Please try again shortly.");
      }
      return;
    }

    const plan = payment.planId ? await getPlanById(payment.planId) : undefined;
    const expiresAt = result.subscriptionExpiresAt;
    if (plan && expiresAt) {
      await sendMessage(chatId, paymentSuccessText(plan.name, Number(payment.amount), expiresAt));
    } else {
      await sendMessage(chatId, "✅ Payment confirmed! Your subscription is now active.");
    }
  } catch (err) {
    console.error("[bot] handleCheckPayment failed", err instanceof Error ? err.message : err);
    await answerCallbackQuery(callbackId, "Something went wrong. Please try again.", true);
  }
}
