// Next.js instrumentation hook - runs once when the server process starts.
// We use it to schedule recurring background jobs (subscription expiry,
// reminders, stale payment cleanup) since this app runs as a persistent
// Node.js server (`next start`), not a serverless function.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const cron = await import("node-cron");
  const { runAllJobs } = await import("@/lib/cron/jobs");

  // Every 5 minutes: expire due subscriptions, send reminders, clean up
  // stale pending payments.
  cron.schedule("*/5 * * * *", () => {
    runAllJobs().catch((err) => console.error("[cron] runAllJobs failed", err));
  });

  console.log("[bot] Background job scheduler started (every 5 minutes).");

  // Best-effort: automatically (re)register the Telegram webhook on boot if
  // the bot and a public webhook URL are configured.
  try {
    const { isBotConfigured, env } = await import("@/lib/env");
    if (isBotConfigured() && env.webhookUrl && !env.webhookUrl.includes("localhost")) {
      const { setWebhook } = await import("@/lib/telegram/client");
      await setWebhook(`${env.webhookUrl}/api/telegram/webhook`, env.telegramWebhookSecret);
      console.log("[bot] Telegram webhook registered at boot.");
    }
  } catch (err) {
    console.error("[bot] failed to auto-register webhook", err);
  }
}
