import type { InlineKeyboardMarkup } from "@/lib/telegram/client";
import type { Plan } from "@/lib/services/planService";

export function mainMenuKeyboard(isFreeMode: boolean = false): InlineKeyboardMarkup {
  if (isFreeMode) {
    return {
      inline_keyboard: [
        [{ text: "🎬 Watch Video (Free)", callback_data: "menu:watch_video" }],
        [{ text: "👤 My Account", callback_data: "menu:my_account" }],
        [{ text: "❓ Help", callback_data: "menu:help" }],
      ],
    };
  }

  return {
    inline_keyboard: [
      [{ text: "🎬 Watch Video", callback_data: "menu:watch_video" }],
      [{ text: "💎 Buy Premium", callback_data: "menu:buy_premium" }],
      [{ text: "👤 My Account", callback_data: "menu:my_account" }],
      [{ text: "📅 Subscription Status", callback_data: "menu:sub_status" }],
      [{ text: "❓ Help", callback_data: "menu:help" }],
    ],
  };
}

export function planEmoji(index: number): string {
  const emojis = ["🟢", "🔵", "🟣", "🟠", "🔴", "🟡"];
  return emojis[index % emojis.length];
}

export function plansKeyboard(plans: Plan[]): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...plans.map((plan) => [
        {
          text: `₹${Number(plan.price).toFixed(0)} • ${plan.durationDays === 1 ? "1 Day" : `${plan.durationDays} Days`}`,
          callback_data: `buy:${plan.id}`,
        },
      ]),
      [{ text: "⬅️ Back to Menu", callback_data: "menu:home" }],
    ],
  };
}

export function payNowKeyboard(paymentUrl: string, paymentId: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "💳 Pay Now", url: paymentUrl }],
      [{ text: "✅ I've Paid - Check Status", callback_data: `check_payment:${paymentId}` }],
      [{ text: "⬅️ Back to Plans", callback_data: "menu:buy_premium" }],
    ],
  };
}

export function backToMenuKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: "⬅️ Back to Menu", callback_data: "menu:home" }]],
  };
}

export function videoPlaybackKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "⏭ Next Video", callback_data: "video:next" }],
      [{ text: "🏠 Main Menu", callback_data: "menu:home" }],
    ],
  };
}
