// Central place to read environment variables. Nothing here should ever be
// logged or exposed to the client. Only DATABASE_URL is hard-required (and
// already validated in src/db/index.ts) so the app can boot even before the
// bot / payment gateway are fully configured.

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export const env = {
  get botToken() {
    return str("BOT_TOKEN");
  },
  get telegramWebhookSecret() {
    return str("TELEGRAM_WEBHOOK_SECRET");
  },
  get webhookUrl() {
    return str("WEBHOOK_URL");
  },
  get adminTelegramIds() {
    return str("ADMIN_TELEGRAM_IDS")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
  },
  get supportUsername() {
    return str("SUPPORT_USERNAME", "support");
  },

  get razorpayKeyId() {
    return str("RAZORPAY_KEY_ID");
  },
  get razorpayKeySecret() {
    return str("RAZORPAY_KEY_SECRET");
  },
  get razorpayWebhookSecret() {
    return str("RAZORPAY_WEBHOOK_SECRET");
  },

  get jwtSecret() {
    return str("JWT_SECRET", "insecure-dev-secret-change-me");
  },
  get setupSecret() {
    return str("SETUP_SECRET", "insecure-dev-setup-secret");
  },
  get cronSecret() {
    return str("CRON_SECRET", "insecure-dev-cron-secret");
  },

  get appUrl() {
    return str("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  },
};

export function isBotConfigured(): boolean {
  return env.botToken.length > 0;
}

export function isRazorpayConfigured(): boolean {
  return Boolean(env.razorpayKeyId && env.razorpayKeySecret);
}

export function isTelegramAdmin(telegramId: number): boolean {
  return env.adminTelegramIds.includes(telegramId);
}
