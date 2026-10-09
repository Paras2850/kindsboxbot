import "dotenv/config";
import { deleteWebhook, getMe, getUpdates, setWebhook } from "../src/lib/telegram/client";
import { processUpdate } from "../src/lib/bot/router";
import { env } from "../src/lib/env";

async function main() {
  console.log("=========================================");
  console.log("🤖 Starting Telegram Bot in POLLING mode");
  console.log("=========================================");

  const me = await getMe() as any;
  if (!me) {
    console.error("❌ Failed to connect to Telegram API. Check BOT_TOKEN in .env");
    process.exit(1);
  }

  console.log(`✅ Logged in as @${me.username} (${me.first_name})`);

  // Clear existing webhook so getUpdates works without conflict
  console.log("⚠️ NOTICE: Polling mode clears the Telegram webhook while running.");
  console.log("🧹 Clearing webhook to enable local polling...");
  await deleteWebhook();
  console.log("🚀 Polling started. Listening for /start, /video, /plan, /status, etc. (Press Ctrl+C to stop)");

  let offset = 0;
  let running = true;

  const restoreWebhook = async () => {
    if (env.webhookUrl && !env.webhookUrl.includes("localhost")) {
      console.log(`🔄 Restoring production webhook to ${env.webhookUrl}/api/telegram/webhook...`);
      await setWebhook(`${env.webhookUrl}/api/telegram/webhook`, env.telegramWebhookSecret);
      console.log("✅ Production webhook restored successfully!");
    }
  };

  process.on("SIGINT", async () => {
    console.log("\n🛑 Stopping polling worker...");
    running = false;
    await restoreWebhook().catch(() => {});
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    running = false;
    await restoreWebhook().catch(() => {});
    process.exit(0);
  });

  while (running) {
    try {
      const updates = await getUpdates(offset, 100, 20);
      if (updates && updates.length > 0) {
        for (const update of updates) {
          offset = Math.max(offset, (update.update_id ?? 0) + 1);
        }
        await Promise.allSettled(
          updates.map((update) =>
            processUpdate(update).catch((err) => {
              console.error("[bot] error processing update:", err);
            }),
          ),
        );
      }
    } catch (err) {
      console.error("[polling error]:", err);
      // Wait 3 seconds before retry if there was a network glitch
      await new Promise((res) => setTimeout(res, 3000));
    }
  }
}

main().catch((err) => {
  console.error("Fatal polling error:", err);
  process.exit(1);
});

