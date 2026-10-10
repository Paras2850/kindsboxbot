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

  // Automatically synchronize Telegram webhook on boot if not already pointing to production URL.
  try {
    const { isBotConfigured, env } = await import("@/lib/env");
    if (
      isBotConfigured() &&
      env.webhookUrl &&
      !env.webhookUrl.includes("localhost") &&
      !env.webhookUrl.includes("your-domain.com") &&
      !env.webhookUrl.includes("example.com")
    ) {
      const { getWebhookInfo, setWebhook } = await import("@/lib/telegram/client");
      const currentInfo = (await getWebhookInfo().catch(() => null)) as { url?: string } | null;
      const targetUrl = `${env.webhookUrl}/api/telegram/webhook`;
      if (currentInfo?.url !== targetUrl) {
        await setWebhook(targetUrl, env.telegramWebhookSecret);
        console.log(`[bot] Telegram webhook synchronized to ${targetUrl}`);
      }
    }
  } catch (err) {
    console.error("[bot] failed to synchronize webhook", err);
  }
}
