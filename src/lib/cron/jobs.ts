import { expireDueSubscriptions, findSubscriptionsNeedingReminder, markReminded } from "@/lib/services/subscriptionService";
import { expireStalePayments } from "@/lib/services/paymentService";
import { notifyUser } from "@/lib/services/notificationService";
import { formatDate } from "@/lib/format";

export async function runSubscriptionExpiryJob() {
  const expired = await expireDueSubscriptions();
  for (const { telegramId } of expired) {
    await notifyUser(
      telegramId,
      "❌ Your subscription has expired.\n\nUse /plan to choose a new plan and keep watching premium videos.",
    );
  }
  if (expired.length > 0) {
    console.log(`[cron] expired ${expired.length} subscription(s)`);
  }
  return expired.length;
}

export async function runExpiryReminderJob() {
  const needsReminder = await findSubscriptionsNeedingReminder(24);
  for (const row of needsReminder) {
    await notifyUser(
      row.telegramId,
      `⏰ Your ${row.planName ?? "premium"} subscription is expiring soon on ${formatDate(row.sub.expiresAt)}.\n\nUse /plan to renew and avoid interruption.`,
    );
    await markReminded(row.sub.id);
  }
  if (needsReminder.length > 0) {
    console.log(`[cron] sent ${needsReminder.length} expiry reminder(s)`);
  }
  return needsReminder.length;
}

export async function runPaymentCleanupJob() {
  const count = await expireStalePayments(30);
  if (count > 0) {
    console.log(`[cron] expired ${count} stale pending payment(s)`);
  }
  return count;
}

export async function runAllJobs() {
  const [expired, reminders, cleaned] = await Promise.all([
    runSubscriptionExpiryJob().catch((err) => {
      console.error("[cron] subscription expiry job failed", err);
      return 0;
    }),
    runExpiryReminderJob().catch((err) => {
      console.error("[cron] expiry reminder job failed", err);
      return 0;
    }),
    runPaymentCleanupJob().catch((err) => {
      console.error("[cron] payment cleanup job failed", err);
      return 0;
    }),
  ]);
  return { expired, reminders, cleaned };
}
