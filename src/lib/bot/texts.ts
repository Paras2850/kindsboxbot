import { formatDate, formatCurrency } from "@/lib/format";
import type { User } from "@/lib/services/userService";
import type { SubscriptionWithPlan } from "@/lib/services/subscriptionService";

export function helpText(botName: string, supportUsername: string): string {
  return (
    `❓ <b>How ${botName} works</b>\n\n` +
    `1️⃣ Use /video to watch the next premium short video.\n` +
    `2️⃣ If you don't have an active subscription, you'll see our plans — pick one and pay securely via UPI/cards.\n` +
    `3️⃣ Once your payment is verified, your subscription activates automatically and you can keep using /video.\n` +
    `4️⃣ Every /video sends you a brand-new video you haven't seen yet.\n\n` +
    `<b>Commands</b>\n` +
    `/start - Main menu\n` +
    `/video - Watch next video\n` +
    `/plan - View subscription plans\n` +
    `/status - Your subscription status\n` +
    `/myaccount - Your account details\n` +
    `/support - Get help\n\n` +
    `Need more help? Contact @${supportUsername}`
  );
}

export function supportText(supportUsername: string): string {
  return (
    `🛠 <b>Support</b>\n\n` +
    `If you need help with payments, subscriptions, or videos, message our support team:\n\n` +
    `👉 @${supportUsername}\n\n` +
    `We usually reply within a few hours.`
  );
}

export function statusText(user: User, sub: SubscriptionWithPlan | null, videosWatched: number, isFreeMode = false): string {
  const isActive = Boolean(sub && sub.status === "active" && sub.expiresAt.getTime() > Date.now());
  const statusDisplay = isFreeMode
    ? "🎁 FREE MODE (No subscription required)"
    : isActive
    ? "✅ ACTIVE"
    : "❌ INACTIVE";

  const lines = [
    `👤 <b>Account</b>`,
    ``,
    `Telegram ID: <code>${user.telegramId}</code>`,
    `Subscription: ${statusDisplay}`,
  ];
  if (sub) {
    lines.push(`Plan: ${sub.planName ?? "-"}`);
    lines.push(`Started: ${formatDate(sub.startedAt)}`);
    lines.push(`Expires: ${formatDate(sub.expiresAt)}`);
  }
  lines.push(`Videos Watched: ${videosWatched}`);
  return lines.join("\n");
}

export function accountText(user: User, sub: SubscriptionWithPlan | null, videosWatched: number, totalPaid: number, isFreeMode = false): string {
  const isActive = Boolean(sub && sub.status === "active" && sub.expiresAt.getTime() > Date.now());
  const statusDisplay = isFreeMode
    ? "🎁 FREE MODE (No subscription required)"
    : isActive
    ? "✅ ACTIVE"
    : "❌ INACTIVE";

  const lines = [
    `👤 <b>My Account</b>`,
    ``,
    `Name: ${[user.firstName, user.lastName].filter(Boolean).join(" ") || "-"}`,
    `Username: ${user.username ? "@" + user.username : "-"}`,
    `Telegram ID: <code>${user.telegramId}</code>`,
    `Joined: ${formatDate(user.createdAt)}`,
    ``,
    `💎 Subscription: ${statusDisplay}`,
  ];
  if (sub) {
    lines.push(`Plan: ${sub.planName ?? "-"}`);
    lines.push(`Expires: ${formatDate(sub.expiresAt)}`);
  }
  lines.push(``, `🎬 Videos Watched: ${videosWatched}`, `💳 Total Paid: ${formatCurrency(totalPaid)}`);
  return lines.join("\n");
}

export function paymentInstructionsText(planName: string, durationDays: number, amount: number): string {
  return (
    `💎 <b>${planName}</b>\n\n` +
    `Amount: ${formatCurrency(amount)}\n` +
    `Access: ${durationDays === 1 ? "24 hours" : `${durationDays} days`}\n\n` +
    `Tap <b>Pay Now</b> below to complete your payment via UPI, card, or netbanking.\n\n` +
    `Once your payment is confirmed, your subscription will activate automatically and you'll receive a confirmation message here.`
  );
}

export function paymentSuccessText(planName: string, amount: number, expiresAt: Date): string {
  return (
    `✅ <b>Payment Successful!</b>\n\n` +
    `Plan: ${planName}\n` +
    `Amount: ${formatCurrency(amount)}\n` +
    `Valid Until: ${formatDateTimeLocal(expiresAt)}\n\n` +
    `Use /video anytime to watch your premium videos. Enjoy! 🎬`
  );
}

function formatDateTimeLocal(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export const WATCHED_ALL_TEXT =
  "🎬 You have watched all currently available videos.\n\nNew videos will be added soon.";

export const MAINTENANCE_TEXT = "🛠 Bot is currently under maintenance.\n\nPlease try again later.";

export const BLOCKED_TEXT = "🚫 You have been blocked from using this bot.\n\nContact support if you think this is a mistake.";
