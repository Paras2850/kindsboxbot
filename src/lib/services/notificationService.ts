import { db } from "@/db";
import { subscriptions, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { sendMessage } from "@/lib/telegram/client";
import { getSetting } from "@/lib/services/settingsService";

const MESSAGES_PER_SECOND = 25;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function notifyUser(telegramId: number, text: string) {
  await sendMessage(telegramId, text);
}

export async function getAudienceTelegramIds(audience: "all" | "active" | "expired"): Promise<number[]> {
  if (audience === "all") {
    const rows = await db.select({ telegramId: users.telegramId }).from(users).where(eq(users.isBlocked, false));
    return rows.map((r) => r.telegramId);
  }

  const rows = await db
    .select({ telegramId: users.telegramId })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(and(eq(subscriptions.status, audience === "active" ? "active" : "expired"), eq(users.isBlocked, false)));

  // de-duplicate since a user may have multiple historical subscription rows
  return Array.from(new Set(rows.map((r) => r.telegramId)));
}

export interface BroadcastProgress {
  total: number;
  success: number;
  failed: number;
}

export async function sendBroadcast(
  telegramIds: number[],
  message: string,
  onProgress?: (p: BroadcastProgress) => Promise<void> | void,
): Promise<BroadcastProgress> {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < telegramIds.length; i++) {
    const result = await sendMessage(telegramIds[i], message);
    if (result) success++;
    else failed++;

    if ((i + 1) % MESSAGES_PER_SECOND === 0) {
      await sleep(1000);
    }
    if (onProgress && (i + 1) % 10 === 0) {
      await onProgress({ total: telegramIds.length, success, failed });
    }
  }

  if (onProgress) await onProgress({ total: telegramIds.length, success, failed });
  return { total: telegramIds.length, success, failed };
}

let newVideoNotifyTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounces "new video available" notifications so a bulk upload of many videos only triggers one message. */
export function scheduleNewVideoNotification() {
  if (newVideoNotifyTimer) clearTimeout(newVideoNotifyTimer);
  newVideoNotifyTimer = setTimeout(async () => {
    newVideoNotifyTimer = null;
    try {
      const enabled = await getSetting("NOTIFY_NEW_VIDEO");
      if (enabled !== "true") return;
      const ids = await getAudienceTelegramIds("active");
      if (ids.length === 0) return;
      await sendBroadcast(
        ids,
        "🎬 <b>NEW VIDEO AVAILABLE!</b>\n\nA new premium video has been added.\n\nUse /video to watch it.",
      );
    } catch (err) {
      console.error("[notify] failed to send new video notification", err instanceof Error ? err.message : err);
    }
  }, 15_000);
  newVideoNotifyTimer.unref?.();
}
